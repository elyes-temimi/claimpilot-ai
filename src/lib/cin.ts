// Tunisian CIN (بطاقة التعريف الوطنية) reader — front and back.
//
// Field layout on the real card, which drives everything below:
//
//   FRONT (recto)                        BACK (verso)
//   ───────────────────────────────      ─────────────────────────────
//   الجمهورية التونسية      (header)      اسم ولقب الأم   mother's name
//   بطاقة التعريف الوطنية  (header)      العنوان         address
//   [photo]        اللقب     surname      تونس في 01 جوان 2019
//                  الاسم     given name   [official stamp]
//                  تاريخ الولادة  DOB      [barcode strip]
//                  مكانها    place of birth
//
// Three things about this card break a naive parser:
//
//  1. Place of birth is labelled `مكانها` ("its place", referring back to the
//     birth-date line) — NOT `مكان الولادة` as on most Arab IDs.
//  2. Dates use Tunisian month names borrowed from French — `جوان` for June,
//     `أفريل` for April, `جويلية` for July. A dd/mm/yyyy regex finds nothing.
//  3. The two largest text blocks on the card are the republic and card-title
//     headers, so "take the longest line as the name" reliably returns
//     "الجمهورية التونسية" instead of the holder.
//
// We do NOT invent a check digit: Tunisia publishes no CIN checksum, so any
// validation beyond shape and plausibility would be fabricated confidence.

export type CinSide = 'front' | 'back' | 'unknown';

export interface CinFields {
  cin: string;
  fullNameAr: string;
  fullNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  dob: string; // dd/mm/yyyy
  placeOfBirth: string;
  motherName: string;
  address: string;
  issuedAt: string; // dd/mm/yyyy
  issuedPlace: string;
  side: CinSide;
  /** Which fields were actually found, for the confidence badge. */
  found: string[];
  confidence: number; // 0..1
}

export const EMPTY_CIN: CinFields = {
  cin: '', fullNameAr: '', fullNameFr: '', firstNameAr: '', lastNameAr: '',
  dob: '', placeOfBirth: '', motherName: '', address: '', issuedAt: '',
  issuedPlace: '', side: 'unknown', found: [], confidence: 0,
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Arabic-Indic digits (٠١٢…) → ASCII, so numeric regexes see numbers. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Remove tashkeel/tatweel. Only length-changing step, so it runs first. */
function stripDiacritics(input: string): string {
  return input.replace(/[ً-ْـ]/g, '');
}

/**
 * Fold letter variants OCR confuses (alef forms, ta marbuta, alef maqsura).
 * Strictly 1:1 per character so offsets stay aligned with the source string —
 * that lets us match on folded text but slice values from the original,
 * preserving real spelling (سارة, not ساره) for anything printed on a constat.
 */
function foldLetters(input: string): string {
  return input.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}

// ---------------------------------------------------------------------------
// Card vocabulary (written in FOLDED form — matched against folded text)
// ---------------------------------------------------------------------------

const LABELS = {
  // front
  lastName: /(?:اللقب|النسب)/,
  // Boundary-anchored: bare "اسم" is a substring of everyday words such as
  // "الياسمين", and matching inside one silently destroys that field.
  firstName: /(?<![؀-ۿ])(?:ال)?اسم(?![؀-ۿ])(?!\s*و\s*لقب)/,
  dob: /(?:تاريخ\s*الولاده|تاريخ\s*الميلاد|ولد\s*في)/,
  // `مكانها` is the label actually printed; the others are defensive
  placeOfBirth: /(?:مكانها|مكان\s*الولاده|مكان\s*الميلاد)/,
  // back
  motherName: /(?:اسم\s*و\s*لقب\s*الام|اسم\s*الام|و\s*الده)/,
  address: /(?:العنوان|عنوان)/,
  cinNumber: /(?:بطاقه\s*التعريف|رقم\s*البطاقه|المعرف\s*الوحيد|ر\.?ب\.?ت)/,
};

/**
 * Boilerplate that must never be mistaken for a field value. These are the
 * longest strings on the card, which is exactly why a "longest line wins"
 * heuristic returns the country name as the holder's name.
 */
const BOILERPLATE = [
  /الجمهوريه\s*التونسيه/,
  /بطاقه\s*التعريف\s*الوطنيه/,
  /وزاره\s*الداخليه/,
  /republique\s*tunisienne/i,
  /carte\s*d.?identite/i,
];

const isBoilerplate = (folded: string) => BOILERPLATE.some((re) => re.test(folded));

/** Every label, used to stop a value from swallowing the next field's label. */
const ANY_LABEL = new RegExp(Object.values(LABELS).map((r) => r.source).join('|'));

// ---------------------------------------------------------------------------
// Dates — Tunisian month names are French-derived, unlike Levantine Arabic
// ---------------------------------------------------------------------------

const AR_MONTHS: Record<string, number> = {
  // Tunisian / Maghrebi (folded spellings)
  جانفي: 1, فيفري: 2, مارس: 3, افريل: 4, ماي: 5, جوان: 6,
  جويليه: 7, اوت: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
  // Standard-Arabic fallbacks in case a card or OCR pass uses them
  يناير: 1, فبراير: 2, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7,
  اغسطس: 8, شتنبر: 9, نونبر: 11, دجنبر: 12,
};

const MONTH_ALTERNATION = Object.keys(AR_MONTHS)
  .sort((a, b) => b.length - a.length) // longest first: جويليه before جوان
  .join('|');

const pad = (n: number | string) => String(n).padStart(2, '0');

/** Pull a date from a line, accepting both `01/06/2019` and `01 جوان 2019`. */
function extractDate(line: string): string {
  const t = foldLetters(normalizeDigits(line));

  const numeric = t.match(/(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/);
  if (numeric) return `${pad(numeric[1])}/${pad(numeric[2])}/${numeric[3]}`;

  const named = t.match(new RegExp(`(\\d{1,2})\\s*(${MONTH_ALTERNATION})\\s*(\\d{4})`));
  if (named) {
    const month = AR_MONTHS[named[2]];
    if (month) return `${pad(named[1])}/${pad(month)}/${named[3]}`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Value extraction
// ---------------------------------------------------------------------------

/**
 * Words that only ever appear in a LABEL on this card. If they survive into an
 * extracted value, the label/value split went wrong and the value is garbage —
 * better to return nothing than to print "و لقب الأم نرجس زايد" as someone's
 * name on a legal document.
 */
const LABEL_RESIDUE = /(?:لقب|العنوان|تاريخ\s*الولاد|مكانها|بطاق[ةه]\s*التعريف)/;

const cleanValue = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/**
 * Read the value belonging to a label.
 *
 * The card is RTL: labels sit on the right, values to their left. Tesseract
 * normally emits logical order (label first, then value) but not always — so we
 * try the text after the label, then before it, then the following line.
 * `lines` and `folded` are index- and offset-aligned by construction.
 */
/**
 * The issuance line, e.g. "تونس في 01 جوان 2019" — a place, then "في", then a
 * date. It carries no labelled field, so it must never be offered as the value
 * of a neighbouring label. Left in, it makes the address on the back absorb the
 * issue date and shifts the mother's name into the address.
 */
const isIssuanceLine = (folded: string) => /\sفي\s/.test(folded) && !!extractDate(folded);

/** Usable as a value: not a label, not boilerplate, not the issuance line. */
function isValueLine(folded: string | undefined): boolean {
  return (
    !!folded &&
    folded.trim().length >= 2 &&
    !ANY_LABEL.test(folded) &&
    !isBoilerplate(folded) &&
    !LABEL_RESIDUE.test(folded) &&
    !isIssuanceLine(folded) &&
    // A lone 8-digit run is the CIN; extractCin owns it. Left in the value
    // pool it shifts every label/value pairing by one position.
    !/^\s*\d{8}\s*$/.test(folded)
  );
}

/**
 * Rebuild "label value" lines from a column-wise transcription.
 *
 * On the real card the labels are stacked in a right-hand column with their
 * values to the left. OCR frequently reads that as two blocks rather than
 * interleaved rows:
 *
 *   اللقب              <- label block
 *   الاسم
 *   تاريخ الولادة
 *   مكانها
 *   النديمي            <- value block, same order
 *   محمد
 *   20/05/2005
 *   تونس
 *
 * Adjacency-based lookup cannot pair those: the line after `اللقب` is another
 * label, so only the LAST label in the block ever finds a value. That is
 * exactly why a real card yielded the surname but never the given name or the
 * place of birth. We detect a run of two or more lone labels followed by that
 * many value lines and zip them back together; the normal inline path then
 * handles everything.
 */
function unstackColumns(lines: string[], folded: string[]): { lines: string[]; folded: string[] } {
  const isLoneLabel = (f: string) =>
    ANY_LABEL.test(f) && f.replace(ANY_LABEL, '').replace(/[\s:：.\-–—]/g, '').length < 2;

  for (let i = 0; i < folded.length; i++) {
    if (!isLoneLabel(folded[i])) continue;

    let end = i;
    while (end + 1 < folded.length && isLoneLabel(folded[end + 1])) end++;
    const count = end - i + 1;
    if (count < 2) continue;

    const values: number[] = [];
    for (let j = end + 1; j < folded.length && values.length < count; j++) {
      if (isLoneLabel(folded[j])) break;
      if (isValueLine(folded[j])) values.push(j);
    }
    // Only rewrite when the block pairs cleanly; a partial match is more
    // likely to be a coincidence than a column.
    if (values.length < count) { i = end; continue; }

    const outLines = [...lines];
    const outFolded = [...folded];
    for (let k = 0; k < count; k++) {
      outLines[i + k] = `${lines[i + k]} ${lines[values[k]]}`;
      outFolded[i + k] = `${folded[i + k]} ${folded[values[k]]}`;
      outLines[values[k]] = '';
      outFolded[values[k]] = '';
    }
    const keep = outFolded.map((f, idx) => (f === '' ? -1 : idx)).filter((x) => x >= 0);
    return { lines: keep.map((i2) => outLines[i2]), folded: keep.map((i2) => outFolded[i2]) };
  }
  // Mirror case: a block of values FOLLOWED by its block of labels. Vision
  // models scan the left-hand value column of an RTL card before the labels,
  // so this is the shape they actually emit.
  for (let i = 0; i < folded.length; i++) {
    if (!isLoneLabel(folded[i])) continue;
    let end = i;
    while (end + 1 < folded.length && isLoneLabel(folded[end + 1])) end++;
    const count = end - i + 1;
    if (count < 2) continue;

    const values: number[] = [];
    for (let j = i - 1; j >= 0 && values.length < count; j--) {
      if (isLoneLabel(folded[j])) break;
      if (isValueLine(folded[j])) values.unshift(j);
      else break;
    }
    if (values.length < 2) { i = end; continue; }

    const pairs = Math.min(count, values.length);
    const outLines = [...lines];
    const outFolded = [...folded];
    for (let k = 0; k < pairs; k++) {
      outLines[i + k] = `${lines[i + k]} ${lines[values[k]]}`;
      outFolded[i + k] = `${folded[i + k]} ${folded[values[k]]}`;
      outLines[values[k]] = '';
      outFolded[values[k]] = '';
    }
    const keep = outFolded.map((f, idx) => (f === '' ? -1 : idx)).filter((x) => x >= 0);
    return { lines: keep.map((i2) => outLines[i2]), folded: keep.map((i2) => outFolded[i2]) };
  }

  return { lines, folded };
}

/**
 * Which side of a label its value sits on, when they are on separate lines.
 *
 * Tesseract reads the card in logical order and emits `label` then `value`.
 * A vision model transcribing the same card emits the value FIRST, because on
 * an RTL card the value is physically to the left of its label and it scans
 * visually:
 *
 *   Tesseract            vision model
 *   اللقب                التميمي     <- value
 *   التميمي              اللقب       <- label
 *
 * Guessing wrong shifts every field by one — the mother's name lands in the
 * address, the surname in the given name. So we decide per document: count how
 * many labels are preceded by a value line versus followed by one, and let the
 * majority win. Ties go to "after", the conventional reading order.
 */
function detectValueSide(folded: string[]): 'before' | 'after' {
  let before = 0;
  let after = 0;
  for (let i = 0; i < folded.length; i++) {
    if (!ANY_LABEL.test(folded[i])) continue;
    // Only counts when the label is alone on its line; an inline "label value"
    // pair tells us nothing about the separate-line layout.
    const inline = folded[i].replace(ANY_LABEL, '').replace(/[\s:：.\-–—]/g, '');
    if (inline.length >= 2) continue;
    if (isValueLine(folded[i - 1])) before++;
    if (isValueLine(folded[i + 1])) after++;
  }
  return before > after ? 'before' : 'after';
}

function valueFor(
  lines: string[],
  folded: string[],
  label: RegExp,
  side: 'before' | 'after' = 'after'
): string {
  for (let i = 0; i < folded.length; i++) {
    const m = folded[i].match(label);
    if (!m) continue;
    const at = m.index ?? 0;

    // 1. after the label, same line
    const after = cleanValue(lines[i].slice(at + m[0].length).replace(/^[\s:：.\-–—]+/, ''));
    if (after.length >= 2 && !ANY_LABEL.test(foldLetters(after)) && !LABEL_RESIDUE.test(foldLetters(after))) return after;

    // 2. before the label, same line (OCR emitted visual order)
    const before = cleanValue(lines[i].slice(0, at));
    if (before.length >= 2 && !ANY_LABEL.test(foldLetters(before)) && !LABEL_RESIDUE.test(foldLetters(before))) return before;

    // 3. the adjacent line, on whichever side this document puts its values
    const order = side === 'before' ? [i - 1, i + 1] : [i + 1, i - 1];
    for (const j of order) {
      if (isValueLine(folded[j])) {
        const v = cleanValue(lines[j]);
        if (v.length >= 2) return v;
      }
    }
  }
  return '';
}

/** Same, but returns a normalised date. */
function dateFor(lines: string[], folded: string[], label: RegExp): string {
  for (let i = 0; i < folded.length; i++) {
    if (!label.test(folded[i])) continue;
    for (const candidate of [lines[i], lines[i + 1] || '']) {
      const d = extractDate(candidate);
      if (d) return d;
    }
  }
  return '';
}

/**
 * A Tunisian CIN is exactly 8 digits. Reject obvious OCR artefacts: repeated
 * digits, and runs that are really a date (ddmmyyyy).
 */
export function isPlausibleCin(value: string): boolean {
  const digits = normalizeDigits(value).replace(/\D/g, '');
  if (digits.length !== 8) return false;
  if (/^(\d)\1{7}$/.test(digits)) return false;
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4));
  if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) return false;
  return true;
}

function extractCin(folded: string[], flat: string): string {
  for (const line of folded) {
    if (LABELS.cinNumber.test(line)) {
      const m = normalizeDigits(line).match(/\b(\d{8})\b/);
      if (m && isPlausibleCin(m[1])) return m[1];
    }
  }
  for (const cand of normalizeDigits(flat).match(/\b\d{8}\b/g) || []) {
    if (isPlausibleCin(cand)) return cand;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Side detection
// ---------------------------------------------------------------------------

/**
 * Which face of the card is this? Lets the right expectations apply even when
 * the user photographs the sides in the wrong order.
 */
export function detectSide(rawText: string): CinSide {
  const f = foldLetters(stripDiacritics(rawText));
  let front = 0;
  let back = 0;
  if (/بطاقه\s*التعريف\s*الوطنيه/.test(f)) front += 2;
  if (/الجمهوريه\s*التونسيه/.test(f)) front += 1;
  if (LABELS.lastName.test(f)) front += 2;
  if (LABELS.dob.test(f)) front += 2;
  if (LABELS.placeOfBirth.test(f)) front += 1;
  if (LABELS.motherName.test(f)) back += 3;
  if (LABELS.address.test(f)) back += 2;
  if (/تونس\s*في/.test(f)) back += 2;
  if (front === 0 && back === 0) return 'unknown';
  return front >= back ? 'front' : 'back';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const FIELD_WEIGHTS: Record<string, number> = {
  cin: 0.3, name: 0.25, dob: 0.2, placeOfBirth: 0.08,
  address: 0.07, motherName: 0.05, issuedAt: 0.05,
};

const score = (found: string[]) =>
  Math.round(found.reduce((s, f) => s + (FIELD_WEIGHTS[f] || 0), 0) * 100) / 100;

/**
 * Parse OCR text from one face of a Tunisian CIN.
 * Tolerant by design — a partial read beats a hard failure, and the UI shows
 * the user what was found so they can correct it.
 *
 * @param side pass 'front'/'back' when known; omit to auto-detect
 */
export function parseCin(rawText: string, side?: CinSide): CinFields {
  const text = normalizeDigits(rawText);
  let lines = text
    .split('\n')
    .map((l) => stripDiacritics(l).trim())
    .filter(Boolean);
  let folded = lines.map(foldLetters);
  // Repair a column-wise transcription before anything else reads it.
  ({ lines, folded } = unstackColumns(lines, folded));
  const flat = text.replace(/\n/g, ' ');

  const resolvedSide = side && side !== 'unknown' ? side : detectSide(rawText);

  // Decide once whether this transcription puts values before or after their
  // labels; getting it wrong shifts every field by one.
  const valueSide = detectValueSide(folded);

  // Each face carries different fields, and mixing them is how the mother's
  // name ended up in the holder's name. The holder's identity is printed ONLY
  // on the front; the mother's name and address ONLY on the back. Restricting
  // extraction by face makes that whole class of confusion impossible rather
  // than relying on label patterns to stay disambiguated.
  const isFront = resolvedSide !== 'back';
  const isBack = resolvedSide !== 'front';

  const cin = extractCin(folded, flat);
  const lastNameAr = isFront ? valueFor(lines, folded, LABELS.lastName, valueSide) : '';
  const firstNameAr = isFront ? valueFor(lines, folded, LABELS.firstName, valueSide) : '';
  const dob = isFront ? dateFor(lines, folded, LABELS.dob) : '';
  const placeOfBirth = isFront ? valueFor(lines, folded, LABELS.placeOfBirth, valueSide) : '';
  const motherName = isBack ? valueFor(lines, folded, LABELS.motherName, valueSide) : '';
  const address = isBack ? valueFor(lines, folded, LABELS.address, valueSide) : '';

  // "تونس في 01 جوان 2019" — issuing office, then the date, on the back.
  let issuedAt = '';
  let issuedPlace = '';
  for (let i = 0; i < folded.length; i++) {
    const d = extractDate(lines[i]);
    if (!d || d === dob) continue; // never let the birth date pose as the issue date
    issuedAt = d;
    const place = folded[i].match(/(\S+)\s*في\s/);
    if (place && !isBoilerplate(folded[i])) issuedPlace = cleanValue(place[1]);
    break;
  }

  const fullNameAr = [firstNameAr, lastNameAr].filter(Boolean).join(' ').trim();

  // Latin-script name, printed on some editions. Never boilerplate.
  const latinIdx = lines.findIndex(
    (l, i) => !/[؀-ۿ]/.test(l) && /^[A-Z][A-Z\s'’-]{5,40}$/.test(l.trim()) && !isBoilerplate(folded[i])
  );

  const found: string[] = [];
  if (cin) found.push('cin');
  if (fullNameAr) found.push('name');
  if (dob) found.push('dob');
  if (placeOfBirth) found.push('placeOfBirth');
  if (motherName) found.push('motherName');
  if (address) found.push('address');
  if (issuedAt) found.push('issuedAt');

  return {
    cin,
    fullNameAr,
    fullNameFr: latinIdx >= 0 ? cleanValue(lines[latinIdx]) : '',
    firstNameAr,
    lastNameAr,
    dob,
    placeOfBirth,
    motherName,
    address,
    issuedAt,
    issuedPlace,
    side: resolvedSide,
    found,
    confidence: score(found),
  };
}

/**
 * Combine a front and a back scan into one record. Each side contributes the
 * fields it actually carries; a non-empty value always wins over an empty one.
 */
export function mergeCinSides(a: CinFields | null, b: CinFields | null): CinFields {
  const front = a?.side !== 'back' ? a : b?.side !== 'back' ? b : null;
  const back = a?.side === 'back' ? a : b?.side === 'back' ? b : null;
  const pick = (k: keyof CinFields) => String(front?.[k] || '') || String(back?.[k] || '');

  const merged: CinFields = {
    ...EMPTY_CIN,
    cin: pick('cin'),
    lastNameAr: pick('lastNameAr'),
    firstNameAr: pick('firstNameAr'),
    fullNameAr: pick('fullNameAr'),
    fullNameFr: pick('fullNameFr'),
    dob: pick('dob'),
    placeOfBirth: pick('placeOfBirth'),
    // These three only exist on the back.
    motherName: String(back?.motherName || front?.motherName || ''),
    address: String(back?.address || front?.address || ''),
    issuedAt: String(back?.issuedAt || front?.issuedAt || ''),
    issuedPlace: String(back?.issuedPlace || front?.issuedPlace || ''),
    side: front && back ? 'unknown' : front ? 'front' : 'back',
  };

  const found: string[] = [];
  if (merged.cin) found.push('cin');
  if (merged.fullNameAr) found.push('name');
  if (merged.dob) found.push('dob');
  if (merged.placeOfBirth) found.push('placeOfBirth');
  if (merged.motherName) found.push('motherName');
  if (merged.address) found.push('address');
  if (merged.issuedAt) found.push('issuedAt');
  merged.found = found;
  merged.confidence = score(found);
  return merged;
}

/** Age in years from dd/mm/yyyy. */
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
