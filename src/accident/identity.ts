import type { MyIdentity } from './types';

/**
 * Pull the verified identity + matched policy saved by Phases 1–2.
 * The unified-lifecycle pitch made real: nothing is re-entered here.
 */
export function loadStoredIdentity(): MyIdentity & { fromEkyc: boolean } {
  let name = '';
  let verified = false;
  let policy: string | null = null;
  try {
    const p = JSON.parse(localStorage.getItem('cp_profile') || 'null');
    if (p?.fullName) {
      name = p.fullName;
      verified = !!p.verified;
    }
  } catch {
    /* ignore */
  }
  try {
    const pol = JSON.parse(localStorage.getItem('cp_policy') || 'null');
    if (pol?.name) policy = pol.name;
  } catch {
    /* ignore */
  }
  return { name: name || 'Guest Driver', verified, policy, fromEkyc: !!name };
}
