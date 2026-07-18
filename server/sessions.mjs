// Shared Accident Session engine.
// One live case, two drivers, everything auto-captured and broadcast in real time.
import { randomUUID } from 'node:crypto';
import { analyzeConsistency } from './consistency.mjs';

// Unambiguous alphabet for session codes (no 0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const sessions = new Map(); // code -> session
const sockets = new Map(); // ws -> { code, pid }

const now = () => new Date().toISOString();

function makeCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (sessions.has(code));
  return code;
}

function addEvent(session, icon, text) {
  session.events.push({ at: now(), icon, text });
  if (session.events.length > 60) session.events.shift();
}

function refreshStatus(session) {
  if (session.participants.length === 2 && session.participants.every((p) => p.confirmed)) {
    if (session.status !== 'locked') {
      session.status = 'locked';
      session.lockedAt = now();
      addEvent(session, '🔒', 'Both drivers confirmed — case locked and sealed');
      scheduleSimulatedEvidence(session);
    }
  } else {
    session.status = session.participants.length >= 2 ? 'active' : 'waiting';
  }
}

// Once the case locks, a simulated driver files her own Phase 4 evidence a few
// seconds later — so a solo demo still gets a full two-sided consistency report.
function scheduleSimulatedEvidence(session) {
  for (const p of session.participants) {
    if (!p.simulated || p.evidence) continue;
    setTimeout(() => {
      if (p.evidence) return;
      p.evidence = {
        photos: [
          {
            id: 'sim-photo-1',
            side: 'front',
            severity: 'moderate',
            damageRatio: 0.071,
            regionCount: 2,
            confidence: 0.84,
            thumb: null,
            placeholder: true,
          },
        ],
        statement: {
          raw: "J'ai freiné mais الطريق كانت مبللة, ma njemtech no9ef w dkhalt fih. C'est ma faute, pas de blessés.",
          summary:
            'The driver was braking; road was wet; struck the other vehicle (own front); accepts fault; no injuries reported.',
          shares: { fr: 42, ar: 18, darija: 32, en: 0, other: 8 },
          codeSwitching: true,
          slots: {
            impactDirection: 'front',
            movement: 'braking',
            faultClaim: 'self',
            injuries: false,
            conditions: ['wet road'],
          },
        },
        updatedAt: now(),
      };
      addEvent(
        session,
        '🧠',
        `${p.name}'s evidence analyzed: 1 photo (max severity moderate) · statement in FR/AR/DARIJA (simulated)`
      );
      recomputeAnalysis(session);
      broadcast(session, null);
    }, 2600);
  }
}

export function createSession(identity) {
  const code = makeCode();
  const pid = randomUUID();
  const session = {
    code,
    caseId: 'CASE-' + code,
    createdAt: now(),
    status: 'waiting',
    lockedAt: null,
    participants: [
      {
        pid,
        role: 'A',
        name: identity.name || 'Driver A',
        verified: !!identity.verified,
        policy: identity.policy || null,
        simulated: false,
        connected: false,
        joinMethod: 'created',
        joinedAt: now(),
        position: null,
        impact: null,
        confirmed: false,
      },
    ],
    events: [],
  };
  addEvent(session, '🆕', `Case opened by ${session.participants[0].name} — date & time captured automatically`);
  sessions.set(code, session);
  return { session, pid };
}

export function joinSession(code, identity, method) {
  const session = sessions.get(normalizeCode(code));
  if (!session) return { error: 'not_found' };
  if (session.status === 'locked') return { error: 'locked' };
  if (session.participants.length >= 2) return { error: 'full' };
  const pid = randomUUID();
  session.participants.push({
    pid,
    role: 'B',
    name: identity.name || 'Driver B',
    verified: !!identity.verified,
    policy: identity.policy || null,
    simulated: false,
    connected: false,
    joinMethod: method === 'qr' ? 'qr' : 'code',
    joinedAt: now(),
    position: null,
    impact: null,
    confirmed: false,
  });
  addEvent(
    session,
    '📱',
    `${identity.name || 'Driver B'} joined via ${method === 'qr' ? 'QR scan' : 'session code'}`
  );
  refreshStatus(session);
  return { session, pid };
}

export function getSession(code) {
  return sessions.get(normalizeCode(code)) || null;
}

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Live socket handling
// ---------------------------------------------------------------------------

function serialize(session) {
  return {
    code: session.code,
    caseId: session.caseId,
    createdAt: session.createdAt,
    status: session.status,
    lockedAt: session.lockedAt,
    participants: session.participants,
    events: session.events,
    analysis: session.analysis || null,
  };
}

function recomputeAnalysis(session) {
  const before = session.analysis;
  session.analysis = analyzeConsistency(session);
  if (
    session.analysis &&
    (!before || before.score !== session.analysis.score)
  ) {
    addEvent(session, '🧠', `Consistency engine: case integrity ${session.analysis.score}/100`);
  }
}

export function broadcast(session, wss) {
  const payload = JSON.stringify({ type: 'state', session: serialize(session) });
  for (const [ws, ref] of sockets) {
    if (ref.code === session.code && ws.readyState === 1) ws.send(payload);
  }
  // wss unused but kept for signature clarity
  void wss;
}

const zoneLabel = (z) => (z || '').replace('-', ' ');

export function handleMessage(ws, msg, wss) {
  const send = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

  if (msg.type === 'attach') {
    const session = getSession(msg.code);
    if (!session) return send({ type: 'error', message: 'Session not found' });
    const p = session.participants.find((x) => x.pid === msg.pid);
    if (!p) return send({ type: 'error', message: 'Unknown participant' });
    sockets.set(ws, { code: session.code, pid: p.pid });
    const wasConnected = p.connected;
    p.connected = true;
    if (wasConnected === false && p.everConnected) {
      addEvent(session, '🔌', `${p.name} reconnected`);
    }
    p.everConnected = true;
    broadcast(session, wss);
    return;
  }

  const ref = sockets.get(ws);
  if (!ref) return send({ type: 'error', message: 'Not attached to a session' });
  const session = sessions.get(ref.code);
  if (!session) return send({ type: 'error', message: 'Session expired' });
  const p = session.participants.find((x) => x.pid === ref.pid);
  if (!p) return;

  // Evidence (Phase 4) is submitted *after* the constat locks; everything else
  // is frozen once both drivers have confirmed.
  if (msg.type === 'evidence') {
    p.evidence = sanitizeEvidence(msg.evidence);
    if (p.evidence) {
      const nPhotos = p.evidence.photos.length;
      const maxSev = p.evidence.photos.reduce(
        (m, ph) => (['minor', 'moderate', 'severe'].indexOf(ph.severity) > ['minor', 'moderate', 'severe'].indexOf(m) ? ph.severity : m),
        'minor'
      );
      const langs = p.evidence.statement
        ? Object.entries(p.evidence.statement.shares || {})
            .filter(([, v]) => v >= 15)
            .map(([k]) => k.toUpperCase())
            .join('/')
        : null;
      addEvent(
        session,
        '🧠',
        `${p.name}'s evidence analyzed: ${nPhotos} photo${nPhotos === 1 ? '' : 's'}${nPhotos ? ` (max severity ${maxSev})` : ''}${langs ? ` · statement in ${langs}` : ''}`
      );
    }
    recomputeAnalysis(session);
    broadcast(session, wss);
    return;
  }

  if (session.status === 'locked') {
    return send({ type: 'error', message: 'Case is locked — no further edits' });
  }

  switch (msg.type) {
    case 'position': {
      const { lat, lng, accuracy, simulated } = msg.position || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      p.position = { lat, lng, accuracy: Math.round(accuracy || 0), capturedAt: now(), simulated: !!simulated };
      addEvent(
        session,
        '📍',
        `${p.name}'s location locked automatically (±${p.position.accuracy} m${simulated ? ', simulated' : ''})`
      );
      break;
    }
    case 'impact': {
      p.impact = msg.zone || null;
      if (p.impact) addEvent(session, '💥', `${p.name} marked impact: ${zoneLabel(p.impact)}`);
      break;
    }
    case 'confirm': {
      if (!p.confirmed) {
        p.confirmed = true;
        addEvent(session, '✅', `${p.name} confirmed their side of the case`);
      }
      break;
    }
    default:
      return;
  }
  refreshStatus(session);
  broadcast(session, wss);
}

/** Shallow validation + size caps so a client can't bloat the session. */
function sanitizeEvidence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const photos = Array.isArray(raw.photos)
    ? raw.photos.slice(0, 4).map((ph) => ({
        id: String(ph.id || '').slice(0, 40),
        side: ['front', 'rear', 'left', 'right'].includes(ph.side) ? ph.side : 'front',
        severity: ['minor', 'moderate', 'severe'].includes(ph.severity) ? ph.severity : 'minor',
        damageRatio: Math.max(0, Math.min(1, Number(ph.damageRatio) || 0)),
        regionCount: Math.max(0, Math.min(50, Number(ph.regionCount) || 0)),
        confidence: Math.max(0, Math.min(1, Number(ph.confidence) || 0)),
        thumb: typeof ph.thumb === 'string' && ph.thumb.length < 60000 ? ph.thumb : null,
        placeholder: !!ph.placeholder,
      }))
    : [];
  let statement = null;
  if (raw.statement && typeof raw.statement === 'object') {
    const s = raw.statement;
    statement = {
      raw: String(s.raw || '').slice(0, 2000),
      summary: String(s.summary || '').slice(0, 500),
      shares: s.shares && typeof s.shares === 'object' ? s.shares : {},
      codeSwitching: !!s.codeSwitching,
      slots: s.slots && typeof s.slots === 'object'
        ? {
            impactDirection: ['front', 'rear', 'left', 'right'].includes(s.slots.impactDirection) ? s.slots.impactDirection : null,
            movement: typeof s.slots.movement === 'string' ? s.slots.movement.slice(0, 20) : null,
            faultClaim: ['other', 'self'].includes(s.slots.faultClaim) ? s.slots.faultClaim : null,
            injuries: typeof s.slots.injuries === 'boolean' ? s.slots.injuries : null,
            conditions: Array.isArray(s.slots.conditions) ? s.slots.conditions.slice(0, 5).map(String) : [],
          }
        : null,
    };
  }
  if (photos.length === 0 && !statement) return null;
  return { photos, statement, updatedAt: now() };
}

export function handleClose(ws, wss) {
  const ref = sockets.get(ws);
  sockets.delete(ws);
  if (!ref) return;
  const session = sessions.get(ref.code);
  if (!session) return;
  const p = session.participants.find((x) => x.pid === ref.pid);
  if (p && !p.simulated) {
    p.connected = false;
    broadcast(session, wss);
  }
}

// ---------------------------------------------------------------------------
// Simulated second driver — the on-stage fallback when there's only one phone.
// Clearly labeled as simulated everywhere it appears.
// ---------------------------------------------------------------------------
export function simulateSecondDriver(code, wss) {
  const session = getSession(code);
  if (!session) return { error: 'not_found' };
  if (session.participants.length >= 2) return { error: 'full' };

  const pid = randomUUID();
  const bot = {
    pid,
    role: 'B',
    name: 'Sara Miladi',
    verified: true,
    policy: 'Tiers Confort',
    simulated: true,
    connected: true,
    everConnected: true,
    joinMethod: 'simulated',
    joinedAt: now(),
    position: null,
    impact: null,
    confirmed: false,
  };
  session.participants.push(bot);
  addEvent(session, '📱', 'Sara Miladi (simulated driver) joined via QR scan');
  refreshStatus(session);
  broadcast(session, wss);

  const other = session.participants.find((x) => x.pid !== pid);

  setTimeout(() => {
    if (session.status === 'locked') return;
    // Position: a few metres from driver A if known, else central Tunis
    const base = other?.position || { lat: 36.8065, lng: 10.1815 };
    bot.position = {
      lat: base.lat + (Math.random() - 0.5) * 0.0002,
      lng: base.lng + (Math.random() - 0.5) * 0.0002,
      accuracy: 8 + Math.round(Math.random() * 10),
      capturedAt: now(),
      simulated: true,
    };
    addEvent(session, '📍', `Sara's location locked automatically (±${bot.position.accuracy} m, simulated)`);
    broadcast(session, wss);
  }, 1600);

  setTimeout(() => {
    if (session.status === 'locked') return;
    bot.impact = 'front-left';
    addEvent(session, '💥', 'Sara marked impact: front left');
    broadcast(session, wss);
  }, 3400);

  setTimeout(() => {
    if (session.status === 'locked') return;
    bot.confirmed = true;
    addEvent(session, '✅', 'Sara confirmed her side of the case');
    refreshStatus(session);
    broadcast(session, wss);
  }, 5200);

  return { ok: true };
}
