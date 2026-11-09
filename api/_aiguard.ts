// Site-wide daily AI caps, so a traffic spike (or someone with many accounts) can't drain
// the OpenRouter credit. Per-user limits live in each endpoint; this is the global backstop.
// Env: REFINE_GLOBAL_DAILY_LIMIT (default 40), SCAN_GLOBAL_DAILY_LIMIT (default 300), UNLIMITED_EMAILS.

export type AiFeature = 'deck_refine' | 'scan';

const DEFAULTS: Record<AiFeature, number> = { deck_refine: 40, scan: 300 };
const ENV: Record<AiFeature, string> = { deck_refine: 'REFINE_GLOBAL_DAILY_LIMIT', scan: 'SCAN_GLOBAL_DAILY_LIMIT' };

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
 * Fails open (returns true, logs) if the counter isn't set up yet, so a missing migration
 * doesn't take the feature down; the OpenRouter key's own credit limit is the last backstop.
 */
export async function takeGlobal(feature: AiFeature, sbUrl: string | undefined, sbKey: string | undefined): Promise<boolean> {
  if (!sbUrl || !sbKey) return true;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/bump_ai_global`, {
      method: 'POST',
      headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_feature: feature }),
    });
    if (!r.ok) {
      console.error('[aiguard] global counter unavailable (run migration 003?)', r.status);
      return true;
    }
    return Number(await r.json()) <= globalLimit(feature);
  } catch (e) {
    console.error('[aiguard] global counter error', e);
    return true;
  }
}
