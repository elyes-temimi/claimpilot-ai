// Consistency Engine — cross-examines every signal in the case:
// each driver's story vs their photos vs their impact diagram, the two
// stories against each other, collision geometry, and scene proximity.
// Output: a case integrity score + named checks, framed as *assistance* —
// the liability call stays human.

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

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export function analyzeConsistency(session) {
  const checks = [];
  const add = (id, status, title, detail) => checks.push({ id, status, title, detail });

  const withEvidence = session.participants.filter((p) => p.evidence);
  if (withEvidence.length === 0) return null;

  // ---------- Per-driver checks ----------
  for (const p of session.participants) {
    const ev = p.evidence;
    if (!ev) continue;
    const first = p.name.split(' ')[0];
    const dir = ev.statement?.slots?.impactDirection || null;
    const photoSides = damagedSides(ev);

    // Story vs photos — the flagship check ("rear-ended claim vs front damage")
    if (dir && photoSides.length > 0) {
      if (photoSides.includes(dir)) {
        add(
          `story-photos-${p.role}`,
          'pass',
          `${first}: story matches the dents`,
          `Statement says impact from the ${dir}; Vision AI found damage on the ${photoSides.join(' & ')}.`
        );
      } else {
        add(
          `story-photos-${p.role}`,
          'flag',
          `${first}: story contradicts the photos`,
          `Statement says impact from the ${dir}, but Vision AI found damage on the ${photoSides.join(' & ')} — classic inconsistency, routed to review.`
        );
      }
    } else if (dir || photoSides.length > 0) {
      add(
        `story-photos-${p.role}`,
        'unknown',
        `${first}: story vs photos incomplete`,
        dir ? 'No analyzable damage photos yet.' : 'No impact direction found in the statement yet.'
      );
    }

    // Story vs the Phase 3 impact diagram
    if (dir && p.impact) {
      const sides = zoneSides(p.impact);
      if (sides.includes(dir)) {
        add(
          `story-diagram-${p.role}`,
          'pass',
          `${first}: story matches their tap on the car diagram`,
          `Marked "${p.impact.replace('-', ' ')}" at the scene; statement says "${dir}".`
        );
      } else {
        add(
          `story-diagram-${p.role}`,
          'flag',
          `${first}: story differs from the scene diagram`,
          `Marked "${p.impact.replace('-', ' ')}" at the scene but the statement says impact from the ${dir}.`
        );
      }
    }

    // Photos vs diagram
    if (photoSides.length > 0 && p.impact) {
      const sides = zoneSides(p.impact);
      const overlap = photoSides.some((s) => sides.includes(s));
      add(
        `photos-diagram-${p.role}`,
        overlap ? 'pass' : 'flag',
        overlap ? `${first}: photos match the marked zone` : `${first}: photos don't match the marked zone`,
        `Diagram: ${p.impact.replace('-', ' ')} · photographed damage: ${photoSides.join(' & ')}.`
      );
    }
  }

  // ---------- Cross-driver checks ----------
  const [a, b] = session.participants;
  if (a && b) {
    // Collision geometry plausibility
    if (a.impact && b.impact) {
      const sa = zoneSides(a.impact);
      const sb = zoneSides(b.impact);
      const bothRearOnly = sa.every((s) => s === 'rear') && sb.every((s) => s === 'rear');
      const rearEnd =
        (sa.includes('front') && sb.includes('rear')) || (sa.includes('rear') && sb.includes('front'));
      const tBone =
        (sa.includes('front') && (sb.includes('left') || sb.includes('right'))) ||
        (sb.includes('front') && (sa.includes('left') || sa.includes('right')));
      const headOn = sa.includes('front') && sb.includes('front');

      if (bothRearOnly) {
        add('geometry', 'flag', 'Implausible collision geometry',
          'Both cars marked damage only at the rear — two vehicles cannot rear-end each other simultaneously.');
      } else if (rearEnd) {
        add('geometry', 'pass', 'Collision geometry consistent',
          `${a.name.split(' ')[0]}: ${a.impact.replace('-', ' ')} ↔ ${b.name.split(' ')[0]}: ${b.impact.replace('-', ' ')} — classic rear-end pattern.`);
      } else if (tBone || headOn) {
        add('geometry', 'pass', 'Collision geometry consistent',
          `Marked zones form a plausible ${headOn ? 'head-on' : 'side-impact'} pattern.`);
      } else {
        add('geometry', 'info', 'Collision geometry unusual',
          'Marked zones form an uncommon pattern — worth an adjuster glance.');
      }
    }

    // Statements vs each other
    const slotsA = a.evidence?.statement?.slots;
    const slotsB = b.evidence?.statement?.slots;
    if (slotsA && slotsB) {
      if (slotsA.movement === 'stationary' && slotsB.movement === 'stationary') {
        add('stories', 'flag', 'Accounts conflict',
          'Both drivers claim to have been stationary — at least one account is incomplete.');
      } else if (
        (slotsA.faultClaim === 'other' && slotsB.faultClaim === 'self') ||
        (slotsA.faultClaim === 'self' && slotsB.faultClaim === 'other')
      ) {
        add('stories', 'pass', 'Accounts agree on fault',
          'One driver attributes fault, the other accepts it — the two statements corroborate each other.');
      } else if (slotsA.faultClaim === 'other' && slotsB.faultClaim === 'other') {
        add('stories', 'info', 'Fault contested',
          'Both drivers attribute fault to the other party — liability assistance will weigh the physical evidence.');
      }
      if (slotsA.injuries === true || slotsB.injuries === true) {
        add('injuries', 'info', 'Injuries reported', 'Statement mentions injuries — medical documentation will be requested.');
      }
    }

    // Scene proximity
    if (a.position && b.position) {
      const d = haversineMeters(a.position, b.position);
      const sim = a.position.simulated || b.position.simulated;
      if (d <= 150) {
        add('proximity', 'pass', 'Both devices at the scene',
          `Phones were ≈${d} m apart when the case was filed${sim ? ' (includes simulated location)' : ''}.`);
      } else {
        add('proximity', 'flag', 'Devices far apart',
          `Phones were ≈${(d / 1000).toFixed(1)} km apart — unusual for a shared accident report.`);
      }
    }
  }

  // ---------- Score ----------
  let score = 100;
  for (const c of checks) {
    if (c.status === 'flag') score -= 18;
    else if (c.status === 'info') score -= 5;
    else if (c.status === 'unknown') score -= 3;
  }
  score = Math.max(5, Math.min(100, score));

  const verdict = score >= 85 ? 'fast-track' : score >= 60 ? 'standard' : 'adjuster';
  const verdictLabel =
    verdict === 'fast-track'
      ? 'Story and evidence agree — eligible for fast-track settlement'
      : verdict === 'standard'
        ? 'Minor gaps — standard review'
        : 'Inconsistencies flagged — routed to a human adjuster';

  return { score, verdict, verdictLabel, checks, computedAt: new Date().toISOString() };
}
