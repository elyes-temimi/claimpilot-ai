// ClaimPilot AI — mocked trust services backend.
// Provides: AML/PEP screening, ECDSA profile signing + verification,
// and the adaptive policy recommendation engine.
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createHash, createSign, createVerify, generateKeyPairSync, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { screenName } from './amlData.mjs';
import { nextStep, policyOptions } from './policyEngine.mjs';
import { dbStatus, getCase, getEkycProfile, initDb, listFlaggedCases, saveEkycProfile } from './db.mjs';
import { llmStatus } from './llm.mjs';
import { transcribeCin, visionStatus } from './visionCin.mjs';
import { enrichEstimate, estimateRepair } from './repairEstimate.mjs';
import {
  createSession,
  getSession,
  handleClose,
  handleMessage,
  joinSession,
  normalizeCode,
  simulateSecondDriver,
} from './sessions.mjs';

const app = express();
app.use(cors());
// Base64 CIN photos and damage images run well past the old 2mb cap; a
// request that exceeds it fails as a bare 413 with no useful message.
app.use(express.json({ limit: '25mb' }));

// Ephemeral signing identity for the "ClaimPilot Trust Service".
// In production this would live in an HSM; for the hackathon it is
// generated fresh at boot, which is enough to demo real signatures.
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

// In-memory registry of signed profiles for the /verify endpoint.
const registry = new Map();

const canonical = (obj) => JSON.stringify(obj, Object.keys(obj).sort());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'claimpilot-trust', time: new Date().toISOString() });
});

// --- AML / PEP screening -------------------------------------------------
app.post('/api/aml/screen', (req, res) => {
  const { fullName, dob } = req.body || {};
  if (!fullName) return res.status(400).json({ error: 'fullName required' });
  const result = screenName(fullName);
  res.json({
    screeningId: 'SCR-' + randomUUID().slice(0, 8).toUpperCase(),
    query: { fullName, dob: dob || null },
    listsChecked: ['UN Consolidated (mock)', 'OFAC SDN (mock)', 'EU Financial Sanctions (mock)', 'PEP registry (mock)'],
    screenedAt: new Date().toISOString(),
    ...result,
  });
});

// --- Profile signing -----------------------------------------------------
app.post('/api/profile/sign', (req, res) => {
  const { profile } = req.body || {};
  if (!profile || !profile.fullName) return res.status(400).json({ error: 'profile required' });

  const profileId = 'CP-' + randomUUID().slice(0, 12).toUpperCase();
  const payload = canonical({ ...profile, profileId });
  const hash = createHash('sha256').update(payload).digest('hex');

  const signer = createSign('SHA256');
  signer.update(payload);
  const signature = signer.sign(privateKey, 'base64');

  const record = {
    profileId,
    hash,
    signature,
    signedAt: new Date().toISOString(),
    algorithm: 'ECDSA P-256 / SHA-256',
  };
  registry.set(profileId, { payload, ...record });

  res.json({ ...record, publicKeyPem, verifyHint: `POST /api/profile/verify { profileId }` });
});

app.post('/api/profile/verify', (req, res) => {
  const { profileId } = req.body || {};
  const rec = registry.get(profileId);
  if (!rec) return res.json({ valid: false, reason: 'unknown profileId' });
  const verifier = createVerify('SHA256');
  verifier.update(rec.payload);
  const valid = verifier.verify(publicKeyPem, rec.signature, 'base64');
  res.json({ valid, profileId, hash: rec.hash, signedAt: rec.signedAt });
});

// --- Smart Policy Selection ----------------------------------------------
app.post('/api/policy/step', (req, res) => {
  const { answers, profile } = req.body || {};
  res.json(nextStep(answers || {}, profile || {}));
});

// Every policy, scored and priced for these answers, best first.
// The client shows the whole shelf so the customer can pick a different tier
// or decline entirely — subscribing is never required to finish eKYC.
app.post('/api/policy/options', (req, res) => {
  const { answers, profile } = req.body || {};
  res.json(policyOptions(answers || {}, profile || {}));
});

// --- Shared Accident Session ----------------------------------------------
app.post('/api/session/create', (req, res) => {
  const { identity } = req.body || {};
  const { session, pid } = createSession(identity || {});
  res.json({ code: session.code, caseId: session.caseId, pid });
});

app.get('/api/session/:code', (req, res) => {
  const session = getSession(req.params.code);
  if (!session) return res.status(404).json({ error: 'not_found' });
  res.json({
    code: session.code,
    caseId: session.caseId,
    createdAt: session.createdAt,
    status: session.status,
    createdBy: session.participants[0]?.name || 'Unknown',
    participantCount: session.participants.length,
  });
});

app.post('/api/session/join', (req, res) => {
  const { code, identity, method } = req.body || {};
  const result = joinSession(normalizeCode(code), identity || {}, method);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Session not found — check the code' });
  if (result.error === 'full') return res.status(409).json({ error: 'This case already has two drivers' });
  if (result.error === 'locked') return res.status(409).json({ error: 'This case is already locked' });
  res.json({ code: result.session.code, caseId: result.session.caseId, pid: result.pid });
});

app.post('/api/session/:code/simulate', (req, res) => {
  const result = simulateSecondDriver(req.params.code, wss);
  if (result.error) return res.status(409).json({ error: result.error });
  res.json({ ok: true });
});

// --- AI + data services status -------------------------------------------
// The UI shows an honest badge per dependency rather than implying everything
// is fine when Ollama or MySQL is down.
app.get('/api/system/status', async (_req, res) => {
  res.json({ llm: await llmStatus(), vision: await visionStatus(), db: dbStatus() });
});

// --- Repair estimation ----------------------------------------------------
app.post('/api/estimate', async (req, res) => {
  const { photos, impact, tier, position, vehicleMake, withLlm } = req.body || {};
  if (!Array.isArray(photos)) return res.status(400).json({ error: 'photos[] required' });
  let estimate = estimateRepair({ photos, impact, tier, position });
  if (withLlm !== false) estimate = await enrichEstimate(estimate, { vehicleMake, impact });
  res.json(estimate);
});

// --- CIN transcription by the local vision model --------------------------
// Returns raw lines, not fields: the model reads glyphs well but assigns
// labels badly, so the deterministic parser on the client does that half.
app.post('/api/cin/read', async (req, res) => {
  const { image } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image required' });
  try {
    res.json({ ok: true, ...(await transcribeCin(image)) });
  } catch (err) {
    // Never fatal — the client still has Tesseract.
    res.json({ ok: false, error: err.message, lines: [], text: '' });
  }
});

// --- eKYC reuse -----------------------------------------------------------
// Verifying an identity is expensive and annoying; doing it twice for the same
// person is pure friction. Once an account has a completed eKYC on file, the
// app reads it back and skips straight to the claim.
app.post('/api/ekyc/profile', async (req, res) => {
  const p = req.body || {};
  if (!p.accountKey) return res.status(400).json({ error: 'accountKey required' });
  try {
    res.json(await saveEkycProfile(p));
  } catch (err) {
    res.status(503).json({ persisted: false, error: err.message });
  }
});

app.get('/api/ekyc/profile', async (req, res) => {
  const key = String(req.query.accountKey || '');
  if (!key) return res.status(400).json({ error: 'accountKey required' });
  try {
    const row = await getEkycProfile(key);
    if (!row) return res.json({ found: false });
    res.json({
      found: true,
      profile: {
        fullName: row.full_name,
        cin: row.cin,
        dob: row.dob,
        address: row.address,
        phone: row.phone,
        verified: !!row.identity_verified,
        livenessPassed: !!row.liveness_passed,
        screeningStatus: row.screening_status,
        policyId: row.policy_id,
        policyName: row.policy_name,
        premiumTND: row.premium_tnd == null ? null : Number(row.premium_tnd),
        profileId: row.profile_id,
        completedAt: row.completed_at,
      },
    });
  } catch (err) {
    // A dead database must not block someone from filing a claim — they just
    // get asked to verify again.
    res.json({ found: false, degraded: true, error: err.message });
  }
});

// --- Fraud queue ----------------------------------------------------------
app.get('/api/cases/flagged', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    res.json({ cases: await listFlaggedCases(limit), db: dbStatus() });
  } catch (err) {
    res.status(503).json({ error: err.message, db: dbStatus() });
  }
});

app.get('/api/cases/:caseId', async (req, res) => {
  try {
    const found = await getCase(req.params.caseId);
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json(found);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// Virtual adapters a phone on the WiFi can never reach. A dev box typically
// has several, and they enumerate *before* the real NIC — so naively taking
// the first non-internal IPv4 hands out something like 192.168.56.1
// (VirtualBox) and the session QR silently points nowhere.
const VIRTUAL_ADAPTER =
  /virtualbox|vmware|vmnet|hyper-v|vethernet|wsl|docker|tap-windows|loopback|bluetooth|tailscale|zerotier|npcap/i;

/** Rank a candidate address: higher = more likely reachable from a phone. */
function scoreAddress(name, address) {
  if (VIRTUAL_ADAPTER.test(name)) return -1;
  // 169.254.x means DHCP failed on that adapter — never routable.
  if (address.startsWith('169.254.')) return -1;

  let score = 0;
  if (/wi-?fi|wireless|wlan/i.test(name)) score += 40;
  else if (/ethernet|eth\d|en\d/i.test(name)) score += 30;

  if (/^192\.168\./.test(address)) score += 20;
  else if (/^10\./.test(address)) score += 18;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 8; // often Docker/WSL

  return score;
}

function pickLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      candidates.push({ name, address: a.address, score: scoreAddress(name, a.address) });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return { best: candidates.find((c) => c.score >= 0)?.address || null, candidates };
}

// LAN address so a phone can scan the QR and reach the dev server.
// Set LAN_IP=x.x.x.x to override when the auto-pick guesses wrong.
app.get('/api/netinfo', (_req, res) => {
  const { best, candidates } = pickLanIp();
  const forced = process.env.LAN_IP || null;
  res.json({
    lanIp: forced || best,
    forced: !!forced,
    clientPort: Number(process.env.CLIENT_PORT || 5173),
    // Everything considered, so the QR card can offer a manual pick.
    candidates: candidates.map(({ name, address, score }) => ({ name, address, usable: score >= 0 })),
  });
});

const PORT = 8787;
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleMessage(ws, msg, wss);
  });
  ws.on('close', () => handleClose(ws, wss));
});

server.listen(PORT, async () => {
  console.log(`[claimpilot-trust] listening on http://localhost:${PORT} (ws: /ws)`);
  // Both are non-fatal: a missing database degrades to disk spooling, a missing
  // Ollama degrades to the deterministic rules engine.
  await initDb();
  const llm = await llmStatus();
  console.log(
    llm.available
      ? `[llm] Ollama ready — model ${llm.model}`
      : `[llm] Ollama unavailable (${llm.error}) — fraud analysis falls back to rules only`
  );
});
