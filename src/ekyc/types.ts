// eKYC Types

export interface CinData {
  fullName: string;
  dob: string;
  cinNumber: string;
  address: string;
  frontImage: string | null; // base64
  backImage: string | null;
}

export interface LivenessResult {
  passed: boolean;
  method: 'blink' | 'head-turn' | 'skipped';
  selfieImage: string | null;
}

export interface ScreeningResult {
  status: 'clear' | 'review' | 'blocked';
  hits: Array<{
    name: string;
    list: string;
    score: number;
  }>;
}

export interface ProfileData {
  incomeBracket: string;
  livingArea: string;
  conditions: Record<string, boolean>;
}

export interface PolicyMatch {
  name: string;
  tagline: string;
  covers: string[];
  confidence: number;
}

export interface EkycState {
  step: number;
  cin: CinData;
  liveness: LivenessResult | null;
  screening: ScreeningResult | null;
  profile: ProfileData | null;
  policy: PolicyMatch | null;
  signature: string | null;
  profileId: string | null;
}

export const STEPS = [
  'Welcome',
  'CIN Capture',
  'Confirm Details',
  'Liveness Check',
  'Screening',
  'Profile Questions',
  'Policy Match',
  'Signature',
  'Complete'
];
