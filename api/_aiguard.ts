// Site-wide daily AI caps, so a traffic spike (or someone with many accounts) can't drain
// the OpenRouter credit. Per-user limits live in each endpoint; this is the global backstop.
// Env: REFINE_GLOBAL_DAILY_LIMIT (default 40), SCAN_GLOBAL_DAILY_LIMIT (default 300), UNLIMITED_EMAILS.

export type AiFeature = 'deck_refine' | 'scan' | 'coach';

const DEFAULTS: Record<AiFeature, number> = { deck_refine: 40, scan: 300, coach: 150 };
const ENV: Record<AiFeature, string> = { deck_refine: 'REFINE_GLOBAL_DAILY_LIMIT', scan: 'SCAN_GLOBAL_DAILY_LIMIT', coach: 'COACH_GLOBAL_DAILY_LIMIT' };

export const globalLimit = (f: AiFeature) => Number(process.env[ENV[f]] || DEFAULTS[f]);

export const GLOBAL_CAP_MESSAGE =
  'The AI is resting: today’s shared budget for this free tool is used up. It resets at midnight UTC.';

export function isUnlimited(email: string | undefined | null): boolean {
  if (!email) return false;
  const set = (process.env.UNLIMITED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return set.includes(email.toLowerCase());
}

/**
 * Count one use against today's site-wide cap. Returns false when the cap is exceeded.
 * Scans and deck refinement retain their existing availability if a counter is down.
 * Coach can always show its local plan, so a paid lesson requires a working counter.
 */
export async function takeGlobal(feature: AiFeature, sbUrl: string | undefined, sbKey: string | undefined): Promise<boolean> {
  if (!sbUrl || !sbKey) return feature !== 'coach';
  try {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/bump_ai_global`, {
      method: 'POST',
      headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_feature: feature }),
    });
    if (!r.ok) {
      console.error('[aiguard] global counter unavailable (run migration 003?)', r.status);
      return feature !== 'coach';
    }
    const count = Number(await r.json());
    return (feature !== 'coach' || Number.isSafeInteger(count) && count >= 1) && count <= globalLimit(feature);
  } catch (e) {
    console.error('[aiguard] global counter error', e);
    return feature !== 'coach';
  }
}

export async function authAiUser(sbUrl: string | undefined, sbKey: string | undefined, token: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!sbUrl || !sbKey || !token) return null;
  const r = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: sbKey, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
}

export async function bumpUserUsage(sbUrl: string | undefined, sbKey: string | undefined, userId: string, feature: AiFeature): Promise<number> {
  const r = await fetch(`${sbUrl}/rest/v1/rpc/bump_ai_usage`, {
    method: 'POST',
    headers: { apikey: sbKey!, authorization: `Bearer ${sbKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user: userId, p_feature: feature }),
  });
  if (!r.ok) throw new Error(`usage counter failed (${r.status}). Has migration 002 been run?`);
  const count = Number(await r.json());
  if (feature === 'coach' && (!Number.isSafeInteger(count) || count < 1)) throw new Error('Invalid usage count.');
  return count;
}
