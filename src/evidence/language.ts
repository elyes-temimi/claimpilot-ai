// Language AI — built for Tunisian code-switching.
//
// Two real engines, both local:
//  1. Token-level language ID (FR / AR / Tunisian Darija / EN) — including
//     arabizi (Darija written in Latin letters with 3/7/9 as letters) and
//     Darija written in Arabic script — rendered as a per-word breakdown.
//  2. A multilingual lexicon NLU that extracts structured claim facts
//     (impact direction, movement, fault, injuries, conditions) from a single
//     mixed-language sentence and emits a normalized English summary.
// Production would swap the lexicon for an LLM; the pipeline stays the same.

export type Lang = 'fr' | 'ar' | 'darija' | 'en' | 'other';

export interface TokenTag {
  token: string;
  lang: Lang;
}

export interface LanguageBreakdown {
  tokens: TokenTag[];
  shares: Record<Lang, number>; // percentages, sum ≈ 100
  primary: Lang;
  codeSwitching: boolean;
}

export interface StatementSlots {
  impactDirection: 'front' | 'rear' | 'left' | 'right' | null;
  movement: 'stationary' | 'moving' | 'braking' | 'parked' | 'reversing' | 'turning' | null;
  faultClaim: 'other' | 'self' | null;
  injuries: boolean | null;
  conditions: string[];
}

export interface StatementAnalysis {
  raw: string;
  breakdown: LanguageBreakdown;
  slots: StatementSlots;
  summary: string;
}

export const LANG_LABELS: Record<Lang, string> = {
  fr: 'French',
  ar: 'Arabic',
  darija: 'Darija',
  en: 'English',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Token-level language identification
// ---------------------------------------------------------------------------

// Darija words commonly written in Arabic script (vs standard Arabic)
const DARIJA_AR = new Set([
  'كرهبة', 'الكرهبة', 'كرهبتي', 'برشا', 'باهي', 'فما', 'فمّا', 'توا', 'توّا',
  'شنية', 'شنوة', 'علاش', 'وقتاش', 'التالي', 'مالتالي', 'لوطا', 'بلاصة',
  'مشيت', 'جيت', 'نجمتش', 'نجمش', 'وقفتش', 'دخل', 'دخلت', 'فيا', 'فيه',
  'مبللة', 'الشيرة', 'ياسر', 'شوية', 'حاجة', 'مركونة', 'الطريق',
]);

const DARIJA_LAT = new Set([
  'kont', 'kount', 'karhba', 'karahba', 'krahba', 'wa9ef', 'waqef', 'wakef',
  'dkhal', 'dkhalt', 'dakhal', 'fiya', 'fija', 'fih', 'feha', 'loura', 'lora',
  'mel', 'mil', 'men', 'mn', 'bech', 'besh', 'barcha', 'barsha', 'behi',
  'bahi', 'chwaya', 'shwaya', 'yesser', 'yasser', 'mchit', 'mchit', 'jit',
  'jet', 'jini', 'jani', 'nhez', 'hazit', 'frenit', 'frinit', 'nokhrej',
  'wakt', 'wa9t', 'blasa', 'bla9a', 'famma', 'fama', 'mba3d', 'ba3d',
  'wa9tha', 'kif', 'kima', 'zeda', 'zada', 'raken', 'rakna', 'parki',
  'weld', 'sahbi', 'yezzi', 'mazel', 'mazelt', 'hakka', 'haka', 'wa9fetch',
  'waqfetch', 'wakfetch', 'nejem', 'najem', 'nejemtech', 'stop', 'w',
]);

const FR_COMMON = new Set([
  'je', "j'ai", "j'étais", 'il', 'elle', 'nous', 'vous', 'le', 'la', 'les',
  'un', 'une', 'des', 'de', 'du', 'et', 'mais', 'dans', 'sur', 'avec', 'pas',
  'ne', 'que', 'qui', 'est', 'était', 'suis', 'sont', 'voiture', 'feu',
  'rouge', 'freiné', 'freine', 'percuté', 'percute', 'arrière', 'avant',
  'gauche', 'droite', 'derrière', 'devant', 'route', 'mouillée', 'pluie',
  'blessé', 'blessés', 'faute', 'vitesse', 'stationné', 'garé', 'arrêté',
  "l'arrière", "l'avant", "m'a", "s'est", "c'est", 'au', 'aux', 'par', 'très',
  'accident', 'conducteur', 'soudainement', 'brusquement', 'aucun',
]);

const EN_COMMON = new Set([
  'i', 'was', 'the', 'he', 'she', 'they', 'my', 'his', 'her', 'car', 'hit',
  'from', 'behind', 'front', 'rear', 'left', 'right', 'stopped', 'stop',
  'driving', 'braked', 'brake', 'suddenly', 'at', 'and', 'but', 'not',
  'fault', 'red', 'light', 'traffic', 'road', 'wet', 'rain', 'no', 'one',
  'hurt', 'injured', 'parked', 'reversing', 'turning', 'into', 'me', 'him',
]);

const ARABIC_SCRIPT = /[؀-ۿ]/;
const ARABIZI_DIGITS = /[3579]/;

function classifyToken(raw: string): Lang | null {
  const token = raw.toLowerCase();
  const bare = token.replace(/[.,;:!?()'"«»]/g, '');
  if (!bare) return null;

  if (ARABIC_SCRIPT.test(bare)) {
    const normalized = bare.replace(/[ً-ْـ]/g, '');
    return DARIJA_AR.has(normalized) ? 'darija' : 'ar';
  }
  if (DARIJA_LAT.has(bare)) return 'darija';
  if (ARABIZI_DIGITS.test(bare) && /[a-z]/.test(bare)) return 'darija'; // 3la, 7atta, 9dem…
  if (FR_COMMON.has(bare)) return 'fr';
  if (EN_COMMON.has(bare)) return 'en';
  if (/[àâçéèêëîïôùûüœ]/.test(bare)) return 'fr';
  if (/(tion|ment|eur|ait|ais|ez)$/.test(bare) && bare.length > 4) return 'fr';
  if (/(ing|ed|ly)$/.test(bare) && bare.length > 4) return 'en';
  return 'other';
}

export function detectLanguages(text: string): LanguageBreakdown {
  const rawTokens = text.split(/\s+/).filter(Boolean);
  const tokens: TokenTag[] = [];
  let prev: Lang = 'other';

  for (const raw of rawTokens) {
    let lang = classifyToken(raw);
    if (lang === null) continue;
    // Smoothing: unknown latin tokens inherit the surrounding language span
    if (lang === 'other' && prev !== 'other') lang = prev;
    tokens.push({ token: raw, lang });
    if (lang !== 'other') prev = lang;
  }

  const counts: Record<Lang, number> = { fr: 0, ar: 0, darija: 0, en: 0, other: 0 };
  for (const t of tokens) counts[t.lang]++;
  const total = Math.max(1, tokens.length);
  const shares = Object.fromEntries(
    (Object.keys(counts) as Lang[]).map((l) => [l, Math.round((counts[l] / total) * 100)])
  ) as Record<Lang, number>;

  const ranked = (Object.keys(shares) as Lang[])
    .filter((l) => l !== 'other')
    .sort((a, b) => shares[b] - shares[a]);
  const primary = shares[ranked[0]] > 0 ? ranked[0] : 'other';
  const codeSwitching = ranked.filter((l) => shares[l] >= 15).length >= 2;

  return { tokens, shares, primary, codeSwitching };
}

// ---------------------------------------------------------------------------
// Slot extraction (multilingual lexicon NLU)
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ');
}

const P = {
  rear: /(from behind|rear[- ]?end|hit .{0,12}(behind|back)|a l'arriere|à l'arrière|par derriere|par derrière|percut\w* .{0,14}arri[eè]re|mel loura|mil loura|men loura|el loura|من الخلف|من التالي|مالتالي|في التالي|من ورا|الوراء)/,
  front: /(head[- ]?on|de face|a l'avant|à l'avant|par devant|frontal\w*|men 9odem|men 9oddem|el 9odem|9odem|من القدام|قدام|المقدمة|percut\w* .{0,14}avant|dkhalt fih|دخلت فيه)/,
  left: /(left side|cote gauche|côté gauche|sur la gauche|3al isar|3la lisar|على اليسار|الجهة اليسرى)/,
  right: /(right side|cote droit|côté droit|sur la droite|3al imin|3la limin|على اليمين|الجهة اليمنى)/,

  stationary: /(was stopped|standing still|at a red light|a l'arret|à l'arrêt|arrete au feu|arrêté|au feu rouge|feu rouge|kont wa9ef|kont waqef|kont wakef|واقف|محبوس)/,
  braking: /(brak(ed|ing)|frein\w*|frenit|frinit|فرملت|الفران)/,
  parked: /(parked|stationn\w*|gar[ée]e?\b|raken|rakna|parki|مركونة|مركون)/,
  reversing: /(revers|marche arriere|marche arrière|recul\w*|رجعت بالمرش)/,
  turning: /(turn(ed|ing)|tourn\w*|virage|دورت|في الدورة)/,
  moving: /(was driving|en roulant|je roulais|roulais|kont nemchi|نمشي|نسوق|kont nsou9)/,

  faultOther: /(il m'a percut|elle m'a percut|m'a percut\w*|not my fault|pas ma faute|il est entr[ée]|dkhal fiya|dkhal fija|jani men|جاني من|دخل فيا|ضربني|هو غالط|c'est sa faute|il ne s'est pas arret)/,
  faultSelf: /(ma faute|my fault|j'ai percut\w*|je l'ai percut|dkhalt fih|dkhalt fiha|دخلت فيه|دخلت فيها|ما نجمتش نوقف|ma njemtech no9ef|ma nejemtech)/,

  injuriesYes: /(injur(ed|y|ies)|bless[ée]|douleur|مجروح|توجع|يوجع|whiplash|cou me fait mal)/,
  injuriesNo: /(no one (was )?hurt|nobody (was )?hurt|pas de bless[ée]s?|aucun bless[ée]|ما فما حتى مجروح|makach jrou7|حد ما تجرح|hamdoullah rien|ca va tout le monde)/,

  wet: /(wet road|mouill[ée]e?|pluie|rain|مبللة|مطر|الشتا|chta|تمطر)/,
  night: /(at night|la nuit|de nuit|الليل|fel lil|في الليل)/,
  fog: /(fog|brouillard|ضباب)/,
};

export function extractSlots(text: string): StatementSlots {
  const t = normalize(text);
  const slots: StatementSlots = {
    impactDirection: null,
    movement: null,
    faultClaim: null,
    injuries: null,
    conditions: [],
  };

  // Direction: rear beats front if both matched via "dkhalt fih" style overlap
  if (P.rear.test(t)) slots.impactDirection = 'rear';
  else if (P.front.test(t)) slots.impactDirection = 'front';
  else if (P.left.test(t)) slots.impactDirection = 'left';
  else if (P.right.test(t)) slots.impactDirection = 'right';

  if (P.stationary.test(t)) slots.movement = 'stationary';
  else if (P.braking.test(t)) slots.movement = 'braking';
  else if (P.parked.test(t)) slots.movement = 'parked';
  else if (P.reversing.test(t)) slots.movement = 'reversing';
  else if (P.turning.test(t)) slots.movement = 'turning';
  else if (P.moving.test(t)) slots.movement = 'moving';

  if (P.faultSelf.test(t)) slots.faultClaim = 'self';
  else if (P.faultOther.test(t)) slots.faultClaim = 'other';

  if (P.injuriesNo.test(t)) slots.injuries = false;
  else if (P.injuriesYes.test(t)) slots.injuries = true;

  if (P.wet.test(t)) slots.conditions.push('wet road');
  if (P.night.test(t)) slots.conditions.push('night');
  if (P.fog.test(t)) slots.conditions.push('fog');

  return slots;
}

export function buildSummary(slots: StatementSlots): string {
  const parts: string[] = [];
  const mv: Record<string, string> = {
    stationary: 'the driver was stationary',
    braking: 'the driver was braking',
    parked: 'the vehicle was parked',
    reversing: 'the driver was reversing',
    turning: 'the driver was turning',
    moving: 'the driver was moving',
  };
  if (slots.movement) parts.push(mv[slots.movement]);
  if (slots.impactDirection) parts.push(`impact came from the ${slots.impactDirection}`);
  if (slots.faultClaim === 'other') parts.push('attributes fault to the other party');
  if (slots.faultClaim === 'self') parts.push('accepts fault');
  if (slots.injuries === true) parts.push('injuries reported');
  if (slots.injuries === false) parts.push('no injuries reported');
  if (slots.conditions.length) parts.push(`conditions: ${slots.conditions.join(', ')}`);
  if (parts.length === 0) return 'No structured facts could be extracted — routed to manual review.';
  const s = parts.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export function analyzeStatement(raw: string): StatementAnalysis {
  const breakdown = detectLanguages(raw);
  const slots = extractSlots(raw);
  return { raw, breakdown, slots, summary: buildSummary(slots) };
}

/** Canned mixed-language statements for the demo buttons. */
export const DEMO_STATEMENTS = {
  victim:
    "Kont waqef au feu rouge, الكرهبة اللي ورايا ما وقفتش و دخل فيا من التالي. Il m'a percuté à l'arrière, pas de blessés hamdoullah.",
  fraud:
    "J'étais à l'arrêt et il m'a percuté à l'arrière, c'est sa faute. ما فما حتى مجروح.",
};
