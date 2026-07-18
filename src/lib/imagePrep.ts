// Image preprocessing for OCR of a physical ID card.
//
// Tesseract does well on a flat, evenly lit scan and badly on a phone photo of
// a laminated card. Measured on a realistic capture (tilt + glare + low
// contrast + desk background), raw OCR recovered only the CIN digits; the
// Arabic name and date lines came out as noise.
//
// The chain below was validated against that image before being written here:
//
//   1. crop to the card      — the desk around it becomes amplified speckle
//                              that Tesseract reads as thousands of characters
//   2. upscale               — Arabic strokes and dots need pixels
//   3. median filter         — kill sensor speckle BEFORE it gets amplified
//   4. flatten illumination  — divide out a blurred background estimate; this
//                              removes the glare hotspot and light falloff
//                              that destroy local contrast
//   5. percentile stretch    — gentle, so paper grain doesn't become ink
//   6. unsharp mask          — recrisp the strokes
//
// Step 1 and step 3 are the ones that matter most: without them, flattening
// turns the background into a field of fake text.

const TARGET_WIDTH = 1800;

export interface PrepResult {
  dataUrl: string;
  /** Card bounds found in the source image, null if detection was skipped. */
  crop: { x: number; y: number; w: number; h: number } | null;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image could not be decoded'));
    img.src = src;
  });
}

/** Otsu's method — the threshold that best separates card from background. */
function otsu(hist: Uint32Array, total: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let w0 = 0;
  let cum = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    w0 += hist[t];
    if (w0 === 0 || w0 === total) continue;
    cum += t * hist[t];
    const m0 = cum / w0;
    const m1 = (sumAll - cum) / (total - w0);
    const v = w0 * (total - w0) * (m0 - m1) ** 2;
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return best;
}

/**
 * Locate the card: the large bright region against a darker background.
 * Row/column coverage profiles are far more robust on a noisy phone shot than
 * contour finding, and a card normally fills much of the frame.
 */
function findCard(
  gray: Float32Array,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } | null {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const t = otsu(hist, gray.length);

  const rowCov = new Float32Array(h);
  const colCov = new Float32Array(w);
  let bright = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] > t) {
        rowCov[y]++;
        colCov[x]++;
        bright++;
      }
    }
  }
  // Too little bright area means no clear card — leave the frame alone.
  if (bright / gray.length < 0.05) return null;

  const rows: number[] = [];
  for (let y = 0; y < h; y++) if (rowCov[y] / w > 0.3) rows.push(y);
  const cols: number[] = [];
  for (let x = 0; x < w; x++) if (colCov[x] / h > 0.3) cols.push(x);
  if (rows.length < 2 || cols.length < 2) return null;

  const padY = h * 0.01;
  const padX = w * 0.01;
  const x0 = Math.max(0, Math.floor(cols[0] - padX));
  const y0 = Math.max(0, Math.floor(rows[0] - padY));
  const x1 = Math.min(w, Math.ceil(cols[cols.length - 1] + 1 + padX));
  const y1 = Math.min(h, Math.ceil(rows[rows.length - 1] + 1 + padY));

  const cw = x1 - x0;
  const ch = y1 - y0;
  // Reject a "card" that is basically the whole frame or a sliver.
  if (cw < w * 0.2 || ch < h * 0.2 || (cw > w * 0.97 && ch > h * 0.97)) return null;
  return { x: x0, y: y0, w: cw, h: ch };
}

/** 3x3 median — removes speckle without softening strokes the way a blur does. */
function median3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  const win: number[] = new Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[y * w + x] = src[y * w + x];
        continue;
      }
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) win[k++] = src[(y + dy) * w + x + dx];
      }
      win.sort((a, b) => a - b);
      out[y * w + x] = win[4];
    }
  }
  return out;
}

/**
 * Large-radius box blur via a summed-area table — O(n) regardless of radius,
 * which matters because the background estimate needs a very wide kernel.
 */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + rowSum;
    }
  }
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  const hist = new Uint32Array(1024);
  for (let i = 0; i < values.length; i++) {
    hist[Math.max(0, Math.min(1023, Math.round((values[i] / 255) * 1023)))]++;
  }
  const target = values.length * p;
  let acc = 0;
  for (let i = 0; i < 1024; i++) {
    acc += hist[i];
    if (acc >= target) return (i / 1023) * 255;
  }
  return 255;
}

/**
 * Clean up a photo of an ID card so Tesseract has a chance.
 * Returns a grayscale, illumination-corrected, upscaled data URL.
 */
export async function preprocessForOcr(dataUrl: string): Promise<PrepResult> {
  const img = await loadImage(dataUrl);

  // --- pass 1: find the card on a downscaled grayscale copy ---
  const sw = Math.min(600, img.width);
  const sh = Math.max(1, Math.round((img.height / img.width) * sw));
  const sc = document.createElement('canvas');
  sc.width = sw;
  sc.height = sh;
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, sw, sh);
  const sdata = sctx.getImageData(0, 0, sw, sh).data;
  const sgray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    sgray[i] = 0.299 * sdata[i * 4] + 0.587 * sdata[i * 4 + 1] + 0.114 * sdata[i * 4 + 2];
  }
  const cardSmall = findCard(sgray, sw, sh);

  const scale = img.width / sw;
  const crop = cardSmall
    ? {
        x: Math.round(cardSmall.x * scale),
        y: Math.round(cardSmall.y * scale),
        w: Math.round(cardSmall.w * scale),
        h: Math.round(cardSmall.h * scale),
      }
    : { x: 0, y: 0, w: img.width, h: img.height };

  // --- pass 2: crop + upscale to a size Tesseract can work with ---
  const outW = Math.max(crop.w, Math.min(TARGET_WIDTH, crop.w * 3));
  const outH = Math.max(1, Math.round((crop.h / crop.w) * outW));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);

  const imgData = ctx.getImageData(0, 0, outW, outH);
  const px = imgData.data;
  let gray = new Float32Array(outW * outH);
  for (let i = 0; i < outW * outH; i++) {
    gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }

  // --- denoise, then flatten illumination ---
  gray = median3(gray, outW, outH);

  const radius = Math.max(15, Math.round(outW * 0.035));
  const bg = boxBlur(gray, outW, outH, radius);

  const flat = new Float32Array(gray.length);
  let maxFlat = 1e-6;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] / Math.max(bg[i], 1);
    flat[i] = v;
    if (v > maxFlat) maxFlat = v;
  }
  for (let i = 0; i < flat.length; i++) flat[i] = (flat[i] / maxFlat) * 255;

  // --- gentle contrast stretch ---
  const lo = percentile(flat, 0.05);
  const hi = percentile(flat, 0.99);
  const span = Math.max(hi - lo, 1);
  const stretched = new Float32Array(flat.length);
  for (let i = 0; i < flat.length; i++) {
    stretched[i] = Math.max(0, Math.min(255, ((flat[i] - lo) / span) * 255));
  }

  // --- unsharp mask ---
  const soft = boxBlur(stretched, outW, outH, 2);
  for (let i = 0; i < stretched.length; i++) {
    const v = Math.max(0, Math.min(255, stretched[i] + 1.1 * (stretched[i] - soft[i])));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    crop: cardSmall ? crop : null,
    width: outW,
    height: outH,
  };
}
