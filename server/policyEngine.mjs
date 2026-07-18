// Smart Policy Selection — adaptive Q&A engine + recommendation scoring.
// The client repeatedly POSTs { answers, profile } to /api/policy/step and gets back
// either the next question (adapted to previous answers) or a final recommendation.

export const POLICIES = [
  {
    id: 'rc-essentielle',
    name: 'RC Essentielle',
    tier: 1,
    tagline: 'The legal minimum, done right',
    base: 240,
    covers: ['Third-party liability (RC) — mandatory cover', 'Legal defense & recourse', 'Driver injury up to 20,000 TND'],
    notCovered: ['Your own vehicle damage', 'Theft & fire', 'Glass breakage'],
  },
  {
    id: 'tiers-confort',
    name: 'Tiers Confort',
    tier: 2,
    tagline: 'Liability plus the everyday annoyances',
    base: 420,
    covers: ['Everything in RC Essentielle', 'Glass breakage (windscreen, windows)', '24/7 roadside assistance & towing', 'Natural events (hail, flood)'],
    notCovered: ['Your own collision damage', 'Theft & fire'],
  },
  {
    id: 'vol-incendie',
    name: 'Vol & Incendie Plus',
    tier: 3,
    tagline: 'Protects the car you still owe money on — without full comprehensive pricing',
    base: 640,
    covers: ['Everything in Tiers Confort', 'Theft & attempted theft', 'Fire & explosion', 'Vandalism (up to 5,000 TND)'],
    notCovered: ['Your own collision damage'],
  },
  {
    id: 'tous-risques-optima',
    name: 'Tous Risques Optima',
    tier: 4,
    tagline: 'Full comprehensive — your car is covered even when the accident is your fault',
    base: 980,
    covers: ['Everything in Vol & Incendie Plus', 'All-accident own-damage cover', 'New-value replacement first 2 years', 'Deductible: 300 TND'],
    notCovered: [],
  },
  {
    id: 'tous-risques-prestige',
    name: 'Tous Risques Prestige',
    tier: 5,
    tagline: 'Zero deductible, replacement car, concierge claims',
    base: 1450,
    covers: ['Everything in Optima', 'Zero deductible', 'Replacement car up to 15 days', 'Priority claims concierge'],
    notCovered: [],
  },
];

// ---------------------------------------------------------------------------
// Question graph. `when` gates make the flow adaptive: answers you already
// gave (or profile data from eKYC) remove questions that no longer matter.
// ---------------------------------------------------------------------------
const QUESTIONS = [
  {
    id: 'vehicle_age',
    text: 'How old is the car you want to insure?',
    hint: 'This drives which covers are even worth paying for.',
    options: [
      { value: 'new', label: 'Brand new (< 1 year)', emoji: '✨' },
      { value: '1-3', label: '1–3 years', emoji: '🚗' },
      { value: '4-8', label: '4–8 years', emoji: '🚙' },
      { value: '9+', label: '9+ years', emoji: '🛻' },
    ],
  },
  {
    id: 'vehicle_value',
    text: 'Roughly, what is its market value today?',
    options: [
      { value: 'lt20', label: 'Under 20,000 TND' },
      { value: '20-50', label: '20,000 – 50,000 TND' },
      { value: '50-100', label: '50,000 – 100,000 TND' },
      { value: 'gt100', label: 'Over 100,000 TND' },
    ],
  },
  {
    id: 'financing',
    text: 'Is the car financed?',
    hint: 'Leasing contracts usually require comprehensive cover.',
    options: [
      { value: 'leasing', label: 'Yes — leasing', emoji: '🏦' },
      { value: 'credit', label: 'Yes — bank credit', emoji: '💳' },
      { value: 'owned', label: 'No — fully mine', emoji: '✅' },
    ],
  },
  {
    id: 'usage',
    text: 'How do you mainly use it?',
    options: [
      { value: 'commute', label: 'Daily commute', emoji: '🌆' },
      { value: 'occasional', label: 'Occasional / weekends', emoji: '🌴' },
      { value: 'professional', label: 'Professional (taxi, VTC, delivery)', emoji: '📦' },
    ],
  },
  {
    id: 'parking',
    text: 'Where does the car sleep at night?',
    hint: 'Street parking raises theft & vandalism exposure.',
    // Adaptive: theft cover is irrelevant for an old low-value car,
    // so we skip this question entirely in that case.
    when: (a) => !(a.vehicle_age === '9+' && a.vehicle_value === 'lt20'),
    options: [
      { value: 'garage', label: 'Private locked garage', emoji: '🔒' },
      { value: 'guarded', label: 'Guarded lot / residence', emoji: '🏢' },
      { value: 'street', label: 'On the street', emoji: '🌙' },
    ],
  },
  {
    id: 'annual_km',
    text: 'How many kilometres per year, roughly?',
    // Adaptive: occasional drivers are low-mileage by definition — skip.
    when: (a) => a.usage !== 'occasional',
    options: [
      { value: 'lt10', label: 'Under 10,000 km' },
      { value: '10-20', label: '10,000 – 20,000 km' },
      { value: 'gt20', label: 'Over 20,000 km' },
    ],
  },
  {
    id: 'record',
    text: 'Any at-fault accidents in the last 3 years?',
    options: [
      { value: 'none', label: 'None', emoji: '🥇' },
      { value: 'one', label: 'One', emoji: '⚠️' },
      { value: 'multi', label: 'More than one', emoji: '🔁' },
    ],
  },
  {
    id: 'priority',
    text: 'Last one — what matters most to you?',
    // Adaptive: a leased car must carry comprehensive cover anyway,
    // so budget preference cannot change the recommendation — skip it.
    when: (a) => a.financing !== 'leasing',
    options: [
      { value: 'price', label: 'Lowest possible price', emoji: '💰' },
      { value: 'balanced', label: 'Good balance', emoji: '⚖️' },
      { value: 'protection', label: 'Maximum protection', emoji: '🛡️' },
    ],
  },
];

export function nextStep(answers = {}, profile = {}) {
  for (const q of QUESTIONS) {
    if (answers[q.id] !== undefined) continue;
    if (q.when && !q.when(answers)) continue;
    const { when, ...serializable } = q;
    const asked = QUESTIONS.filter((x) => answers[x.id] !== undefined).length;
    const remaining = QUESTIONS.filter(
      (x) => answers[x.id] === undefined && (!x.when || x.when(answers))
    ).length;
    return { type: 'question', question: serializable, progress: { asked, remaining } };
  }
  return { type: 'recommendation', ...recommend(answers, profile) };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function recommend(a, profile) {
  const scores = new Map(POLICIES.map((p) => [p.id, 0]));
  const reasons = [];
  const add = (id, pts) => scores.set(id, scores.get(id) + pts);
  const boostTier = (minTier, pts) =>
    POLICIES.forEach((p) => p.tier >= minTier && add(p.id, pts));
  const capTier = (maxTier, pts) =>
    POLICIES.forEach((p) => p.tier <= maxTier && add(p.id, pts));

  // --- Financing: hard constraint for leasing ---
  if (a.financing === 'leasing') {
    boostTier(4, 100);
    reasons.push('Your leasing contract requires comprehensive (tous risques) cover — we filtered out everything that would breach it.');
  } else if (a.financing === 'credit') {
    boostTier(3, 35);
    reasons.push('The car is still being paid off, so theft & fire cover protects the money you owe the bank.');
  }

  // --- Vehicle age & value: is own-damage cover economically rational? ---
  const lowValue = a.vehicle_value === 'lt20';
  const highValue = a.vehicle_value === 'gt100' || a.vehicle_value === '50-100';
  if (a.vehicle_age === '9+' && lowValue) {
    capTier(2, 45);
    reasons.push('At this vehicle age and value, comprehensive premiums would exceed what you could ever claim back — liability + assistance is the rational buy.');
  }
  if ((a.vehicle_age === 'new' || a.vehicle_age === '1-3') && highValue) {
    boostTier(4, 45);
    reasons.push('A recent, high-value car concentrates your risk in the car itself — own-damage cover is where the protection actually is.');
  } else if (a.vehicle_age === 'new') {
    boostTier(4, 25);
    reasons.push('New-value replacement in the first 2 years only pays off on a car this recent.');
  }
  if (a.vehicle_value === '20-50' && (a.vehicle_age === '1-3' || a.vehicle_age === '4-8')) {
    add('vol-incendie', 25);
    add('tous-risques-optima', 15);
  }

  // --- Parking: theft exposure ---
  if (a.parking === 'street') {
    add('vol-incendie', 30);
    boostTier(4, 15);
    if (!lowValue) reasons.push('Street parking is the #1 theft/vandalism factor in our book — theft & fire cover earns its premium here.');
  } else if (a.parking === 'garage') {
    add('tiers-confort', 10);
  }

  // --- Usage ---
  if (a.usage === 'professional') {
    boostTier(3, 25);
    reasons.push('Professional use means more hours exposed on the road — a claim is a matter of when, not if.');
  } else if (a.usage === 'occasional') {
    capTier(2, 15);
  }
  if (a.annual_km === 'gt20') boostTier(3, 15);
  if (a.annual_km === 'lt10') capTier(2, 10);

  // --- Record ---
  if (a.record === 'multi') {
    boostTier(4, 20);
    reasons.push('With recent at-fault claims, own-damage cover shields you from paying twice for the same mistake.');
  } else if (a.record === 'none') {
    reasons.push('A clean 3-year record earns you our best no-claims pricing tier.');
  }

  // --- Stated priority ---
  if (a.priority === 'price') {
    capTier(2, 30);
    add('rc-essentielle', 10);
  } else if (a.priority === 'protection') {
    boostTier(4, 30);
    add('tous-risques-prestige', 10);
  } else if (a.priority === 'balanced') {
    add('tiers-confort', 15);
    add('vol-incendie', 20);
    add('tous-risques-optima', 15);
  }

  // --- Rank ---
  const ranked = [...POLICIES].sort((p, q) => scores.get(q.id) - scores.get(p.id));
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const top = scores.get(winner.id);
  const second = scores.get(runnerUp.id);
  const confidence = Math.min(96, Math.max(62, Math.round(62 + ((top - second) / Math.max(top, 1)) * 40)));

  // --- Premium estimate ---
  let premium = winner.base;
  const valueFactor = { lt20: 0.9, '20-50': 1.0, '50-100': 1.25, gt100: 1.55 }[a.vehicle_value] ?? 1;
  const usageFactor = { commute: 1.0, occasional: 0.92, professional: 1.3 }[a.usage] ?? 1;
  const recordFactor = { none: 0.85, one: 1.1, multi: 1.35 }[a.record] ?? 1;
  const parkingFactor = { garage: 0.95, guarded: 1.0, street: 1.08 }[a.parking] ?? 1;
  premium = premium * valueFactor * usageFactor * recordFactor * parkingFactor;

  // Young-driver loading straight from the eKYC profile — nothing re-asked.
  let youngDriver = false;
  if (profile?.age && profile.age < 25) {
    premium *= 1.2;
    youngDriver = true;
    reasons.push('Driver age came straight from your verified eKYC profile — no re-entry, but it does apply a young-driver loading.');
  }
  premium = Math.round(premium / 10) * 10;

  const whyNotRunnerUp = buildWhyNot(winner, runnerUp, a);

  return {
    policy: winner,
    premiumTND: premium,
    confidence,
    reasons: reasons.slice(0, 4),
    youngDriver,
    runnerUp: { name: runnerUp.name, whyNot: whyNotRunnerUp },
    answers: a,
  };
}

function buildWhyNot(winner, runnerUp, a) {
  if (runnerUp.tier > winner.tier) {
    return `${runnerUp.name} adds cover you'd likely never claim on given your car's age/value — you'd be paying for protection with no payout scenario.`;
  }
  if (runnerUp.tier < winner.tier) {
    if (a.financing === 'leasing') return `${runnerUp.name} would breach your leasing contract's insurance clause.`;
    return `${runnerUp.name} is cheaper, but it leaves your single biggest exposure uncovered.`;
  }
  return `${runnerUp.name} scored nearly as well — the difference is in the details of the deductible.`;
}
