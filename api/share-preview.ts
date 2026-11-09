// Vercel serverless function behind /d/<token> (see the rewrite in vercel.json).
// Serves Open Graph tags so Discord and Reddit show the deck name, then sends people to the
// in-app reader at /#/shared?deck=<token>. It reads only through get_shared_deck (migration 005),
// which returns the snapshot's name and list and nothing else.
// Env: SUPABASE_URL (or VITE_SUPABASE_URL), and SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY,
// falling back to SUPABASE_SERVICE_ROLE_KEY. The function only ever calls get_shared_deck.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CARD } from './_deckrules.js';

const TOKEN_RE = /^[0-9a-f]{32}$/;
const SITE = 'https://cyberpunk-tcg-vault.vercel.app';

export interface PreviewDeck {
  name: string;
  legends: string[];
  cards: Record<string, number>;
  sideboard: Record<string, number>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const total = (r: unknown) =>
  r && typeof r === 'object' ? Object.values(r as Record<string, unknown>).reduce<number>((a, v) => a + (typeof v === 'number' && v > 0 ? v : 0), 0) : 0;

export function previewText(d: PreviewDeck | null): { title: string; description: string } {
  if (!d) return { title: 'Shared deck not found · Fixer', description: 'This deck link was replaced or revoked. Fixer is a free Cyberpunk TCG collection, price and deck toolkit.' };
  const legends = (Array.isArray(d.legends) ? d.legends : []).map((s) => CARD.get(s)?.name).filter(Boolean);
  const main = total(d.cards);
  const side = total(d.sideboard);
  const parts = [
    legends.length ? `Legends: ${legends.join(', ')}.` : 'No Legends yet.',
    `${main} card main deck${side ? `, ${side} card sideboard` : ''}.`,
    'Compare it to your collection and see what it costs to finish.',
  ];
  return { title: `${String(d.name || 'Untitled deck').slice(0, 80)} · Cyberpunk TCG deck on Fixer`, description: parts.join(' ') };
}

export function renderPreview(token: string, d: PreviewDeck | null, origin = SITE): string {
  const { title, description } = previewText(d);
  const target = `/#/shared?deck=${token}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="noindex" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Fixer" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${origin}/d/${token}" />
<meta property="og:image" content="${origin}/og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${origin}/og.jpg" />
<meta name="theme-color" content="#17101B" />
<meta http-equiv="refresh" content="0; url=${target}" />
</head><body>
<p><a href="${target}">Open ${esc(d?.name ?? 'the deck')} in Fixer</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;
}

export async function fetchDeck(token: string, fetchImpl: typeof fetch = fetch): Promise<PreviewDeck | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !TOKEN_RE.test(token)) return null;
  try {
    const r = await fetchImpl(`${url}/rest/v1/rpc/get_shared_deck`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as PreviewDeck[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const safe = TOKEN_RE.test(token) ? token : '';
  const deck = safe ? await fetchDeck(safe) : null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short edge cache: a revoked or replaced link stops previewing within about a minute.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.status(deck ? 200 : 404).send(renderPreview(safe, deck));
}
