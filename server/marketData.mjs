// Local parts market data — the "local database" the estimator searches.
//
// HONESTY NOTE, because this drives a money number on screen:
//   * PART_CATALOG prices are *indicative* TND ranges compiled as reference
//     data for this prototype. They are not a live supplier feed and must not
//     be quoted to a customer as a firm price.
//   * SHOPS are real, well-known Tunisian channels for buying car parts, but
//     we deliberately link to *search* URLs rather than claiming a specific
//     part is in stock at a specific branch — we cannot verify inventory.
//   * Swap this module for a supplier API and nothing else in the pipeline
//     changes; the shape is what a real feed would return.

/** Vehicle price tiers — the same panel costs very different money by segment. */
export const VEHICLE_TIERS = {
  economy: { label: 'Économique (Symbol, Clio, i10…)', factor: 0.78 },
  standard: { label: 'Standard (208, Golf, Seat Ibiza…)', factor: 1.0 },
  premium: { label: 'Premium (Classe C, Série 3, Q3…)', factor: 1.85 },
};

/**
 * Parts reachable from each impact side, with indicative TND part costs and
 * the labour hours a Tunisian body shop would typically book.
 *
 * `threshold` is the minimum damage severity at which the part is normally
 * involved — a light scuff doesn't mean the radiator is gone.
 *
 * `repairable` encodes body-shop reality: steel/aluminium panels get beaten
 * out and refinished, while plastic bumpers, glass optics, mirrors and
 * radiators are swapped once they're past cosmetic damage. Getting this wrong
 * is the difference between a 300 TND job and a 1200 TND one.
 */
export const PART_CATALOG = {
  front: [
    { key: 'front_bumper', label: 'Pare-chocs avant', labelAr: 'الصدام الأمامي', price: [280, 760], hours: 1.8, threshold: 'minor', repairable: false },
    { key: 'front_grille', label: 'Calandre', labelAr: 'الشبكة الأمامية', price: [120, 340], hours: 0.8, threshold: 'minor', repairable: false },
    { key: 'headlight', label: 'Optique / phare avant', labelAr: 'الضوء الأمامي', price: [220, 980], hours: 1.0, threshold: 'moderate', repairable: false },
    { key: 'hood', label: 'Capot', labelAr: 'غطاء المحرك', price: [420, 1150], hours: 2.5, threshold: 'moderate', repairable: true },
    { key: 'front_fender', label: 'Aile avant', labelAr: 'الجناح الأمامي', price: [240, 620], hours: 2.0, threshold: 'moderate', repairable: true },
    { key: 'radiator', label: 'Radiateur', labelAr: 'الرادياتور', price: [380, 1100], hours: 2.2, threshold: 'severe', repairable: false },
    { key: 'front_crossmember', label: 'Traverse avant', labelAr: 'العارضة الأمامية', price: [300, 850], hours: 3.5, threshold: 'severe', repairable: true },
  ],
  rear: [
    { key: 'rear_bumper', label: 'Pare-chocs arrière', labelAr: 'الصدام الخلفي', price: [260, 720], hours: 1.6, threshold: 'minor', repairable: false },
    { key: 'taillight', label: 'Feu arrière', labelAr: 'الضوء الخلفي', price: [140, 520], hours: 0.7, threshold: 'moderate', repairable: false },
    { key: 'tailgate', label: 'Hayon / coffre', labelAr: 'باب الصندوق', price: [520, 1400], hours: 2.8, threshold: 'moderate', repairable: true },
    { key: 'rear_fender', label: 'Aile arrière', labelAr: 'الجناح الخلفي', price: [280, 700], hours: 2.6, threshold: 'moderate', repairable: true },
    { key: 'rear_panel', label: 'Panneau arrière', labelAr: 'اللوحة الخلفية', price: [340, 900], hours: 3.4, threshold: 'severe', repairable: true },
  ],
  left: [
    { key: 'front_door_l', label: 'Portière avant gauche', labelAr: 'الباب الأمامي الأيسر', price: [430, 1200], hours: 2.4, threshold: 'minor', repairable: true },
    { key: 'rear_door_l', label: 'Portière arrière gauche', labelAr: 'الباب الخلفي الأيسر', price: [410, 1150], hours: 2.4, threshold: 'moderate', repairable: true },
    { key: 'mirror_l', label: 'Rétroviseur gauche', labelAr: 'المرآة اليسرى', price: [95, 420], hours: 0.5, threshold: 'minor', repairable: false },
    { key: 'rocker_l', label: 'Bas de caisse gauche', labelAr: 'العتبة اليسرى', price: [260, 640], hours: 3.0, threshold: 'severe', repairable: true },
  ],
  right: [
    { key: 'front_door_r', label: 'Portière avant droite', labelAr: 'الباب الأمامي الأيمن', price: [430, 1200], hours: 2.4, threshold: 'minor', repairable: true },
    { key: 'rear_door_r', label: 'Portière arrière droite', labelAr: 'الباب الخلفي الأيمن', price: [410, 1150], hours: 2.4, threshold: 'moderate', repairable: true },
    { key: 'mirror_r', label: 'Rétroviseur droit', labelAr: 'المرآة اليمنى', price: [95, 420], hours: 0.5, threshold: 'minor', repairable: false },
    { key: 'rocker_r', label: 'Bas de caisse droit', labelAr: 'العتبة اليمنى', price: [260, 640], hours: 3.0, threshold: 'severe', repairable: true },
  ],
};

/** Body-shop labour, TND per hour — Tunis metro indicative rates. */
export const LABOUR_RATES = {
  bodywork: 45,
  paint: 55,
  mechanical: 60,
};

/**
 * Where to actually buy the part. These are *search entry points* into real
 * Tunisian channels — we link to a query, never claim stock.
 */
export const SHOPS = [
  {
    id: 'tayara',
    name: 'Tayara',
    kind: 'marketplace',
    note: 'Petites annonces — pièces neuves et occasion, tout le pays',
    search: (q) => `https://www.tayara.tn/ads?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'automobile-tn',
    name: 'Automobile.tn',
    kind: 'marketplace',
    note: 'Portail auto tunisien — pièces et garages',
    search: (q) => `https://www.automobile.tn/fr/recherche?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'gmaps-parts',
    name: 'Pièces auto près de vous',
    kind: 'local',
    note: 'Magasins de pièces détachées ouverts à proximité',
    search: (q, city) => `https://www.google.com/maps/search/${encodeURIComponent(`${q} pièces auto ${city || 'Tunis'}`)}`,
  },
  {
    id: 'gmaps-body',
    name: 'Carrossiers à proximité',
    kind: 'local',
    note: 'Ateliers de carrosserie et peinture',
    search: (_q, city) => `https://www.google.com/maps/search/${encodeURIComponent(`carrosserie tôlerie peinture ${city || 'Tunis'}`)}`,
  },
];

/** Build 3 shop links for one part. */
export function shopLinksFor(partLabel, city) {
  return SHOPS.slice(0, 3).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    note: s.note,
    url: s.search(partLabel, city),
  }));
}

/** Nearest known city label from GPS — used to localise the shop searches. */
const CITIES = [
  { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
  { name: 'Ariana', lat: 36.8625, lng: 10.1956 },
  { name: 'Ben Arous', lat: 36.7533, lng: 10.2189 },
  { name: 'La Marsa', lat: 36.8783, lng: 10.3247 },
  { name: 'Sfax', lat: 34.7406, lng: 10.7603 },
  { name: 'Sousse', lat: 35.8256, lng: 10.6084 },
  { name: 'Nabeul', lat: 36.4513, lng: 10.7357 },
  { name: 'Bizerte', lat: 37.2744, lng: 9.8739 },
  { name: 'Gabès', lat: 33.8815, lng: 10.0982 },
  { name: 'Kairouan', lat: 35.6781, lng: 10.0963 },
];

export function nearestCity(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'Tunis';
  let best = CITIES[0];
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}
