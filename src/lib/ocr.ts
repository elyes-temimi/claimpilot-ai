import Tesseract from 'tesseract.js';
import { parseCin, type CinFields } from './cin';

export interface OcrResult {
  fullName: string;
  dob: string;
  cinNumber: string;
  address: string;
  confidence: number;
  /** Everything the Tunisian CIN parser recovered, beyond the four legacy fields. */
  fields?: CinFields;
}

/**
 * Extract text from CIN using Tesseract OCR
 * Supports Arabic and French text
 */
export async function extractCinData(
  imageData: string,
  side: 'front' | 'back',
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  try {
    // Initialize Tesseract with Arabic and French
    const worker = await Tesseract.createWorker('ara+fra', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress * 100);
        }
      },
    });

    // Perform OCR
    const { data } = await worker.recognize(imageData);
    const text = data.text;

    console.log('OCR Text:', text);

    // Label-driven parse against the real Tunisian CIN layout (اللقب / الاسم /
    // تاريخ الولادة / مكانها on the front, اسم ولقب الأم / العنوان on the back).
    // The old heuristic took the longest line as the name, which on this card
    // is the "الجمهورية التونسية" header.
    const fields = parseCin(text, side);

    // Cleanup
    await worker.terminate();

    return {
      // Prefer the Latin-script name when the card carries one, else Arabic.
      fullName: fields.fullNameFr || fields.fullNameAr,
      dob: fields.dob,
      cinNumber: fields.cin,
      address: fields.address,
      // Tesseract's own 0-100 score reflects glyph confidence, not whether we
      // found the fields that matter — report the lower of the two.
      confidence: Math.min(data.confidence, fields.confidence * 100),
      fields,
    };
  } catch (error) {
    console.error('OCR Error:', error);
    // Return empty result on error
    return {
      fullName: '',
      dob: '',
      cinNumber: '',
      address: '',
      confidence: 0,
    };
  }
}

/**
 * Validate CIN number format
 */
export function validateCinNumber(cin: string): boolean {
  // Tunisian CIN: 8 digits
  return /^\d{8}$/.test(cin);
}

/**
 * Validate date of birth format
 */
export function validateDateOfBirth(dob: string): boolean {
  // Format: DD/MM/YYYY
  const match = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);

  // Basic validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;

  // Check if person is at least 18 years old
  const birthDate = new Date(year, month - 1, day);
  const age = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  
  return age >= 18 && age < 120;
}

/**
 * Validate full name (must contain letters, not just numbers)
 */
export function validateFullName(name: string): boolean {
  // Must have at least 2 words and contain letters (Arabic or Latin)
  const hasLetters = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z]/.test(name);
  const words = name.trim().split(/\s+/);
  return hasLetters && words.length >= 2 && name.length >= 5;
}

/**
 * Run OCR on a document image and return the minimal fields shape used by the app
 */
export async function runOcr(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<{ fields: { fullName: string; dob: string; idNumber: string }; confidence: number }> {
  const res = await extractCinData(imageData, 'front', onProgress);
  return {
    fields: {
      fullName: res.fullName || '',
      dob: res.dob || '',
      idNumber: res.cinNumber || '',
    },
    confidence: res.confidence || 0,
  };
}

/**
 * Compute age in whole years from a DOB string (expects DD/MM/YYYY or DD-MM-YYYY)
 */
export function ageFromDob(dob: string): number {
  if (!dob) return 0;
  const m = dob.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (!m) return 0;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const b = new Date(year, month, day);
  if (isNaN(b.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const mth = now.getMonth() - b.getMonth();
  if (mth < 0 || (mth === 0 && now.getDate() < b.getDate())) age--;
  return age;
}
