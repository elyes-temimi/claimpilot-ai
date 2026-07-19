// Fill the official two-page FTUSA constat amiable PDF.
//
// The previous generateConstatPDF() built a plain-text string and downloaded it
// as .txt — it never produced a PDF at all, despite the name. An agency needs
// the genuine form, so this overlays the claim data onto the real template and
// keeps BOTH pages (recto = constat, verso = déclaration).
//
// Two properties of that template shape everything here:
//
//  * It has NO text layer — every label is vector paths, so pypdf extracts zero
//    characters and coordinates cannot be looked up from the file. The four
//    section underlines (y = 643.9 / 547.6 / 446.9 / 362.9) anchor the row grid
//    below; the rest was calibrated against rendered pages.
//  * pdf-lib does no Arabic shaping or bidi, so Arabic drawn with drawText comes
//    out as disconnected letters in reverse order. Arabic values are therefore
//    rendered through a canvas (browsers shape correctly) and embedded as PNGs.
//
// Coordinates are PDF user space: origin bottom-left, points, A4 595 x 842.

import { PDFDocument, StandardFonts, rgb, type PDFDocument as Doc, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Participant, SessionState } from './types';

const TEMPLATE_URL = '/templates/constat-ftusa.pdf';
const INK = rgb(0.05, 0.09, 0.42);
const MARK = rgb(0.75, 0.06, 0.06);

/** Row baselines for the driver/vehicle blocks, shared by columns A and B. */
const ROW = {
  insurer: 634,
  policy: 617.5,
  agency: 601,
  attest: 567, // "du … au"
  drvLast: 537,
  drvFirst: 520.5,
  drvAddr: 504,
  licence: 487.5,
  licenceDate: 471,
  insLast: 437,
  insFirst: 420,
  insAddr: 403,
  insTel: 381,
  make: 353,
  plate: 336,
  from: 296, // "Venant de"
  to: 277, // "Allant à"
} as const;

/** Value x per column, plus the two date sub-columns of "du … au". */
const COL_A = { x: 125, dateFrom: 145, dateTo: 215, circX: 222, dmgX: 40 };
const COL_B = { x: 476, dateFrom: 496, dateTo: 566, circX: 377, dmgX: 392 };

/** The 17 circumstance checkboxes run down the coloured strips. */
const CIRC_Y_TOP = 622;
const CIRC_PITCH = 20.3;

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

// ---------------------------------------------------------------------------
// Arabic rendering
// ---------------------------------------------------------------------------

/**
 * Render text to a transparent PNG via canvas.
 * The browser shapes Arabic and applies bidi correctly; pdf-lib does neither,
 * so an Arabic name drawn directly would be unreadable on a legal document.
 */
function textToPng(text: string, fontSize: number): { data: Uint8Array; w: number; h: number } | null {
  const scale = 3; // oversample so it stays crisp after scaling down
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  const font = `${fontSize * scale}px "Segoe UI", Arial, sans-serif`;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 6;
  const h = Math.ceil(fontSize * scale * 1.6);
  if (w <= 6) return null;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#0d1770';
  ctx.fillText(text, w - 3, fontSize * scale * 1.15);

  const bin = atob(c.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { data: bytes, w: w / scale, h: h / scale };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

interface Ctx {
  page: PDFPage;
  doc: Doc;
  font: PDFFont;
}

async function put(ctx: Ctx, x: number, y: number, value: unknown, size = 8, maxWidth = 150) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return;

  if (ARABIC.test(text)) {
    const png = textToPng(text, size + 2);
    if (!png) return;
    const img = await ctx.doc.embedPng(png.data);
    const s = Math.min(1, maxWidth / png.w);
    // y is a text baseline; the rendered image sits slightly below it.
    ctx.page.drawImage(img, { x, y: y - png.h * s * 0.28, width: png.w * s, height: png.h * s });
    return;
  }

  // Shrink Latin text that would overrun its rule rather than let it collide.
  let s = size;
  while (s > 5 && ctx.font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  ctx.page.drawText(text, { x, y, size: s, font: ctx.font, color: INK });
}

const mark = (ctx: Ctx, x: number, y: number, size = 9) =>
  ctx.page.drawText('X', { x, y, size, font: ctx.font, color: MARK });

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

interface DriverView {
  /** Printed under "Véhicule assuré par" — the plan, per the business spec. */
  plan?: string;
  policy?: string;
  /** Printed under "Agence" — the insurance company. */
  agency?: string;
  validFrom?: string; validTo?: string;
  lastName?: string; firstName?: string; address?: string;
  licence?: string; licenceDate?: string; phone?: string;
  make?: string; plate?: string; from?: string; to?: string;
  circumstances: number[];
  damage?: string; observations?: string;
}

/**
 * Read a participant's own constat into the shape the printed form expects.
 *
 * `identity` is the verified eKYC profile, used wherever the constat form was
 * left blank: a driver who already proved who they are should not retype their
 * name, address or licence at the roadside.
 */
function toView(p: Participant, identity?: ConstatIdentity): DriverView {
  const c = (p as unknown as { constat?: Record<string, any> }).constat || {};
  const v = c.vehicle || {};
  const source = String(c.fullName || identity?.fullName || p.name || '').trim();
  const parts = source.split(/\s+/);
  return {
    // "Véhicule assuré par" carries the plan name; the company goes in
    // "Agence". Note this inverts the usual reading of the FTUSA form, where
    // "assuré par" is the insurer — it follows the spec given for this app.
    plan: c.planName || p.policy || v.planName,
    policy: v.policyNumber,
    agency: v.insuranceCompany || v.agency,
    validFrom: v.validFrom,
    validTo: v.validTo,
    lastName: c.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]),
    firstName: c.firstName || (parts.length > 1 ? parts[0] : ''),
    address: c.address || v.insuredAddress || identity?.address,
    licence: c.licenceNumber || identity?.licenceNumber,
    licenceDate: c.licenceDate || identity?.licenceDate,
    phone: c.phone || identity?.phone,
    make: [v.make, v.model].filter(Boolean).join(' '),
    plate: v.plateNumber,
    from: v.direction || c.comingFrom,
    to: c.goingTo,
    circumstances: Array.isArray(c.circumstances) ? c.circumstances.map(Number).filter(Boolean) : [],
    damage: c.damage?.visibleDamage,
    observations: c.observations,
  };
}

async function fillColumn(ctx: Ctx, d: DriverView, col: typeof COL_A) {
  await put(ctx, col.x, ROW.insurer, d.plan);
  await put(ctx, col.x, ROW.policy, d.policy);
  await put(ctx, col.x, ROW.agency, d.agency);
  await put(ctx, col.dateFrom, ROW.attest, d.validFrom, 8, 60);
  await put(ctx, col.dateTo, ROW.attest, d.validTo, 8, 60);

  await put(ctx, col.x, ROW.drvLast, d.lastName);
  await put(ctx, col.x, ROW.drvFirst, d.firstName);
  await put(ctx, col.x, ROW.drvAddr, d.address);
  await put(ctx, col.x, ROW.licence, d.licence);
  await put(ctx, col.x, ROW.licenceDate, d.licenceDate);

  // Section 8 (assuré) repeats the driver unless the constat says otherwise.
  await put(ctx, col.x, ROW.insLast, d.lastName);
  await put(ctx, col.x, ROW.insFirst, d.firstName);
  await put(ctx, col.x, ROW.insAddr, d.address);
  await put(ctx, col.x + 35, ROW.insTel, d.phone, 8, 85);

  await put(ctx, col.x, ROW.make, d.make);
  await put(ctx, col.x, ROW.plate, d.plate);
  await put(ctx, col.x, ROW.from, d.from);
  await put(ctx, col.x, ROW.to, d.to);

  for (const n of d.circumstances) {
    if (n >= 1 && n <= 17) mark(ctx, col.circX, CIRC_Y_TOP - (n - 1) * CIRC_PITCH);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Verified identity from eKYC, used to prefill the driver/insured blocks. */
export interface ConstatIdentity {
  fullName?: string;
  cin?: string;
  dob?: string;
  address?: string;
  phone?: string;
  licenceNumber?: string;
  licenceDate?: string;
  /** The plan the customer subscribed to, or undefined if they declined. */
  planName?: string;
}

export interface ConstatFillData {
  session: SessionState;
  me: Participant;
  other: Participant | null;
  /** Data-URL of the accident sketch, drawn into box 13. */
  croquisDataUrl?: string | null;
  place?: string;
  /** eKYC profile of the driver downloading this copy. */
  identity?: ConstatIdentity;
}

/**
 * Produce the filled official constat as a real PDF, both pages preserved.
 * Column A is always the driver downloading it, so each driver's copy leads
 * with their own details — the two constats legitimately differ.
 */
export async function buildConstatPdf(data: ConstatFillData): Promise<Blob> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`Modèle de constat introuvable (${res.status})`);
  const doc = await PDFDocument.load(await res.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx: Ctx = { page: doc.getPage(0), doc, font };

  const { session, me, other } = data;
  const A = toView(me, data.identity);
  if (!A.plan && data.identity?.planName) A.plan = data.identity.planName;
  const B = other ? toView(other) : null;

  // 1 date / heure · 2 lieu
  const when = new Date(session.lockedAt || session.createdAt);
  await put(ctx, 105, 716, when.toLocaleDateString('fr-FR'), 8, 70);
  await put(ctx, 288, 716, when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 8, 40);
  await put(ctx, 360, 716, data.place, 8, 180);

  // 3 blessés — taken from what the statements actually said, not assumed
  const injured = session.participants.some((p) => p.evidence?.statement?.slots?.injuries === true);
  mark(ctx, injured ? 530 : 455, 719);

  await fillColumn(ctx, A, COL_A);
  if (B) await fillColumn(ctx, B, COL_B);

  // 11 dégâts apparents · 14 observations
  await put(ctx, COL_A.dmgX, 127, A.damage, 7, 235);
  await put(ctx, COL_A.dmgX, 104, A.observations, 7, 235);
  if (B) {
    await put(ctx, COL_B.dmgX, 127, B.damage, 7, 235);
    await put(ctx, COL_B.dmgX, 104, B.observations, 7, 235);
  }

  // 13 croquis
  if (data.croquisDataUrl) {
    try {
      const png = await doc.embedPng(data.croquisDataUrl);
      const box = { x: 240, y: 210, w: 118, h: 96 };
      const s = Math.min(box.w / png.width, box.h / png.height);
      ctx.page.drawImage(png, {
        x: box.x + (box.w - png.width * s) / 2,
        y: box.y,
        width: png.width * s,
        height: png.height * s,
      });
    } catch {
      /* a malformed sketch must never block the document */
    }
  }

  // Traceability back to the stored record, for the agency
  ctx.page.drawText(session.caseId, { x: 424, y: 44, size: 6, font, color: rgb(0.4, 0.4, 0.45) });

  return new Blob([await doc.save()], { type: 'application/pdf' });
}

/** Build and download the filled constat as a .pdf file. */
export async function downloadConstatPdf(data: ConstatFillData): Promise<void> {
  const blob = await buildConstatPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `constat-${data.session.caseId}-${data.me.role}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: some mobile browsers open the blob asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
