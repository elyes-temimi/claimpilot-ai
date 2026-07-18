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

export interface SessionState {
  code: string;
  caseId: string;
  createdAt: string;
  status: 'waiting' | 'active' | 'locked';
  lockedAt: string | null;
  participants: Participant[];
  events: SessionEvent[];
  analysis?: ConsistencyReport | null;
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
