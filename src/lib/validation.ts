// Contrôle de saisie — upload validation for the profile / CIN step.
//
// Two jobs:
//  1. Reject files that are not what they claim to be. The browser's reported
//     MIME type comes from the file extension and is trivially spoofed, so we
//     sniff magic bytes instead.
//  2. Reject images OCR will fail on *before* the user waits 20s for a bad
//     read — too small, too blurry, too dark, or blown out by flash glare.
//
// Errors block the upload. Warnings let it through with a visible caution:
// a slightly soft photo of a real CIN still beats forcing a retake.

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string; // French — this is what the user reads
}

export interface ImageQuality {
  width: number;
  height: number;
  sharpness: number; // variance of Laplacian, higher = crisper
  brightness: number; // mean luminance 0..255
  glareRatio: number; // fraction of near-white blown-out pixels
  darkRatio: number; // fraction of near-black pixels
}

export interface ValidationResult {
  ok: boolean; // no errors (warnings may still be present)
  issues: ValidationIssue[];
  quality: ImageQuality | null;
  detectedType: string | null;
}

// --- limits -----------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_BYTES = 12 * 1024; // below this it's a thumbnail, not a document
const MIN_WIDTH = 640;
const MIN_HEIGHT = 400;

// Tuned against real phone photos of ID cards: below ~55 the text smears in OCR.
const SHARPNESS_ERROR = 22;
const SHARPNESS_WARN = 55;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;

// --- magic-byte sniffing ----------------------------------------------------

/** Identify a file by its actual header, not by its extension. */
export async function sniffType(file: Blob): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  // RIFF....WEBP
  if (startsWith(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42) {
    return 'image/webp';
  }
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  return null;
}

// --- image quality ----------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image illisible'));
    img.src = src;
  });
}

/**
 * Measure sharpness, exposure and glare.
 *
 * Sharpness is the variance of the Laplacian — the standard cheap focus
 * metric. A blurred photo has little high-frequency energy, so the second
 * derivative stays near zero and its variance collapses.
 */
export async function measureQuality(dataUrl: string): Promise<ImageQuality> {
  const img = await loadImage(dataUrl);

  // Analyse at a fixed width so the thresholds mean the same thing regardless
  // of whether the phone shot 4032px or 800px.
  const w = 480;
  const h = Math.max(1, Math.round((img.height / img.width) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  let sum = 0;
  let glare = 0;
  let dark = 0;
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    sum += g;
    if (g > 246) glare++;
    if (g < 18) dark++;
  }
  const brightness = sum / (w * h);

  // 4-neighbour Laplacian
  let lapSum = 0;
  let lapSqSum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap;
      lapSqSum += lap * lap;
      n++;
    }
  }
  const mean = lapSum / Math.max(1, n);
  const sharpness = Math.sqrt(Math.max(0, lapSqSum / Math.max(1, n) - mean * mean));

  return {
    width: img.width,
    height: img.height,
    sharpness: Math.round(sharpness * 10) / 10,
    brightness: Math.round(brightness),
    glareRatio: Math.round((glare / (w * h)) * 1000) / 1000,
    darkRatio: Math.round((dark / (w * h)) * 1000) / 1000,
  };
}

// --- the full check ---------------------------------------------------------

/**
 * Validate a document upload end to end.
 * @param file    the picked File
 * @param dataUrl the same file already read as a data URL (for pixel checks)
 */
export async function validateDocumentUpload(file: File, dataUrl: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const push = (level: IssueLevel, code: string, message: string) => issues.push({ level, code, message });

  // 1. Size
  if (file.size > MAX_BYTES) {
    push('error', 'too_large', `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, maximum 8 Mo).`);
  }
  if (file.size < MIN_BYTES) {
    push('error', 'too_small_file', 'Fichier trop petit pour être une photo de document lisible.');
  }

  // 2. Real type, not the claimed one
  const detectedType = await sniffType(file);
  if (detectedType === 'application/pdf') {
    push('error', 'pdf_not_supported', 'Les PDF ne sont pas acceptés ici — envoyez une photo de la carte.');
  } else if (!detectedType) {
    push('error', 'unknown_type', "Format de fichier non reconnu. Utilisez une photo JPEG, PNG ou WEBP.");
  } else if (!ACCEPTED.includes(detectedType as (typeof ACCEPTED)[number])) {
    push('error', 'bad_type', `Format ${detectedType} non accepté. Utilisez JPEG, PNG ou WEBP.`);
  } else if (file.type && file.type !== detectedType) {
    // Extension lies about the content — worth surfacing, not worth blocking.
    push('warning', 'type_mismatch', `L'extension du fichier (${file.type}) ne correspond pas à son contenu réel (${detectedType}).`);
  }

  // Pixel checks only make sense if it really is an image
  let quality: ImageQuality | null = null;
  if (!issues.some((i) => i.level === 'error')) {
    try {
      quality = await measureQuality(dataUrl);
    } catch {
      push('error', 'unreadable', "L'image n'a pas pu être lue.");
    }
  }

  if (quality) {
    if (quality.width < MIN_WIDTH || quality.height < MIN_HEIGHT) {
      push(
        'error',
        'low_resolution',
        `Résolution insuffisante (${quality.width}×${quality.height}). Minimum ${MIN_WIDTH}×${MIN_HEIGHT} pour lire la CIN.`
      );
    }

    if (quality.sharpness < SHARPNESS_ERROR) {
      push('error', 'blurry', 'Photo trop floue — la lecture automatique échouera. Reprenez la photo bien à plat.');
    } else if (quality.sharpness < SHARPNESS_WARN) {
      push('warning', 'soft_focus', 'Photo un peu floue — la lecture peut être partielle.');
    }

    if (quality.glareRatio > 0.06) {
      push('warning', 'glare', 'Reflet important détecté (flash ou lumière directe) — une partie du texte peut être illisible.');
    }
    if (quality.brightness < 55) {
      push('warning', 'too_dark', 'Photo sombre — rapprochez-vous d\'une source de lumière.');
    } else if (quality.brightness > 225) {
      push('warning', 'overexposed', 'Photo surexposée — le texte risque de disparaître.');
    }
    if (quality.darkRatio > 0.55) {
      push('warning', 'mostly_dark', 'La carte occupe une petite partie de l\'image — cadrez-la de plus près.');
    }
  }

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    quality,
    detectedType,
  };
}

// --- field-level contrôle de saisie -----------------------------------------

/** Tunisian plate: "123 TU 4567", also RS / أ ت plates. Tolerant of spacing. */
export function validatePlate(value: string): ValidationIssue | null {
  const v = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!v) return { level: 'error', code: 'plate_required', message: "Le numéro d'immatriculation est obligatoire." };
  const standard = /^\d{1,3}\s*(TU|TN)\s*\d{1,4}$/.test(v);
  const rs = /^RS\s*\d{1,6}$/.test(v);
  if (!standard && !rs) {
    return {
      level: 'warning',
      code: 'plate_format',
      message: 'Format inhabituel — attendu « 123 TU 4567 » ou « RS 12345 ».',
    };
  }
  return null;
}

/** Tunisian mobile: 8 digits starting 2/4/5/9 (mobile) or 7 (fixed). */
export function validatePhone(value: string): ValidationIssue | null {
  const digits = value.replace(/[\s.+-]/g, '').replace(/^216/, '');
  if (!digits) return { level: 'error', code: 'phone_required', message: 'Le numéro de téléphone est obligatoire.' };
  if (!/^\d{8}$/.test(digits)) {
    return { level: 'error', code: 'phone_length', message: 'Le numéro doit contenir 8 chiffres.' };
  }
  if (!/^[24579]/.test(digits)) {
    return { level: 'warning', code: 'phone_prefix', message: 'Préfixe inhabituel pour un numéro tunisien.' };
  }
  return null;
}

/** The CIN typed by hand must match what we read from the card. */
export function validateCinField(typed: string, ocrValue?: string): ValidationIssue | null {
  const v = typed.replace(/\D/g, '');
  if (!v) return { level: 'error', code: 'cin_required', message: 'Le numéro de CIN est obligatoire.' };
  if (v.length !== 8) {
    return { level: 'error', code: 'cin_length', message: 'Le numéro de CIN doit contenir exactement 8 chiffres.' };
  }
  if (/^(\d)\1{7}$/.test(v)) {
    return { level: 'error', code: 'cin_invalid', message: 'Numéro de CIN invalide.' };
  }
  if (ocrValue && ocrValue.length === 8 && ocrValue !== v) {
    return {
      level: 'warning',
      code: 'cin_mismatch',
      message: `Le numéro saisi (${v}) diffère de celui lu sur la carte (${ocrValue}).`,
    };
  }
  return null;
}
