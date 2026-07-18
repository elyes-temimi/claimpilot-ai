// MySQL persistence — the sealed case, its evidence, the fraud verdict and the
// repair estimate all land here when a constat locks.
//
// Two design points worth knowing:
//  1. Schema is created on boot (CREATE DATABASE / TABLE IF NOT EXISTS), so a
//     fresh MySQL needs no manual setup — point it at a server and it works.
//  2. If MySQL is unreachable the writes are appended to a local spool file and
//     replayed automatically once it comes back. A stopped database degrades
//     the demo to "not yet synced", never to a crash.
//
// Everything is utf8mb4: statements arrive in Arabic script and Darija.

import mysql from 'mysql2/promise';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPOOL_PATH = join(__dirname, '..', '.data', 'pending-writes.json');

const CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'claimpilot',
};

let pool = null;
let ready = false;
let lastError = null;
let spool = [];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cases (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL UNIQUE,
    session_code   VARCHAR(12) NOT NULL,
    status         VARCHAR(16) NOT NULL,
    created_at     DATETIME NOT NULL,
    locked_at      DATETIME NULL,
    accident_at    DATETIME NULL,
    place_label    VARCHAR(255) NULL,
    lat            DECIMAL(10,7) NULL,
    lng            DECIMAL(10,7) NULL,
    injuries       TINYINT(1) NULL,
    integrity_score SMALLINT NULL,
    verdict        VARCHAR(24) NULL,
    -- Fraud triage. fraud_risk is the flag column the business asked for:
    -- 'low' | 'medium' | 'high'. fraud_flagged is the fast index for
    -- "show me everything that needs a human".
    fraud_score    SMALLINT NULL,
    fraud_risk     VARCHAR(8) NOT NULL DEFAULT 'low',
    fraud_flagged  TINYINT(1) NOT NULL DEFAULT 0,
    fraud_summary  TEXT NULL,
    analysed_by    VARCHAR(48) NULL,
    estimate_total DECIMAL(10,2) NULL,
    currency       VARCHAR(8) NOT NULL DEFAULT 'TND',
    synced_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fraud_risk (fraud_risk),
    INDEX idx_fraud_flagged (fraud_flagged),
    INDEX idx_locked_at (locked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS participants (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL,
    role           CHAR(1) NOT NULL,
    full_name      VARCHAR(160) NOT NULL,
    cin            VARCHAR(16) NULL,
    licence_no     VARCHAR(32) NULL,
    policy         VARCHAR(80) NULL,
    insurer        VARCHAR(80) NULL,
    plate          VARCHAR(32) NULL,
    vehicle_make   VARCHAR(80) NULL,
    identity_verified TINYINT(1) NOT NULL DEFAULT 0,
    simulated      TINYINT(1) NOT NULL DEFAULT 0,
    impact_zone    VARCHAR(16) NULL,
    lat            DECIMAL(10,7) NULL,
    lng            DECIMAL(10,7) NULL,
    statement_raw  TEXT NULL,
    statement_summary TEXT NULL,
    statement_langs VARCHAR(64) NULL,
    claimed_direction VARCHAR(8) NULL,
    movement       VARCHAR(20) NULL,
    fault_claim    VARCHAR(8) NULL,
    confirmed      TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_case_role (case_id, role),
    CONSTRAINT fk_part_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS damage_photos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL,
    role           CHAR(1) NOT NULL,
    side           VARCHAR(8) NOT NULL,
    severity       VARCHAR(10) NOT NULL,
    damage_ratio   DECIMAL(6,4) NOT NULL DEFAULT 0,
    region_count   SMALLINT NOT NULL DEFAULT 0,
    confidence     DECIMAL(4,3) NOT NULL DEFAULT 0,
    CONSTRAINT fk_photo_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS repair_estimates (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL,
    role           CHAR(1) NOT NULL,
    part_key       VARCHAR(40) NOT NULL,
    part_label     VARCHAR(120) NOT NULL,
    action         VARCHAR(16) NOT NULL,
    parts_cost     DECIMAL(10,2) NOT NULL DEFAULT 0,
    labour_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
    line_total     DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency       VARCHAR(8) NOT NULL DEFAULT 'TND',
    source         VARCHAR(160) NULL,
    CONSTRAINT fk_est_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS fraud_findings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL,
    role           CHAR(1) NULL,
    code           VARCHAR(48) NOT NULL,
    severity       VARCHAR(10) NOT NULL,
    title          VARCHAR(200) NOT NULL,
    detail         TEXT NULL,
    origin         VARCHAR(16) NOT NULL DEFAULT 'rules',
    CONSTRAINT fk_fraud_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS constats (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    case_id        VARCHAR(32) NOT NULL,
    role           CHAR(1) NOT NULL,
    language       VARCHAR(8) NOT NULL DEFAULT 'fr',
    circumstances  JSON NULL,
    croquis        JSON NULL,
    observations   TEXT NULL,
    signed_at      DATETIME NULL,
    generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_constat_role (case_id, role),
    CONSTRAINT fk_constat_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

/**
 * Connect and create the schema. Safe to call repeatedly — used both at boot
 * and as the reconnect path when a write finds the pool dead.
 */
export async function initDb({ quiet = false } = {}) {
  try {
    // Connect without a database first so we can create it if missing.
    const bootstrap = await mysql.createConnection({
      host: CONFIG.host,
      port: CONFIG.port,
      user: CONFIG.user,
      password: CONFIG.password,
      connectTimeout: 5000,
    });
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrap.end();

    pool = mysql.createPool({
      ...CONFIG,
      waitForConnections: true,
      connectionLimit: 6,
      charset: 'utf8mb4',
      connectTimeout: 5000,
    });

    for (const ddl of SCHEMA) await pool.query(ddl);

    ready = true;
    lastError = null;
    if (!quiet) {
      console.log(`[db] MySQL ready — ${CONFIG.user}@${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`);
    }
    await flushSpool();
    return true;
  } catch (err) {
    ready = false;
    lastError = err.message;
    pool = null;
    if (!quiet) {
      console.warn(`[db] MySQL unavailable (${err.code || err.message}) — cases will spool to disk and sync later`);
    }
    return false;
  }
}

export function dbStatus() {
  return {
    ready,
    host: CONFIG.host,
    port: CONFIG.port,
    database: CONFIG.database,
    pendingWrites: spool.length,
    error: ready ? null : lastError,
  };
}

// ---------------------------------------------------------------------------
// Spool — survives a dead database without losing a sealed case
// ---------------------------------------------------------------------------

async function loadSpool() {
  try {
    spool = JSON.parse(await readFile(SPOOL_PATH, 'utf8'));
    if (!Array.isArray(spool)) spool = [];
  } catch {
    spool = [];
  }
}

async function persistSpool() {
  try {
    await mkdir(dirname(SPOOL_PATH), { recursive: true });
    await writeFile(SPOOL_PATH, JSON.stringify(spool, null, 2), 'utf8');
  } catch (err) {
    console.warn('[db] could not persist spool:', err.message);
  }
}

async function flushSpool() {
  if (!ready || spool.length === 0) return;
  const queued = [...spool];
  spool = [];
  let flushed = 0;
  for (const snapshot of queued) {
    try {
      await writeCaseNow(snapshot);
      flushed++;
    } catch (err) {
      spool.push(snapshot); // put it back, try again next time
      console.warn('[db] spool replay failed:', err.message);
    }
  }
  await persistSpool();
  if (flushed) console.log(`[db] replayed ${flushed} spooled case(s) into MySQL`);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const asDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 19).replace('T', ' ') : null);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Persist a full sealed case: the case row, both drivers, their damage photos,
 * repair estimate lines, fraud findings and per-driver constats.
 * Idempotent — re-saving the same case_id replaces its child rows.
 */
export async function saveCase(snapshot) {
  if (!ready) {
    // Try one reconnect before giving up — WAMP may have been started late.
    await initDb({ quiet: true });
  }
  if (!ready) {
    spool.push(snapshot);
    await persistSpool();
    return { persisted: false, spooled: true, reason: lastError };
  }
  try {
    await writeCaseNow(snapshot);
    return { persisted: true, spooled: false };
  } catch (err) {
    ready = false;
    lastError = err.message;
    spool.push(snapshot);
    await persistSpool();
    return { persisted: false, spooled: true, reason: err.message };
  }
}

async function writeCaseNow(s) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO cases
         (case_id, session_code, status, created_at, locked_at, accident_at, place_label,
          lat, lng, injuries, integrity_score, verdict,
          fraud_score, fraud_risk, fraud_flagged, fraud_summary, analysed_by,
          estimate_total, currency)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         status=VALUES(status), locked_at=VALUES(locked_at), accident_at=VALUES(accident_at),
         place_label=VALUES(place_label), lat=VALUES(lat), lng=VALUES(lng),
         injuries=VALUES(injuries), integrity_score=VALUES(integrity_score),
         verdict=VALUES(verdict), fraud_score=VALUES(fraud_score),
         fraud_risk=VALUES(fraud_risk), fraud_flagged=VALUES(fraud_flagged),
         fraud_summary=VALUES(fraud_summary), analysed_by=VALUES(analysed_by),
         estimate_total=VALUES(estimate_total), synced_at=CURRENT_TIMESTAMP`,
      [
        s.caseId,
        s.sessionCode,
        s.status || 'locked',
        asDate(s.createdAt),
        asDate(s.lockedAt),
        asDate(s.accidentAt || s.lockedAt),
        s.placeLabel || null,
        num(s.lat),
        num(s.lng),
        s.injuries === null || s.injuries === undefined ? null : s.injuries ? 1 : 0,
        num(s.integrityScore),
        s.verdict || null,
        num(s.fraudScore),
        s.fraudRisk || 'low',
        s.fraudFlagged ? 1 : 0,
        s.fraudSummary || null,
        s.analysedBy || null,
        num(s.estimateTotal),
        s.currency || 'TND',
      ]
    );

    // Child rows are rewritten wholesale — simplest correct thing for a case
    // that can be re-analysed after more evidence arrives.
    for (const table of ['damage_photos', 'repair_estimates', 'fraud_findings']) {
      await conn.query(`DELETE FROM ${table} WHERE case_id = ?`, [s.caseId]);
    }

    for (const p of s.participants || []) {
      await conn.query(
        `INSERT INTO participants
           (case_id, role, full_name, cin, licence_no, policy, insurer, plate, vehicle_make,
            identity_verified, simulated, impact_zone, lat, lng,
            statement_raw, statement_summary, statement_langs,
            claimed_direction, movement, fault_claim, confirmed)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           full_name=VALUES(full_name), cin=VALUES(cin), licence_no=VALUES(licence_no),
           policy=VALUES(policy), insurer=VALUES(insurer), plate=VALUES(plate),
           vehicle_make=VALUES(vehicle_make), identity_verified=VALUES(identity_verified),
           simulated=VALUES(simulated), impact_zone=VALUES(impact_zone),
           lat=VALUES(lat), lng=VALUES(lng), statement_raw=VALUES(statement_raw),
           statement_summary=VALUES(statement_summary), statement_langs=VALUES(statement_langs),
           claimed_direction=VALUES(claimed_direction), movement=VALUES(movement),
           fault_claim=VALUES(fault_claim), confirmed=VALUES(confirmed)`,
        [
          s.caseId, p.role, p.name, p.cin || null, p.licenceNo || null, p.policy || null,
          p.insurer || null, p.plate || null, p.vehicleMake || null,
          p.verified ? 1 : 0, p.simulated ? 1 : 0, p.impact || null,
          num(p.lat), num(p.lng),
          p.statementRaw || null, p.statementSummary || null, p.statementLangs || null,
          p.claimedDirection || null, p.movement || null, p.faultClaim || null,
          p.confirmed ? 1 : 0,
        ]
      );

      for (const ph of p.photos || []) {
        await conn.query(
          `INSERT INTO damage_photos (case_id, role, side, severity, damage_ratio, region_count, confidence)
           VALUES (?,?,?,?,?,?,?)`,
          [s.caseId, p.role, ph.side, ph.severity, ph.damageRatio || 0, ph.regionCount || 0, ph.confidence || 0]
        );
      }

      for (const line of p.estimateLines || []) {
        await conn.query(
          `INSERT INTO repair_estimates
             (case_id, role, part_key, part_label, action, parts_cost, labour_cost, line_total, currency, source)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            s.caseId, p.role, line.partKey, line.partLabel, line.action,
            line.partsCost || 0, line.labourCost || 0, line.total || 0,
            line.currency || 'TND', line.source || null,
          ]
        );
      }

      if (p.constat) {
        await conn.query(
          `INSERT INTO constats (case_id, role, language, circumstances, croquis, observations, signed_at)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             language=VALUES(language), circumstances=VALUES(circumstances),
             croquis=VALUES(croquis), observations=VALUES(observations),
             signed_at=VALUES(signed_at), generated_at=CURRENT_TIMESTAMP`,
          [
            s.caseId, p.role, p.constat.language || 'fr',
            JSON.stringify(p.constat.circumstances || []),
            JSON.stringify(p.constat.croquis || null),
            p.constat.observations || null,
            asDate(p.constat.signedAt),
          ]
        );
      }
    }

    for (const f of s.findings || []) {
      await conn.query(
        `INSERT INTO fraud_findings (case_id, role, code, severity, title, detail, origin)
         VALUES (?,?,?,?,?,?,?)`,
        [s.caseId, f.role || null, f.code, f.severity, f.title, f.detail || null, f.origin || 'rules']
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Reads — the fraud queue an adjuster would actually open
// ---------------------------------------------------------------------------

export async function listFlaggedCases(limit = 50) {
  if (!ready) return [];
  const [rows] = await pool.query(
    `SELECT case_id, session_code, locked_at, integrity_score, verdict,
            fraud_score, fraud_risk, fraud_flagged, fraud_summary, estimate_total, currency
       FROM cases
      ORDER BY fraud_flagged DESC, fraud_score DESC, locked_at DESC
      LIMIT ?`,
    [limit]
  );
  return rows;
}

export async function getCase(caseId) {
  if (!ready) return null;
  const [[row]] = await pool.query('SELECT * FROM cases WHERE case_id = ?', [caseId]);
  if (!row) return null;
  const [participants] = await pool.query('SELECT * FROM participants WHERE case_id = ? ORDER BY role', [caseId]);
  const [photos] = await pool.query('SELECT * FROM damage_photos WHERE case_id = ?', [caseId]);
  const [estimates] = await pool.query('SELECT * FROM repair_estimates WHERE case_id = ?', [caseId]);
  const [findings] = await pool.query('SELECT * FROM fraud_findings WHERE case_id = ?', [caseId]);
  const [constats] = await pool.query('SELECT * FROM constats WHERE case_id = ?', [caseId]);
  return { ...row, participants, photos, estimates, findings, constats };
}

await loadSpool();
