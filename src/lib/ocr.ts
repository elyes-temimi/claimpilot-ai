import { createWorker } from 'tesseract.js';
import type { IdFields } from '../types';

export interface OcrOutcome {
  text: string;
  fields: IdFields;
}

/** Extract structured identity fields from raw OCR text. */
export function parseIdFields(raw: string): IdFields {
  const text = raw.toUpperCase();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let fullName = '';
  let dob = '';
  let idNumber = '';

  for (const line of lines) {
    if (!fullName) {
      const m = line.match(/(?:NAME|NOM)\s*[:;.]?\s*([A-Z][A-Z\s'-]{2,40})/);
      if (m) fullName = m[1].trim();
    }
    if (!dob) {
      const m = line.match(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
      if (m && /BIRTH|NAISSANCE|DOB|NE/.test(line)) dob = m[1].replace(/[.-]/g, '/');
    }
    if (!idNumber) {
      const m = line.match(/(?:ID|CIN|NO|N°)[\s.:]*(\d{7,10})\b/);
      if (m) idNumber = m[1];
    }
  }
  // Fallbacks: any date / any 8-digit number anywhere in the text
  if (!dob) {
    const m = text.match(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
    if (m) dob = m[1].replace(/[.-]/g, '/');
  }
  if (!idNumber) {
    const m = text.match(/\b(\d{8})\b/);
    if (m) idNumber = m[1];
  }

  // Title-case the name for display
  fullName = fullName
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return { fullName, dob, idNumber };
}

/**
 * Run OCR on an image (dataURL) and parse identity fields.
 * onProgress receives 0..100.
 */
export async function runOcr(imageDataUrl: string, onProgress: (pct: number) => void): Promise<OcrOutcome> {
  const worker = await createWorker('eng+fra', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(imageDataUrl);
    return { text: data.text, fields: parseIdFields(data.text) };
  } finally {
    await worker.terminate();
  }
}

/** Compute age in years from a dd/mm/yyyy or yyyy-mm-dd date string. */
export function ageFromDob(dob: string): number | null {
  let d: Date | null = null;
  let m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  else {
    m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age--;
  return age >= 16 && age <= 100 ? age : null;
}
