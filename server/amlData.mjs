// Fictional watchlist used by the mocked AML/PEP screening service.
// Every name below is invented for the demo — any resemblance to real people is coincidental.

export const WATCHLIST = [
  // Sanctions-style entries
  { name: 'Rachid El Kandari', dob: '1969-04-02', list: 'SANCTIONS', program: 'INTL-ARMS-2021', country: 'N/A', note: 'Arms embargo designation (fictional)' },
  { name: 'Viktor Malenko', dob: '1975-11-19', list: 'SANCTIONS', program: 'FIN-FRAUD-2019', country: 'N/A', note: 'Financial fraud network (fictional)' },
  { name: 'Salem Abu Draz', dob: '1981-02-27', list: 'SANCTIONS', program: 'TER-FIN-2020', country: 'N/A', note: 'Terror financing designation (fictional)' },
  { name: 'Dmitri Voskov', dob: '1963-07-08', list: 'SANCTIONS', program: 'CYBER-2022', country: 'N/A', note: 'Cybercrime proceeds (fictional)' },
  { name: 'Hamid Al Rachidi', dob: '1958-01-30', list: 'SANCTIONS', program: 'INTL-ARMS-2021', country: 'N/A', note: 'Procurement agent (fictional)' },

  // PEP-style entries (politically exposed persons)
  { name: 'Faycal Trabelsi', dob: '1966-09-12', list: 'PEP', program: 'PEP-TN', country: 'TN', note: 'Former senior public official (fictional)' },
  { name: 'Mongi Ben Aissa', dob: '1971-05-23', list: 'PEP', program: 'PEP-TN', country: 'TN', note: 'Regional governor family member (fictional)' },
  { name: 'Leila Ben Slimane', dob: '1974-12-04', list: 'PEP', program: 'PEP-TN', country: 'TN', note: 'State enterprise board member (fictional)' },
  { name: 'Karim Bouzidi', dob: '1979-08-15', list: 'PEP', program: 'PEP-INTL', country: 'N/A', note: 'Diplomatic staff (fictional)' },
  { name: 'Nadia El Mansouri', dob: '1983-03-09', list: 'PEP', program: 'PEP-INTL', country: 'N/A', note: 'Central bank committee (fictional)' },
];

/** Strip accents, lowercase, collapse whitespace. */
export function normalizeName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const clean = s.replace(/\s/g, '');
  const grams = [];
  for (let i = 0; i < clean.length - 1; i++) grams.push(clean.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice similarity between two names (0..1). */
export function diceSimilarity(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return 0;
  const counts = new Map();
  for (const g of ga) counts.set(g, (counts.get(g) || 0) + 1);
  let overlap = 0;
  for (const g of gb) {
    const c = counts.get(g) || 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (ga.length + gb.length);
}

/** Fraction of query tokens that appear (fuzzily) among entry tokens. */
function tokenOverlap(a, b) {
  const ta = a.split(' ').filter((t) => t.length > 2);
  const tb = b.split(' ').filter((t) => t.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;
  let hit = 0;
  for (const t of ta) {
    if (tb.some((u) => u === t || diceSimilarity(t, u) >= 0.8)) hit++;
  }
  return hit / ta.length;
}

/**
 * Screen a name against the watchlist.
 * Returns { status: 'clear' | 'review', hits: [...] }
 */
export function screenName(fullName) {
  const q = normalizeName(fullName);
  const hits = [];
  for (const entry of WATCHLIST) {
    const e = normalizeName(entry.name);
    const dice = diceSimilarity(q, e);
    const overlap = tokenOverlap(q, e);
    const score = Math.max(dice, overlap * 0.9);
    if (score >= 0.62) {
      hits.push({ ...entry, score: Math.round(score * 100) });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const status = hits.length > 0 ? 'review' : 'clear';
  return { status, hits: hits.slice(0, 3) };
}
