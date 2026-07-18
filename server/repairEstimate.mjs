// Repair cost estimation.
//
// The pipeline the brief asked for: Vision AI says *where* the car is hit and
// *how badly* → we resolve that to concrete parts from the local market
// database → we price parts + labour + paint in TND → we attach real shop
// search links so the driver can go buy it.
//
// Part selection is deterministic (a price on screen should be reproducible
// and explainable). The LLM is used only to add a short human rationale and to
// suggest *hidden* damage a photo can't show — clearly labelled as "à vérifier"
// and never silently added to the total.

import { askJson, stringList } from './llm.mjs';
import {
  LABOUR_RATES,
  PART_CATALOG,
  VEHICLE_TIERS,
  nearestCity,
  shopLinksFor,
} from './marketData.mjs';

const SEV_RANK = { minor: 0, moderate: 1, severe: 2 };
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Worst severity recorded per side across a driver's photos.
 * @returns {Record<string, {severity: string, ratio: number, confidence: number}>}
 */
function worstBySide(photos) {
  const out = {};
  for (const ph of photos || []) {
    if (!ph?.side) continue;
    const cur = out[ph.side];
    if (!cur || SEV_RANK[ph.severity] > SEV_RANK[cur.severity]) {
      out[ph.side] = {
        severity: ph.severity || 'minor',
        ratio: Number(ph.damageRatio) || 0,
        confidence: Number(ph.confidence) || 0,
      };
    }
  }
  return out;
}

/**
 * Where in the part's price band this damage sits.
 * A severe hit with a large damaged area lands at the top of the range.
 */
function priceWithinBand([low, high], severity, ratio) {
  const sevBase = { minor: 0.12, moderate: 0.45, severe: 0.8 }[severity] ?? 0.3;
  // damageRatio is 0..~0.2 in practice; normalise it to a 0..1 nudge
  const areaBoost = Math.min(0.2, (ratio || 0) * 1.4);
  const t = Math.max(0, Math.min(1, sevBase + areaBoost));
  return low + (high - low) * t;
}

/**
 * What the shop actually does to the part.
 *  - severe    → replace, whatever it is
 *  - moderate  → beat out and refinish metal; swap plastic/glass/optics
 *  - minor     → smart repair + paint, never a replacement
 */
function actionFor(part, severity) {
  if (severity === 'severe') return 'replace';
  if (severity === 'moderate') return part.repairable ? 'repair' : 'replace';
  return 'repair';
}

/**
 * Deterministic estimate for one driver.
 *
 * @param {object} opts
 * @param {Array}  opts.photos   - analysed damage photos [{side, severity, damageRatio, confidence}]
 * @param {string} [opts.impact] - the impact zone marked on the car diagram (e.g. 'rear-left')
 * @param {string} [opts.tier]   - 'economy' | 'standard' | 'premium'
 * @param {object} [opts.position] - {lat, lng} to localise shop links
 */
export function estimateRepair({ photos, impact, tier = 'standard', position } = {}) {
  const tierDef = VEHICLE_TIERS[tier] || VEHICLE_TIERS.standard;
  const city = nearestCity(position?.lat, position?.lng);
  const sides = worstBySide(photos);

  // The diagram tap is corroborating evidence: if the driver marked "rear-left"
  // we consider those sides even when only one of them was photographed.
  for (const zonePart of String(impact || '').split('-')) {
    if (PART_CATALOG[zonePart] && !sides[zonePart]) {
      sides[zonePart] = { severity: 'minor', ratio: 0, confidence: 0.3, fromDiagram: true };
    }
  }

  const lines = [];
  for (const [side, info] of Object.entries(sides)) {
    const catalog = PART_CATALOG[side];
    if (!catalog) continue;
    for (const part of catalog) {
      if (SEV_RANK[info.severity] < SEV_RANK[part.threshold]) continue;

      const action = actionFor(part, info.severity);
      const bandPrice = priceWithinBand(part.price, info.severity, info.ratio) * tierDef.factor;

      // A repair consumes materials, not a new part.
      const partsCost = action === 'replace' ? bandPrice : bandPrice * 0.18;
      const hours = action === 'replace' ? part.hours : part.hours * 0.75;
      const labourCost = hours * LABOUR_RATES.bodywork;
      // Anything visible gets refinished.
      const paintCost = hours * 0.6 * LABOUR_RATES.paint;

      lines.push({
        side,
        partKey: part.key,
        partLabel: part.label,
        partLabelAr: part.labelAr,
        action,
        severity: info.severity,
        fromDiagram: !!info.fromDiagram,
        partsCost: round2(partsCost),
        labourCost: round2(labourCost + paintCost),
        labourHours: round2(hours),
        total: round2(partsCost + labourCost + paintCost),
        currency: 'TND',
        source: 'Local parts market (indicative)',
        shops: shopLinksFor(part.label, city),
      });
    }
  }

  lines.sort((a, b) => b.total - a.total);

  const partsTotal = round2(lines.reduce((s, l) => s + l.partsCost, 0));
  const labourTotal = round2(lines.reduce((s, l) => s + l.labourCost, 0));
  const subtotal = round2(partsTotal + labourTotal);
  // Tunisian VAT
  const vat = round2(subtotal * 0.19);
  const total = round2(subtotal + vat);

  // Honest uncertainty band: photo-derived estimates are ±25%, and wider when
  // the vision confidence was poor.
  const avgConfidence =
    lines.length > 0
      ? Object.values(sides).reduce((s, i) => s + (i.confidence || 0), 0) / Object.keys(sides).length
      : 0;
  const spread = 0.25 + (1 - Math.min(1, avgConfidence)) * 0.15;

  return {
    currency: 'TND',
    tier,
    tierLabel: tierDef.label,
    city,
    lines,
    partsTotal,
    labourTotal,
    subtotal,
    vatRate: 0.19,
    vat,
    total,
    rangeLow: round2(total * (1 - spread)),
    rangeHigh: round2(total * (1 + spread)),
    confidence: round2(Math.max(0.35, Math.min(0.92, avgConfidence || 0.5))),
    sides: Object.keys(sides),
    disclaimer:
      'Estimation indicative basée sur les prix de référence du marché local — ne constitue pas un devis ferme.',
    computedAt: new Date().toISOString(),
    hiddenDamage: [],
    rationale: null,
    llmUsed: false,
  };
}

/**
 * Optional LLM pass: a plain-language rationale plus likely hidden damage.
 * Never mutates the total — hidden damage is advisory only.
 * Falls back silently to the deterministic estimate if Ollama is down.
 */
export async function enrichEstimate(estimate, { vehicleMake, impact } = {}) {
  if (estimate.lines.length === 0) return estimate;

  const partList = estimate.lines.map((l) => `${l.partLabel} (${l.action}, ${l.severity})`).join(', ');

  try {
    const out = await askJson({
      system:
        'You are a Tunisian motor-claims damage assessor. You reason about car body repair. ' +
        'Answer in French, concisely. Reply ONLY with a JSON object.',
      prompt: [
        `Véhicule: ${vehicleMake || 'non précisé'}.`,
        `Zone de choc déclarée: ${impact || 'non précisée'}.`,
        `Côtés endommagés détectés par l'analyse photo: ${estimate.sides.join(', ')}.`,
        `Pièces retenues par le barème: ${partList}.`,
        `Total estimé: ${estimate.total} TND.`,
        '',
        'Réponds en JSON avec exactement ces clés:',
        '{"rationale": "2 phrases max expliquant l\'estimation à l\'assuré",',
        ' "hidden_damage": ["pièces non visibles sur photo à vérifier à l\'atelier, max 4"]}',
      ].join('\n'),
      timeoutMs: 40000,
    });

    return {
      ...estimate,
      rationale: typeof out.rationale === 'string' ? out.rationale.slice(0, 400) : null,
      hiddenDamage: stringList(out.hidden_damage, 4, 120),
      llmUsed: true,
    };
  } catch {
    return estimate;
  }
}
