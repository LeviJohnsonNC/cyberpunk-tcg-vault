// Vercel serverless function: POST /api/scan
// Body: { image: "data:image/jpeg;base64,..." }  Header: Authorization: Bearer <supabase access token>
// Env: OPENROUTER_API_KEY (required), OPENROUTER_MODEL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCAN_DAILY_LIMIT
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CARD_NAMES } from './_cards.js';

const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 25);
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ipHits = new Map<string, { day: string; n: number }>(); // fallback limiter when Supabase isn't configured

const norm = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const INDEX = CARD_NAMES.map((c) => ({ ...c, n: norm(c.display), base: norm(c.name) }));
export function match(name: string): { slug: string; score: number } | null {
  const n = norm(name);
  if (!n) return null;
  const exact = INDEX.find((c) => c.n === n);
  if (exact) return { slug: exact.slug, score: 1 };
  const byBase = INDEX.filter((c) => c.base === n);
  if (byBase.length === 1) return { slug: byBase[0].slug, score: 0.9 };
  let best: { slug: string; score: number } | null = null;
  for (const c of INDEX) {
    const d = lev(n, c.n);
    const score = 1 - d / Math.max(n.length, c.n.length);
    if (!best || score > best.score) best = { slug: c.slug, score };
  }
  return best && best.score >= 0.72 ? best : null;
}

async function authUser(token: string | undefined): Promise<string | null> {
  if (!SB_URL || !SB_KEY || !token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id ?? null;
}

async function bumpUsage(userId: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/bump_scan_usage`, {
    method: 'POST',
    headers: { apikey: SB_KEY!, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user: userId }),
  });
  if (!r.ok) throw new Error(`usage counter failed (${r.status})`);
  return Number(await r.json());
}

const PROMPT = `You are identifying physical Cyberpunk TCG cards (WeirdCo / CD PROJEKT RED, set "Welcome to Night City") in a photo.
Cards may be rotated sideways or upside down, sleeved, glossy, or partly overlapping. The card name is printed in bold capitals along the art, with an optional subtitle under it (e.g. "VIKTOR VEKTOR" / "YOU MIGHT FEEL A LITTLE PINCH").
Count EVERY visible card, including duplicates. Only use names from this list (format "Name: Subtitle"):
{{NAMES}}
Respond with JSON only:
{"cards":[{"name":"<exact name from list>","count":<int>,"confidence":<0-1>,"read":"<text you actually read>"}],"unidentified":<int>}
If you cannot read a card well enough, add it to "unidentified" rather than guessing.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'Photo scanning is not configured on this server yet.' });

  const image: string | undefined = req.body?.image;
  if (!image || !image.startsWith('data:image/') || image.length > 6_000_000)
    return res.status(400).json({ error: 'Send a JPEG/PNG data URL under ~4 MB.' });

  // --- auth + rate limit ---
  let remaining: number | undefined;
  if (SB_URL && SB_KEY) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || undefined;
    const userId = await authUser(token);
    if (!userId) return res.status(401).json({ error: 'Sign in to use photo scanning.' });
    const used = await bumpUsage(userId);
    if (used > LIMIT) return res.status(429).json({ error: `Daily scan limit reached (${LIMIT}). Try again tomorrow.` });
    remaining = LIMIT - used;
  } else {
    const ip = String(req.headers['x-forwarded-for'] || 'anon').split(',')[0];
    const day = new Date().toISOString().slice(0, 10);
    const h = ipHits.get(ip);
    const n = h && h.day === day ? h.n + 1 : 1;
    ipHits.set(ip, { day, n });
    if (n > LIMIT) return res.status(429).json({ error: 'Daily scan limit reached.' });
    remaining = LIMIT - n;
  }

  // --- vision call ---
  const names = CARD_NAMES.map((c) => c.display).join('\n');
  let content = '';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault',
        'X-Title': 'Cyberpunk TCG Vault',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT.replace('{{NAMES}}', names) },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!r.ok) return res.status(502).json({ error: `Vision model error: ${data.error?.message ?? r.status}` });
    content = data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return res.status(502).json({ error: `Vision request failed: ${(e as Error).message}` });
  }

  let parsed: { cards?: { name: string; count?: number; confidence?: number; read?: string }[]; unidentified?: number };
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return res.status(502).json({ error: 'Could not parse the model response. Try a clearer photo.' });
  }

  const matches: { slug: string; qty: number; confidence: number; read: string }[] = [];
  const unmatched: string[] = [];
  for (const c of parsed.cards ?? []) {
    const m = match(c.name || c.read || '');
    if (!m) { unmatched.push(c.name || c.read || '?'); continue; }
    const qty = Math.max(1, Math.min(30, Math.round(c.count ?? 1)));
    const conf = Math.min(1, (c.confidence ?? 0.8) * (m.score < 1 ? m.score : 1));
    const ex = matches.find((x) => x.slug === m.slug);
    if (ex) ex.qty += qty;
    else matches.push({ slug: m.slug, qty, confidence: conf, read: c.read ?? '' });
  }
  return res.status(200).json({ matches, unmatched, unidentified: parsed.unidentified ?? 0, remaining, model: MODEL });
}
