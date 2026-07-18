import type { AmlResult, KycProfile, PolicyStepResponse, SignedProfileResult } from '../types';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  amlScreen: (fullName: string, dob: string) =>
    post<AmlResult>('/api/aml/screen', { fullName, dob }),

  signProfile: (profile: KycProfile) =>
    post<SignedProfileResult>('/api/profile/sign', { profile }),

  policyStep: (answers: Record<string, string>, profile: { age: number | null }) =>
    post<PolicyStepResponse>('/api/policy/step', { answers, profile }),
};
