// Vision AI — in-browser damage analysis.
//
// Real signal processing, no cloud calls: we compute Sobel gradients over the
// photo, then score each block by *gradient orientation entropy* weighted by
// magnitude. Smooth panels and straight body lines have coherent edge
// directions; crumpled metal, dents and scratch clusters are chaotic. High
// entropy × high magnitude ⇒ damage texture. (Production would swap in a
// trained CNN — the pipeline and UX stay identical.)

export type Severity = 'minor' | 'moderate' | 'severe';

export interface DamageAnalysis {
  severity: Severity;
  damageRatio: number; // 0..1 fraction of frame showing damage texture
  regionCount: number;
  heatmapDataUrl: string; // original photo + damage overlay
  confidence: number; // 0..1 — how separable damage blocks were from the rest
  /** Normalized bounding box of detected damage (0..1 coords), null if none. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

const GRID = 14; // analysis blocks per axis (14x14)
const TARGET_W = 420;

export async function analyzeDamage(imageDataUrl: string): Promise<DamageAnalysis> {
  const img = await loadImage(imageDataUrl);
  const scale = TARGET_W / img.width;
  const w = TARGET_W;
  const h = Math.max(80, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Sobel gradients
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      ang[i] = Math.atan2(gy, gx); // -PI..PI
    }
  }

  // Per-block orientation-entropy × magnitude score
  const bw = Math.floor(w / GRID);
  const bh = Math.floor(h / GRID);
  const scores = new Float32Array(GRID * GRID);
  const BINS = 8;
  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const hist = new Float32Array(BINS);
      let total = 0;
      let meanMag = 0;
      let meanLum = 0;
      let count = 0;
      let strongPx = 0;
      for (let y = by * bh; y < (by + 1) * bh && y < h; y++) {
        for (let x = bx * bw; x < (bx + 1) * bw && x < w; x++) {
          const i = y * w + x;
          const m = mag[i];
          meanMag += m;
          meanLum += gray[i];
          count++;
          if (m > 34) {
            strongPx++;
            // fold angle to 0..PI (edges are directionless)
            let a = ang[i];
            if (a < 0) a += Math.PI;
            const bin = Math.min(BINS - 1, Math.floor((a / Math.PI) * BINS));
            hist[bin] += m;
            total += m;
          }
        }
      }
      meanMag /= Math.max(1, count);
      meanLum /= Math.max(1, count);
      let entropy = 0;
      if (total > 0) {
        for (let b = 0; b < BINS; b++) {
          const p = hist[b] / total;
          if (p > 0) entropy -= p * Math.log2(p);
        }
        entropy /= Math.log2(BINS); // normalize 0..1
      }
      // Chaotic strong edges score high; faint or coherent areas score low.
      // Damage is *dense* chaos: a lone curved body line is thin (low density)
      // and directionally coherent (low entropy²); crumpled metal is neither.
      // Near-black (tyres, shadows) and blown-out (sky) blocks are suppressed.
      const density = Math.min(1, strongPx / (count * 0.22));
      const lumGate = meanLum < 34 || meanLum > 238 ? 0.25 : 1;
      scores[by * GRID + bx] = entropy * entropy * Math.min(1, meanMag / 58) * density * lumGate;
    }
  }

  // Threshold: mean + 1.1σ, with a floor so clean photos stay clean
  let mean = 0;
  for (const s of scores) mean += s;
  mean /= scores.length;
  let variance = 0;
  for (const s of scores) variance += (s - mean) ** 2;
  const std = Math.sqrt(variance / scores.length);
  const threshold = Math.max(0.45, mean + 1.1 * std);

  const rawDamaged: boolean[] = Array.from(scores, (s) => s > threshold);

  // Connected regions (4-neighbour flood fill), then drop straggler blocks:
  // real damage is one or two coherent clusters, not confetti.
  const seen = new Array(rawDamaged.length).fill(false);
  const regions: number[][] = [];
  for (let i = 0; i < rawDamaged.length; i++) {
    if (!rawDamaged[i] || seen[i]) continue;
    const blocks: number[] = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const j = stack.pop()!;
      blocks.push(j);
      const jx = j % GRID;
      const jy = Math.floor(j / GRID);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx;
        const ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const n = ny * GRID + nx;
        if (rawDamaged[n] && !seen[n]) {
          seen[n] = true;
          stack.push(n);
        }
      }
    }
    regions.push(blocks);
  }
  const largest = regions.reduce((m, r) => Math.max(m, r.length), 0);
  const kept = regions.filter((r) => r.length >= Math.max(2, largest * 0.34));
  const damaged: boolean[] = new Array(rawDamaged.length).fill(false);
  for (const r of kept) for (const b of r) damaged[b] = true;
  const regionCount = kept.length;
  const damagedCount = kept.reduce((s, r) => s + r.length, 0);
  const damageRatio = damagedCount / damaged.length;

  // Heatmap overlay
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.drawImage(canvas, 0, 0);
  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const s = scores[by * GRID + bx];
      if (s > threshold) {
        const alpha = Math.min(0.55, 0.18 + (s - threshold) * 1.6);
        octx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
        octx.fillRect(bx * bw, by * bh, bw, bh);
      }
    }
  }
  octx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
  octx.lineWidth = 2;
  // outline the damaged area bounding box for a clean look
  let bbox: DamageAnalysis['bbox'] = null;
  if (damagedCount > 0) {
    let minX = GRID, minY = GRID, maxX = 0, maxY = 0;
    for (let i = 0; i < damaged.length; i++) {
      if (!damaged[i]) continue;
      const x = i % GRID;
      const y = Math.floor(i / GRID);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    octx.strokeRect(minX * bw + 1, minY * bh + 1, (maxX - minX + 1) * bw - 2, (maxY - minY + 1) * bh - 2);
    bbox = {
      x0: Math.round((minX / GRID) * 100) / 100,
      y0: Math.round((minY / GRID) * 100) / 100,
      x1: Math.round(((maxX + 1) / GRID) * 100) / 100,
      y1: Math.round(((maxY + 1) / GRID) * 100) / 100,
    };
  }

  const severity: Severity = damageRatio > 0.075 ? 'severe' : damageRatio > 0.02 ? 'moderate' : 'minor';
  const confidence = Math.max(0.4, Math.min(0.97, 0.5 + (std / Math.max(0.05, mean)) * 0.25));

  return {
    severity,
    damageRatio: Math.round(damageRatio * 1000) / 1000,
    regionCount,
    heatmapDataUrl: out.toDataURL('image/jpeg', 0.85),
    confidence: Math.round(confidence * 100) / 100,
    bbox,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Small JPEG thumbnail for syncing over the session socket. */
export async function makeThumb(dataUrl: string, width = 130): Promise<string> {
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(40, Math.round((img.height / img.width) * width));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
