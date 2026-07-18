export interface IdFields {
  fullName: string;
  dob: string;
  idNumber: string;
}

export interface AmlHit {
  name: string;
  dob: string;
  list: 'SANCTIONS' | 'PEP';
  program: string;
  country: string;
  note: string;
  score: number;
}

export interface AmlResult {
  screeningId: string;
  status: 'clear' | 'review';
  hits: AmlHit[];
  listsChecked: string[];
  screenedAt: string;
}

export interface SignedProfileResult {
  profileId: string;
  hash: string;
  signature: string;
  signedAt: string;
  algorithm: string;
  publicKeyPem: string;
}

export interface BiometricResult {
  image: string | null;
  distance: number | null; // face descriptor distance vs ID photo (lower = closer)
  liveness: 'passed' | 'skipped' | 'simulated';
  simulated: boolean;
}

export interface PolicyInfo {
  id: string;
  name: string;
  tier: number;
  tagline: string;
  base: number;
  covers: string[];
  notCovered: string[];
}

export interface Recommendation {
  policy: PolicyInfo;
  premiumTND: number;
  confidence: number;
  reasons: string[];
  youngDriver: boolean;
  runnerUp: { name: string; whyNot: string };
}

export interface QuestionOption {
  value: string;
  label: string;
  emoji?: string;
}

export interface PolicyQuestion {
  id: string;
  text: string;
  hint?: string;
  options: QuestionOption[];
}

export type PolicyStepResponse =
  | { type: 'question'; question: PolicyQuestion; progress: { asked: number; remaining: number } }
  | ({ type: 'recommendation' } & Recommendation);

export interface KycProfile {
  fullName: string;
  dob: string;
  idNumber: string;
  checks: {
    documentOcr: 'passed' | 'manual';
    faceMatch: string;
    liveness: string;
    amlScreening: string;
  };
  consentSignatureHash: string;
  createdAt: string;
}

export type Card =
  | { kind: 'fields'; fields: IdFields; source: 'ocr' | 'manual' }
  | { kind: 'biometric'; data: BiometricResult; hasReference: boolean }
  | { kind: 'aml'; data: AmlResult }
  | { kind: 'signed'; data: SignedProfileResult; profile: KycProfile; qr: string }
  | { kind: 'policy'; data: Recommendation };

export type MsgBody =
  | { from: 'bot'; text: string }
  | { from: 'user'; text: string }
  | { from: 'user-image'; image: string; caption?: string }
  | { from: 'card'; card: Card };

export type Msg = MsgBody & { id: number };

export type WidgetSpec =
  | { type: 'chips'; options: QuestionOption[] }
  | { type: 'idCapture' }
  | { type: 'fieldsConfirm'; fields: IdFields }
  | { type: 'selfie'; hasReference: boolean }
  | { type: 'signature' }
  | { type: 'processing'; label: string; pct?: number };

export type StepId = 'identity' | 'liveness' | 'screening' | 'signature' | 'policy';
