export type ImpactZone =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'left'
  | 'right'
  | 'rear'
  | 'rear-left'
  | 'rear-right';

export const IMPACT_LABELS: Record<ImpactZone, string> = {
  front: 'Front',
  'front-left': 'Front left',
  'front-right': 'Front right',
  left: 'Left side',
  right: 'Right side',
  rear: 'Rear',
  'rear-left': 'Rear left',
  'rear-right': 'Rear right',
};

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  simulated?: boolean;
}

export interface EvidencePhotoMeta {
  id: string;
  side: 'front' | 'rear' | 'left' | 'right';
  severity: 'minor' | 'moderate' | 'severe';
  damageRatio: number;
  regionCount: number;
  confidence: number;
  thumb: string | null;
  placeholder?: boolean;
}

export interface StatementMeta {
  raw: string;
  summary: string;
  shares: Record<string, number>;
  codeSwitching: boolean;
  slots: {
    impactDirection: 'front' | 'rear' | 'left' | 'right' | null;
    movement: string | null;
    faultClaim: 'other' | 'self' | null;
    injuries: boolean | null;
    conditions: string[];
  } | null;
}

export interface ParticipantEvidence {
  photos: EvidencePhotoMeta[];
  statement: StatementMeta | null;
  updatedAt: string;
}

export interface ConsistencyCheck {
  id: string;
  status: 'pass' | 'flag' | 'info' | 'unknown';
  title: string;
  detail: string;
}

export interface ConsistencyReport {
  score: number;
  verdict: 'fast-track' | 'standard' | 'adjuster';
  verdictLabel: string;
  checks: ConsistencyCheck[];
  computedAt: string;
}

export interface Participant {
  pid: string;
  role: 'A' | 'B';
  name: string;
  verified: boolean;
  policy: string | null;
  simulated: boolean;
  connected: boolean;
  joinMethod: 'created' | 'qr' | 'code' | 'simulated';
  joinedAt: string;
  position: GeoPosition | null;
  impact: ImpactZone | null;
  confirmed: boolean;
  evidence?: ParticipantEvidence | null;
  constat?: import('./constatTypes').ParticipantConstat | null;
}

export interface SessionEvent {
  at: string;
  icon: string;
  text: string;
}

/** Fraud verdict computed server-side (rules + local LLM). */
export interface FraudFinding {
  role: 'A' | 'B' | null;
  code: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  origin: 'rules' | 'llm';
  /** False when only the LLM saw it — shown as "to verify", not as fact. */
  confirmed: boolean;
}

export interface FraudReport {
  score: number;
  risk: 'low' | 'medium' | 'high';
  flagged: boolean;
  summary: string;
  findings: FraudFinding[];
  integrityScore: number;
  verdict: 'fast-track' | 'standard' | 'adjuster';
  analysedBy: string;
  computedAt: string;
}

export interface PersistenceState {
  persisted: boolean;
  spooled?: boolean;
  reason?: string;
}

/** One costed part on the repair estimate. */
export interface EstimateLine {
  side: string;
  partKey: string;
  partLabel: string;
  action: 'repair' | 'replace';
  severity: string;
  fromDiagram: boolean;
  partsCost: number;
  labourCost: number;
  labourHours: number;
  total: number;
  currency: string;
  source: string;
  shops: { id: string; name: string; kind: string; note: string; url: string }[];
}

export interface RepairEstimate {
  currency: string;
  tier: string;
  tierLabel: string;
  city: string;
  lines: EstimateLine[];
  partsTotal: number;
  labourTotal: number;
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: number;
  sides: string[];
  disclaimer: string;
  hiddenDamage: string[];
  rationale: string | null;
  llmUsed: boolean;
}

export interface SessionState {
  code: string;
  caseId: string;
  createdAt: string;
  status: 'waiting' | 'active' | 'locked';
  lockedAt: string | null;
  participants: Participant[];
  events: SessionEvent[];
  analysis?: ConsistencyReport | null;
  fraud?: FraudReport | null;
  fraudPending?: boolean;
  /** Repair estimate per driver role ('A' | 'B'). */
  estimates?: Record<string, RepairEstimate> | null;
  persistence?: PersistenceState | null;
}

export interface MyIdentity {
  name: string;
  verified: boolean;
  policy: string | null;
}

export interface SessionPreview {
  code: string;
  caseId: string;
  createdAt: string;
  status: string;
  createdBy: string;
  participantCount: number;
}

/** Distance between two coordinates in metres (haversine). */
export function distanceMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
