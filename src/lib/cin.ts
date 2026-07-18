// Tunisian CIN (Carte d'Identité Nationale) reader.
//
// The card is bilingual: Arabic labels on the left, French on some editions,
// and the OCR output arrives as a messy mix of both scripts. This module pulls
// the structured fields out of that text.
//
// What we do NOT do: invent a check-digit. Tunisia does not publish a checksum
// algorithm for the 8-digit CIN, so any "validation" beyond format would be
// fabricated confidence. We validate shape and plausibility, and say so.

export interface CinFields {
  cin: string;
  fullNameAr: string;
  fullNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  dob: string; // dd/mm/yyyy
  placeOfBirth: string;
  fatherName: string;
  issuedAt: string;
  /** Which fields we actually found, for the confidence badge. */
  found: string[];
  confidence: number; // 0..1
}

// Arabic label vocabulary found on the CIN.
//
// These are matched against text that has already been through
// normalizeArabic() (ة→ه, أإآ→ا), so every pattern must accept BOTH the raw
// and the normalised spelling — hence the [ةه] / [اأإ] classes. Writing them
// in raw form only means they silently never match.
const AR = {
  cin: /(?:بطاق[ةه]\s*التعريف|رقم\s*البطاق[ةه]|ر\.?ب\.?ت|المعرف\s*الوحيد)/,
  lastName: /(?:اللقب|النسب)/,
  firstName: /(?:ال[اأإ]سم)/,
  dob: /(?:تاريخ\s*الولاد[ةه]|تاريخ\s*الميلاد|ولد\s*في|مولود)/,
  place: /(?:مكان\s*الولاد[ةه]|مكان\s*الميلاد|ببلد[ةه])/,
  // Deliberately NOT matching bare "بن": it is part of an enormous number of
  // Tunisian surnames (Ben Salah, Ben Amor…) and would hijack the لقب line.
  father: /(?:ال[اأ]ب|ابن\s)/,
  issued: /(?:تاريخ\s*ال[اإ]صدار|سلمت\s*في|تاريخ\s*التسليم)/,
};

const FR = {
  cin: /(?:CARTE\s+D[’']?IDENTIT[EÉ]|C\.?I\.?N|N°\s*CIN|NUM[EÉ]RO)/i,
  lastName: /(?:NOM|PATRONYME)/i,
  firstName: /(?:PR[EÉ]NOM)/i,
  dob: /(?:N[EÉ]\(?E?\)?\s*LE|DATE\s+DE\s+NAISSANCE)/i,
  place: /(?:LIEU\s+DE\s+NAISSANCE|N[EÉ]\(?E?\)?\s*[AÀ])/i,
  father: /(?:FILS\s+DE|FILLE\s+DE|P[EÈ]RE)/i,
  issued: /(?:D[EÉ]LIVR[EÉ]E?\s+LE|DATE\s+DE\s+D[EÉ]LIVRANCE)/i,
};

const ARABIC_RANGE = /[؀-ۿ]/;

/** Normalise Arabic-Indic digits (٠١٢…) to ASCII so regexes see numbers. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Remove tashkeel and tatweel. This is the only step that changes string
 * length, so it runs first and its output is what we later slice values from.
 */
function stripDiacritics(input: string): string {
  return input.replace(/[ً-ْـ]/g, '');
}

/**
 * Fold letter variants that OCR confuses (alef forms, ta marbuta).
 * Strictly 1:1 per character, so offsets stay aligned with the input — that
 * lets us match on the folded text but extract from the original, preserving
 * the real spelling (سارة, not ساره) for anything printed on the constat.
 */
function foldLetters(input: string): string {
  return input.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
}

/**
 * A Tunisian CIN is exactly 8 digits. Older cards start with 0 or 1;
 * we accept any 8-digit run but reject obvious OCR garbage (repeated digits,
 * or a run that is really a date like 01011990).
 */
export function isPlausibleCin(value: string): boolean {
  const digits = normalizeDigits(value).replace(/\D/g, '');
  if (digits.length !== 8) return false;
  if (/^(\d)\1{7}$/.test(digits)) return false; // 00000000, 11111111…
  // Reject ddmmyyyy patterns — those are birth dates picked up by mistake
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4));
  if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) return false;
  return true;
}

/** Pick the CIN: prefer a number sitting near a CIN label, else any plausible 8-digit run. */
function extractCin(lines: string[], flat: string): string {
  for (const line of lines) {
    if (AR.cin.test(line) || FR.cin.test(line)) {
      const m = normalizeDigits(line).match(/\b(\d{8})\b/);
      if (m && isPlausibleCin(m[1])) return m[1];
    }
  }
  // Fall back to scanning every 8-digit run and taking the first plausible one
  const all = normalizeDigits(flat).match(/\b\d{8}\b/g) || [];
  for (const cand of all) if (isPlausibleCin(cand)) return cand;
  return '';
}

/**
 * Locate a label on the folded lines, return the value from the ORIGINAL line.
 * `lines` and `folded` are index- and offset-aligned by construction.
 */
function findByLabel(lines: string[], folded: string[], arLabel: RegExp, frLabel: RegExp): string {
  for (let i = 0; i < folded.length; i++) {
    for (const label of [arLabel, frLabel]) {
      const m = folded[i].match(label);
      if (!m) continue;

      const inline = lines[i]
        .slice((m.index ?? 0) + m[0].length)
        .replace(/^[\s:：.\-–—]+/, '')
        .trim();
      if (inline.length >= 2) return inline;

      // Value often sits on the next line on Tunisian cards
      const next = folded[i + 1];
      if (next && next.trim().length >= 2 && !arLabel.test(next) && !frLabel.test(next)) {
        return lines[i + 1].trim();
      }
    }
  }
  return '';
}

/** Dates on the card are dd/mm/yyyy, sometimes with . or - separators. */
function findDate(folded: string[], arLabel: RegExp, frLabel: RegExp): string {
  for (let i = 0; i < folded.length; i++) {
    if (!arLabel.test(folded[i]) && !frLabel.test(folded[i])) continue;
    for (const candidate of [folded[i], folded[i + 1] || '']) {
      const m = normalizeDigits(candidate).match(/(\d{2})\s*[/.\-]\s*(\d{2})\s*[/.\-]\s*(\d{4})/);
      if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    }
  }
  return '';
}

const cleanName = (s: string) =>
  s
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

/**
 * Parse OCR text from a Tunisian CIN into structured fields.
 * Tolerant by design: a partial read is more useful than a hard failure,
 * and the caller shows the user what was found for confirmation.
 */
export function parseCin(rawText: string): CinFields {
  const text = normalizeDigits(rawText);
  // Diacritics come off first (this is the only length-changing step), so
  // `lines` and `folded` stay offset-aligned and values can be sliced from the
  // original spelling.
  const lines = text
    .split('\n')
    .map((l) => stripDiacritics(l).trim())
    .filter(Boolean);
  const folded = lines.map(foldLetters);
  const flat = text.replace(/\n/g, ' ');

  const cin = extractCin(folded, flat);
  const lastNameAr = cleanName(findByLabel(lines, folded, AR.lastName, FR.lastName));
  const firstNameAr = cleanName(findByLabel(lines, folded, AR.firstName, FR.firstName));
  const dob = findDate(folded, AR.dob, FR.dob);
  const placeOfBirth = cleanName(findByLabel(lines, folded, AR.place, FR.place));
  const fatherName = cleanName(findByLabel(lines, folded, AR.father, FR.father));
  const issuedAt = findDate(folded, AR.issued, FR.issued);

  const fullNameAr = [firstNameAr, lastNameAr].filter(Boolean).join(' ').trim();

  // Latin-script name: some cards print it, otherwise leave it for the user.
  const latinLine = lines.find(
    (l) => !ARABIC_RANGE.test(l) && /^[A-Z][A-Z\s'’-]{5,40}$/.test(l.trim())
  );
  const fullNameFr = latinLine ? cleanName(latinLine) : '';

  const found: string[] = [];
  if (cin) found.push('cin');
  if (fullNameAr) found.push('name');
  if (dob) found.push('dob');
  if (placeOfBirth) found.push('placeOfBirth');
  if (fatherName) found.push('fatherName');
  if (issuedAt) found.push('issuedAt');

  // Confidence is driven by the fields that matter for a claim file.
  const weights: Record<string, number> = {
    cin: 0.4,
    name: 0.3,
    dob: 0.2,
    placeOfBirth: 0.04,
    fatherName: 0.03,
    issuedAt: 0.03,
  };
  const confidence = Math.round(found.reduce((s, f) => s + (weights[f] || 0), 0) * 100) / 100;

  return {
    cin,
    fullNameAr,
    fullNameFr,
    firstNameAr,
    lastNameAr,
    dob,
    placeOfBirth,
    fatherName,
    issuedAt,
    found,
    confidence,
  };
}

/** Age in years from dd/mm/yyyy — reused for the licence-validity check. */
export function ageFromCinDob(dob: string): number | null {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age--;
  return age >= 0 && age <= 120 ? age : null;
}
