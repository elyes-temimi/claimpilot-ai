import Tesseract from 'tesseract.js';

export interface OcrResult {
  fullName: string;
  dob: string;
  cinNumber: string;
  address: string;
  confidence: number;
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

    // Parse the extracted text
    const result = side === 'front' 
      ? parseFrontSide(text) 
      : parseBackSide(text);

    // Cleanup
    await worker.terminate();

    return {
      ...result,
      confidence: data.confidence,
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
 * Parse front side of Tunisian CIN
 * Contains: Full name, Date of birth, CIN number
 */
function parseFrontSide(text: string): Omit<OcrResult, 'confidence'> {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  let fullName = '';
  let dob = '';
  let cinNumber = '';

  // Try to find CIN number (8 digits)
  const cinMatch = text.match(/\b\d{8}\b/);
  if (cinMatch) {
    cinNumber = cinMatch[0];
  }

  // Try to find date of birth (format: DD/MM/YYYY or DD-MM-YYYY)
  const dobMatch = text.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (dobMatch) {
    dob = `${dobMatch[1]}/${dobMatch[2]}/${dobMatch[3]}`;
  }

  // Try to find full name (usually the longest Arabic or French text line)
  // Look for lines with actual letters (not just numbers/symbols)
  const nameLines = lines.filter(line => {
    // Check if line contains Arabic or French letters
    const hasLetters = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z]/.test(line);
    // Exclude lines that are mostly numbers or very short
    const notMostlyNumbers = !/^\d+$/.test(line);
    const longEnough = line.length > 5;
    return hasLetters && notMostlyNumbers && longEnough;
  });

  if (nameLines.length > 0) {
    // Take the longest line as the name
    fullName = nameLines.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    , '');
  }

  return {
    fullName: cleanText(fullName),
    dob,
    cinNumber,
    address: '',
  };
}

/**
 * Parse back side of Tunisian CIN
 * Contains: Address
 */
function parseBackSide(text: string): Omit<OcrResult, 'confidence'> {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // The back usually contains the address
  // Look for lines with actual content (not just labels)
  const addressLines = lines.filter(line => {
    const hasLetters = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z]/.test(line);
    const longEnough = line.length > 10;
    // Exclude common label words
    const notLabel = !/(adresse|address|عنوان)/i.test(line);
    return hasLetters && longEnough && notLabel;
  });

  const address = addressLines.join(', ');

  return {
    fullName: '',
    dob: '',
    cinNumber: '',
    address: cleanText(address),
  };
}

/**
 * Clean extracted text (remove extra spaces, special chars)
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Multiple spaces → single space
    .replace(/[|_]/g, '') // Remove common OCR artifacts
    .trim();
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
