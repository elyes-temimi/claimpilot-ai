// Fraud engine — does the story survive contact with the evidence?
//
// Two layers, deliberately:
//
//  1. RULES (consistency.mjs + the physics checks below). Deterministic,
//     explainable, always available. These carry the score.
//  2. LLM (local llama3). Reads the *raw* statement in French / Arabic /
//     Darija / English — including the mixed-language sentences a lexicon
//     can't fully parse — and reasons about whether the narrative is
//     physically coherent: you cannot be rear-ended and show front damage;
//     you cannot be stationary and describe overtaking at speed.
//
// The LLM can raise or lower confidence and add findings, but it is capped:
// it can move the score by at most LLM_MAX_SWING. A hallucinating 8B model
// must never be able to single-handedly brand a claim fraudulent, and an
// offline Ollama must never make a fraudulent claim look clean.
//
// Output is *assistance*. The liability decision stays human — the verdict
// field routes the case, it doesn't settle it.

import { askJson, clampNumber, oneOf, stringList } from './llm.mjs';
import { analyzeConsistency } from './consistency.mjs';

const LLM_MAX_SWING = 22;

const OPPOSITE = { front: 'rear', rear: 'front', left: 'right', right: 'left' };

const SIDES_OF_ZONE = {
  front: ['front'],
  'front-left': ['front', 'left'],
  'front-right': ['front', 'right'],
  left: ['left'],
  right: ['right'],
  rear: ['rear'],
  'rear-left': ['rear', 'left'],
  'rear-right': ['rear', 'right'],
};

const zoneSides = (zone) => SIDES_OF_ZONE[zone] || [];

function damagedSides(evidence) {
  const sides = new Set();
  for (const ph of evidence?.photos || []) {
    if (ph.severity !== 'minor' || ph.damageRatio > 0.03) sides.add(ph.side);
  }
  return [...sides];
}

// ---------------------------------------------------------------------------
// Physics / narrative checks the lexicon rules don't cover
// ---------------------------------------------------------------------------

/**
 * The signature check from the brief: "I was hit from behind" while the photos
 * show a caved-in front end. Returns findings, each with a score weight.
 */
function physicalChecks(session) {
  const findings = [];

  for (const p of session.participants) {
    const ev = p.evidence;
    if (!ev) continue;
    const first = (p.name || '').split(' ')[0] || p.role;
    const slots = ev.statement?.slots || {};
    const dir = slots.impactDirection;
    const sides = damagedSides(ev);

    // 1. Claimed impact direction vs photographed damage
    if (dir && sides.length > 0 && !sides.includes(dir)) {
      const isOpposite = sides.includes(OPPOSITE[dir]);
      findings.push({
        role: p.role,
        code: 'story_vs_photos',
        severity: isOpposite ? 'high' : 'medium',
        // A claimed impact on the exact opposite face of the car is the single
        // strongest signal in this whole engine — it is not a wording slip, the
        // metal cannot lie. On its own it must push the case into "high".
        weight: isOpposite ? 58 : 18,
        title: `${first}: impact déclaré incompatible avec les photos`,
        detail: isOpposite
          ? `Le récit indique un choc à l'${dir === 'rear' ? 'arrière' : dir}, mais les dégâts détectés sont exactement à l'opposé (${sides.join(', ')}). Contradiction physique directe.`
          : `Le récit indique un choc côté ${dir}, les dégâts sont côté ${sides.join(', ')}.`,
        origin: 'rules',
      });
    }

    // 2. Stationary + severe damage is unusual: a parked car absorbs, it doesn't crumple
    const severe = (ev.photos || []).some((ph) => ph.severity === 'severe');
    if (severe && (slots.movement === 'stationary' || slots.movement === 'parked')) {
      findings.push({
        role: p.role,
        code: 'stationary_vs_severity',
        severity: 'low',
        weight: 8,
        title: `${first}: dégâts sévères pour un véhicule à l'arrêt`,
        detail:
          "Le conducteur se déclare à l'arrêt mais les dégâts sont classés sévères — possible si l'autre véhicule roulait vite, à confirmer par l'expert.",
        origin: 'rules',
      });
    }

    // 3. Claimed a direction but photographed nothing
    if (dir && sides.length === 0 && (ev.photos || []).length > 0) {
      findings.push({
        role: p.role,
        code: 'no_damage_found',
        severity: 'medium',
        weight: 16,
        title: `${first}: dégâts non confirmés par les photos`,
        detail: `Un choc côté ${dir} est déclaré, mais l'analyse visuelle ne trouve aucune zone endommagée significative sur les photos fournies.`,
        origin: 'rules',
      });
    }

    // 4. Statement vs the zone tapped on the car diagram
    if (dir && p.impact) {
      const marked = zoneSides(p.impact);
      if (!marked.includes(dir)) {
        findings.push({
          role: p.role,
          code: 'story_vs_diagram',
          severity: 'medium',
          weight: 14,
          title: `${first}: récit différent du schéma`,
          detail: `Zone marquée sur le schéma: ${p.impact.replace('-', ' ')} — récit: choc côté ${dir}.`,
          origin: 'rules',
        });
      }
    }
  }

  // 5. Cross-driver: two cars cannot both be rear-ended by each other
  const [a, b] = session.participants;
  if (a?.impact && b?.impact) {
    const sa = zoneSides(a.impact);
    const sb = zoneSides(b.impact);
    if (sa.every((s) => s === 'rear') && sb.every((s) => s === 'rear')) {
      findings.push({
        role: null,
        code: 'impossible_geometry',
        severity: 'high',
        weight: 30,
        title: 'Géométrie de collision impossible',
        detail:
          'Les deux véhicules déclarent un choc uniquement à l\'arrière — deux voitures ne peuvent pas se emboutir mutuellement par l\'arrière.',
        origin: 'rules',
      });
    }
  }

  // 6. Both stationary — someone was moving
  const mvA = a?.evidence?.statement?.slots?.movement;
  const mvB = b?.evidence?.statement?.slots?.movement;
  if (mvA && mvB) {
    const still = ['stationary', 'parked'];
    if (still.includes(mvA) && still.includes(mvB)) {
      findings.push({
        role: null,
        code: 'both_stationary',
        severity: 'high',
        weight: 26,
        title: 'Les deux conducteurs se déclarent à l\'arrêt',
        detail:
          'Aucun des deux véhicules ne serait en mouvement — au moins un des deux récits est incomplet ou inexact.',
        origin: 'rules',
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// LLM layer
// ---------------------------------------------------------------------------

function describeDriver(p) {
  const ev = p.evidence;
  const slots = ev?.statement?.slots || {};
  const photos = (ev?.photos || [])
    .map((ph) => `${ph.side} (${ph.severity}, ${Math.round((ph.damageRatio || 0) * 100)}% de la surface)`)
    .join('; ') || 'aucune photo analysée';

  return [
    `--- Conducteur ${p.role} (${p.name}) ---`,
    `Déclaration brute (langue d'origine, peut mélanger français/arabe/derja/anglais):`,
    `"${ev?.statement?.raw || '(aucune déclaration)'}"`,
    `Faits extraits automatiquement: direction du choc=${slots.impactDirection || 'inconnue'}, ` +
      `mouvement=${slots.movement || 'inconnu'}, responsabilité=${slots.faultClaim || 'non déclarée'}, ` +
      `blessés=${slots.injuries === null || slots.injuries === undefined ? 'inconnu' : slots.injuries}`,
    `Zone marquée sur le schéma du constat: ${p.impact || 'non marquée'}`,
    `Dégâts détectés par l'IA visuelle: ${photos}`,
  ].join('\n');
}

const SYSTEM_PROMPT = [
  "Tu es un analyste anti-fraude pour l'assurance automobile en Tunisie.",
  'Tu lis des déclarations rédigées en français, en arabe, en derja tunisienne (y compris en arabizi avec des chiffres 3/7/9), en anglais, ou dans un mélange des quatre.',
  '',
  'Ton travail: vérifier si le RÉCIT du conducteur est physiquement cohérent avec les DÉGÂTS constatés sur les photos et avec le récit de l\'autre conducteur.',
  '',
  'Exemples de contradictions à détecter:',
  "- déclarer un choc à l'arrière alors que les dégâts sont à l'avant (ou l'inverse)",
  "- se déclarer à l'arrêt tout en décrivant un dépassement ou une vitesse élevée",
  '- décrire une vitesse ou une violence de choc incompatible avec des dégâts légers, ou inversement',
  '- deux conducteurs qui se déclarent tous les deux à l\'arrêt',
  '- une position sur le schéma qui contredit le récit',
  '',
  'RAPPEL DE PHYSIQUE — ne te trompe pas là-dessus:',
  "Dans une collision par l'arrière, l'AVANT du véhicule qui suit heurte l'ARRIÈRE du véhicule qui précède.",
  "Il est donc totalement NORMAL et COHÉRENT qu'un conducteur ait des dégâts à l'arrière pendant que l'autre a des dégâts à l'avant.",
  "Ce n'est PAS une contradiction. Ne le signale jamais comme telle.",
  "De même, dans un choc latéral, l'avant de l'un heurte le côté de l'autre: c'est cohérent.",
  '',
  'La VRAIE contradiction est interne à UN SEUL conducteur:',
  "son récit dit une chose, ses propres photos ou son propre schéma en disent une autre.",
  '',
  "IMPORTANT: une incohérence n'est pas une preuve de fraude. Un conducteur stressé s'exprime mal.",
  "Ne signale que ce qui est réellement contradictoire, pas ce qui est simplement imprécis ou manquant.",
  'En cas de doute, ne signale rien.',
  'Réponds UNIQUEMENT avec un objet JSON.',
].join('\n');

async function llmAnalysis(session) {
  const drivers = session.participants.filter((p) => p.evidence).map(describeDriver).join('\n\n');
  if (!drivers) return null;

  const out = await askJson({
    system: SYSTEM_PROMPT,
    prompt: [
      "Voici un constat amiable d'accident. Analyse-le.",
      '',
      drivers,
      '',
      'Réponds en JSON avec exactement ces clés:',
      '{',
      '  "risk": "low" | "medium" | "high",',
      '  "confidence": nombre entre 0 et 1,',
      '  "summary": "une phrase en français résumant si le dossier est cohérent",',
      '  "contradictions": [',
      '     {"driver": "A" ou "B" ou "both",',
      '      "what": "la contradiction en une phrase, en français",',
      '      "severity": "low" | "medium" | "high"}',
      '  ],',
      '  "translated_statements": [{"driver":"A" ou "B","meaning":"traduction française du récit en une phrase"}]',
      '}',
      '',
      'Si tout est cohérent, renvoie "contradictions": [] et "risk": "low".',
    ].join('\n'),
    timeoutMs: 90000,
  });

  const contradictions = Array.isArray(out.contradictions) ? out.contradictions : [];

  return {
    risk: oneOf(out.risk, ['low', 'medium', 'high']) || 'low',
    confidence: clampNumber(out.confidence, 0, 1, 0.5),
    summary: typeof out.summary === 'string' ? out.summary.slice(0, 400) : null,
    contradictions: contradictions
      .filter((c) => c && typeof c.what === 'string')
      .slice(0, 6)
      .map((c) => ({
        driver: oneOf(c.driver, ['a', 'b', 'both']),
        what: c.what.trim().slice(0, 300),
        severity: oneOf(c.severity, ['low', 'medium', 'high']) || 'medium',
      })),
    translations: Array.isArray(out.translated_statements)
      ? out.translated_statements
          .filter((t) => t && typeof t.meaning === 'string')
          .slice(0, 2)
          .map((t) => ({
            driver: (oneOf(t.driver, ['a', 'b']) || '').toUpperCase() || null,
            meaning: t.meaning.trim().slice(0, 300),
          }))
      : [],
    raw: stringList([out.summary], 1),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const riskFromScore = (score) => (score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low');

const VERDICT_RANK = { 'fast-track': 0, standard: 1, adjuster: 2 };
const RISK_TO_VERDICT = { low: 'fast-track', medium: 'standard', high: 'adjuster' };

/**
 * Route on the more cautious of the two views. A case can look tidy to the
 * consistency pass while the fraud checks are alarmed — it must not be
 * fast-tracked just because one of the two engines was relaxed.
 */
function worstVerdict(consistencyVerdict, risk) {
  const fromRisk = RISK_TO_VERDICT[risk] || 'standard';
  if (!consistencyVerdict) return fromRisk;
  return VERDICT_RANK[consistencyVerdict] >= VERDICT_RANK[fromRisk] ? consistencyVerdict : fromRisk;
}

/**
 * Full fraud assessment for a session.
 * Always returns a report — LLM failure degrades to rules-only, flagged as such.
 *
 * @returns {Promise<object|null>} null when there is no evidence at all yet
 */
export async function analyzeFraud(session, { useLlm = true } = {}) {
  const consistency = analyzeConsistency(session);
  const hasEvidence = session.participants.some((p) => p.evidence);
  if (!hasEvidence) return null;

  const ruleFindings = physicalChecks(session);

  // Rules drive the base score.
  let score = ruleFindings.reduce((s, f) => s + f.weight, 0);

  let llm = null;
  let llmError = null;
  if (useLlm) {
    try {
      llm = await llmAnalysis(session);
    } catch (err) {
      llmError = err.message;
    }
  }

  // Deterministic findings are established facts about the file.
  const findings = ruleFindings.map((f) => ({ ...f, confirmed: true }));

  if (llm) {
    // The LLM adds its own findings, but its total influence is bounded.
    const perContradiction = { low: 4, medium: 9, high: 14 };
    let swing = 0;
    for (const c of llm.contradictions) {
      const role = c.driver === 'both' ? null : (c.driver || '').toUpperCase() || null;

      // Corroboration gate. An 8B model reading four languages at once will
      // occasionally produce confident nonsense — on a clean rear-end it has
      // claimed "both drivers say they were stationary" when one plainly said
      // he was braking. If no deterministic check flagged the same driver, we
      // keep the observation but present it as "to verify" rather than as an
      // established contradiction, and we discount its weight.
      const corroborated = ruleFindings.some(
        (f) => f.role === null || role === null || f.role === role
      );
      const w = perContradiction[c.severity] || 6;
      swing += corroborated ? w : Math.round(w * 0.4);

      findings.push({
        role,
        code: 'llm_contradiction',
        severity: corroborated ? c.severity : 'low',
        weight: w,
        confirmed: corroborated,
        title: corroborated
          ? "Incohérence relevée par l'analyse linguistique"
          : "Point à vérifier (analyse linguistique, non corroboré)",
        detail: c.what,
        origin: 'llm',
      });
    }
    // If the model sees a clean story where rules found nothing, let it calm the score slightly.
    if (llm.contradictions.length === 0 && ruleFindings.length === 0) {
      swing = -6;
    }
    score += Math.max(-LLM_MAX_SWING, Math.min(LLM_MAX_SWING, swing));
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const risk = riskFromScore(score);

  // Integrity and fraud risk must never tell opposite stories on screen. The
  // physics checks here catch things the older consistency pass doesn't (it
  // only compares literal 'stationary', so a parked/stationary pair slips by),
  // so integrity takes the harsher of the two views.
  const integrityScore = Math.max(
    5,
    Math.min(consistency ? consistency.score : 100, 100 - score)
  );

  // Only let the model narrate the file when something was actually
  // established — otherwise its summary can announce contradictions that the
  // corroboration gate just demoted, which reads as alarming nonsense.
  const confirmedCount = findings.filter((f) => f.confirmed).length;
  const advisoryCount = findings.length - confirmedCount;

  const summary =
    confirmedCount > 0
      ? // ...and only when the model itself saw a problem. Left unguarded it
        // will happily narrate "tout est cohérent" over a high-severity
        // physical contradiction the rules just proved.
        (llm?.contradictions.length > 0 && llm.summary) ||
        `${confirmedCount} incohérence(s) établie(s) entre les récits et les preuves.`
      : advisoryCount > 0
        ? `Aucune contradiction établie. ${advisoryCount} point(s) à vérifier signalé(s) par l'analyse linguistique.`
        : 'Aucune contradiction détectée entre les récits, les photos et les schémas.';

  return {
    score,
    risk,
    flagged: risk === 'high',
    summary,
    findings: findings.map(({ weight, ...f }) => f),
    consistency,
    integrityScore,
    verdict: worstVerdict(consistency?.verdict, risk),
    llm: llm
      ? {
          used: true,
          risk: llm.risk,
          confidence: llm.confidence,
          translations: llm.translations,
        }
      : { used: false, error: llmError },
    analysedBy: llm ? 'llama3 (local) + règles' : 'règles déterministes seules',
    computedAt: new Date().toISOString(),
    disclaimer:
      "Analyse d'assistance. Les signalements n'établissent pas la responsabilité — la décision reste humaine.",
  };
}
