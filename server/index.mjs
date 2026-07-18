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
import { nextStep } from './policyEngine.mjs';
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
app.use(express.json({ limit: '2mb' }));

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

// LAN address so a phone can scan the QR and reach the dev server
app.get('/api/netinfo', (_req, res) => {
  let lanIp = null;
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        lanIp = a.address;
        break;
      }
    }
    if (lanIp) break;
  }
  res.json({ lanIp, clientPort: 5173 });
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

server.listen(PORT, () => {
  console.log(`[claimpilot-trust] listening on http://localhost:${PORT} (ws: /ws)`);
});
