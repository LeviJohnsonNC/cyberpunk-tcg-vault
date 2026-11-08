// Vercel serverless function: POST /api/refine-deck
// Refines a deterministic vault build with an LLM, then repairs the result into a legal,
// buildable deck. The model makes judgement calls; code enforces every rule.
//
// Body: { legends: string[3], baseline: {slug:qty}, owned: {slug:qty}, style?: string, mustInclude?: string[] }
// Header: Authorization: Bearer <supabase access token>
// Env: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      DECK_MODEL (default anthropic/claude-sonnet-5.5), DECK_DAILY_LIMIT (default 3),
//      UNLIMITED_EMAILS (comma-separated; bypasses the daily limit)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CARD, fits, ramLimits, repair, resolveName, validateDeck } from './_deckrules.js';

const MODEL = process.env.DECK_MODEL || 'anthropic/claude-sonnet-5.5';
const LIMIT = Number(process.env.DECK_DAILY_LIMIT || 3);
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UNLIMITED = new Set(
  (process.env.UNLIMITED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const STYLES = new Set(['balanced', 'aggro', 'control']);

async function authUser(token: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!SB_URL || !SB_KEY || !token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
}

async function bumpUsage(userId: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/bump_ai_usage`, {
    method: 'POST',
    headers: { apikey: SB_KEY!, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user: userId, p_feature: 'deck_refine' }),
  });
  if (!r.ok) throw new Error(`usage counter failed (${r.status}). Has migration 002 been run?`);
  return Number(await r.json());
}

const RULES = `Cyberpunk TCG constructed rules (casual, best-of-one, no sideboard):
- Deck = exactly 3 Legends (fixed, given) + 40 to 50 main-deck cards. Aim for exactly 40.
- Max 3 copies of a card, and never more copies than the player owns (given).
- RAM: a card is legal only if its RAM <= the total RAM of its colour across the 3 Legends (given).
- Win: start your turn with 7 Gigs (dice). Each player has 6, so you must steal. Units attacking the rival's Gig area steal 1 Gig at 1-9 power, 2 at 10-19.
- Eddies (mana): once per turn sell a card with a sell tag (Gear/Programs, marked "sell") for 1 permanent Eddie; Legends can also be spent for 1. Decks need ~20+ sellable cards.
- Units enter unable to attack (unless Adrenaline/Go Solo). Attacking spends a Unit; only spent Units can be attacked. Blockers redirect attacks. Quick effects work on the rival's turn.`;

function cardLine(slug: string, ownedQty?: number) {
  const c = CARD.get(slug)!;
  const stats = [c.type, c.color, c.cost != null ? `${c.cost}€$` : null, c.power != null ? (c.type === 'Gear' ? `+${c.power}pw` : `${c.power}pw`) : null, `RAM${c.ram}`, c.sellable ? 'sell' : null]
    .filter(Boolean)
    .join(', ');
  return `- ${c.display} [${stats}]${ownedQty != null ? ` owned:${Math.min(ownedQty, 3)}` : ''} :: ${c.text.replace(/\s+/g, ' ').slice(0, 240)}`;
}

export function buildPrompt(legends: string[], baseline: Record<string, number>, pool: Record<string, number>, style: string, must: string[]) {
  const lim = ramLimits(legends);
  return `${RULES}

You are an expert Cyberpunk TCG deckbuilder. Improve this deck, which a simple rating-based algorithm built from the player's collection. Make judgement calls the algorithm can't: synergy with the Legends, curve, interaction, and a coherent game plan. Only swap where you have a real reason; keeping good cards is fine.

LEGENDS (fixed):
${legends.map((l) => cardLine(l)).join('\n')}
RAM limits by colour: ${JSON.stringify(lim)}
Play style requested: ${style}${must.length ? `\nMust include: ${must.map((m) => CARD.get(m)?.display).join(', ')}` : ''}

CURRENT LIST (${Object.values(baseline).reduce((a, b) => a + b, 0)} cards):
${Object.entries(baseline).map(([s, n]) => `${n} ${CARD.get(s)?.display}`).join('\n')}

CARDS THE PLAYER OWNS THAT ARE LEGAL FOR THIS CREW (you may only use these, up to owned count):
${Object.entries(pool).map(([s, n]) => cardLine(s, n)).join('\n')}

Respond with JSON only, no prose outside it:
{"deck":[{"name":"<exact card name>","qty":<1-3>}],"swaps":[{"out":"<card>","in":"<card>","why":"<short reason>"}],"summary":"<2-3 sentences: what the deck does>","plan":["<3-4 short game-plan steps>"],"mulligan":"<one sentence>","buy":[{"name":"<card NOT in the owned list that would improve this deck>","why":"<short reason>"}]}
Rules for your answer: deck must total 40 cards; use exact names from the lists; at most 5 swaps and 4 buy suggestions; no em-dashes.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'AI refinement is not configured on this server yet.' });
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'AI refinement needs accounts (Supabase) configured.' });

  // ---- input ----
  const body = (req.body ?? {}) as { legends?: unknown; baseline?: unknown; owned?: unknown; style?: unknown; mustInclude?: unknown };
  const legends = Array.isArray(body.legends) ? body.legends.map(String) : [];
  const asCounts = (x: unknown): Record<string, number> =>
    x && typeof x === 'object'
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([s, n]) => CARD.has(s) && Number(n) > 0).map(([s, n]) => [s, Math.min(99, Math.floor(Number(n)))]))
      : {};
  const baseline = asCounts(body.baseline);
  const owned = asCounts(body.owned);
  const style = STYLES.has(String(body.style)) ? String(body.style) : 'balanced';
  const must = Array.isArray(body.mustInclude) ? body.mustInclude.map(String).filter((s) => CARD.has(s)).slice(0, 2) : [];
  if (validateDeck(legends, baseline).length) return res.status(400).json({ error: 'Send a legal baseline deck.' });
  if (legends.some((l) => !owned[l])) return res.status(400).json({ error: 'You must own all three Legends.' });

  // ---- auth + limit ----
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || undefined;
  const user = await authUser(token);
  if (!user) return res.status(401).json({ error: 'Sign in to refine decks with AI.' });
  const unlimited = UNLIMITED.has(user.email);
  let remaining: number | null = null;
  if (!unlimited) {
    let used: number;
    try {
      used = await bumpUsage(user.id);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
    if (used > LIMIT) return res.status(429).json({ error: `You've used today's ${LIMIT} AI refinements. They reset at midnight UTC.` });
    remaining = LIMIT - used;
  }

  // ---- model ----
  const lim = ramLimits(legends);
  const pool = Object.fromEntries(Object.entries(owned).filter(([s]) => CARD.get(s)!.type !== 'Legend' && fits(CARD.get(s)!, lim)));
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
        temperature: 0.3,
        max_tokens: 2500,
        messages: [{ role: 'user', content: buildPrompt(legends, baseline, pool, style, must) }],
      }),
    });
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!r.ok) return res.status(502).json({ error: `AI model error: ${data.error?.message ?? r.status}` });
    content = data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return res.status(502).json({ error: `AI request failed: ${(e as Error).message}` });
  }

  let parsed: {
    deck?: { name: string; qty: number }[];
    swaps?: { out: string; in: string; why: string }[];
    summary?: string;
    plan?: string[];
    mulligan?: string;
    buy?: { name: string; why: string }[];
  };
  try {
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    parsed = JSON.parse(json);
  } catch {
    return res.status(502).json({ error: 'The AI answer could not be read. Try again.' });
  }

  // ---- repair + verify ----
  const fixed = repair(legends, Array.isArray(parsed.deck) ? parsed.deck : [], pool, baseline);
  for (const m of must) {
    // honour must-includes even if the model dropped them (swap out the last non-baseline copy)
    if (CARD.get(m)!.type !== 'Legend' && !fixed.cards[m] && pool[m]) {
      const victim = Object.keys(fixed.cards).find((s) => !baseline[s] && !must.includes(s)) ?? Object.keys(fixed.cards).at(-1)!;
      fixed.cards[victim]--;
      if (!fixed.cards[victim]) delete fixed.cards[victim];
      fixed.cards[m] = 1;
    }
  }
  const issues = validateDeck(legends, fixed.cards);
  if (issues.length) return res.status(502).json({ error: 'Could not turn the AI answer into a legal deck. Your original build is unchanged.', issues });

  const text = (s: unknown, max: number) => String(s ?? '').replace(/\s*—\s*/g, ', ').slice(0, max);
  const buy = (Array.isArray(parsed.buy) ? parsed.buy : [])
    .map((b) => ({ card: resolveName(String(b.name ?? '')), why: text(b.why, 160) }))
    .filter((b) => b.card && b.card.type !== 'Legend' && fits(b.card, lim) && (owned[b.card.slug] ?? 0) < 3)
    .slice(0, 4)
    .map((b) => ({ slug: b.card!.slug, why: b.why }));
  const swaps = (Array.isArray(parsed.swaps) ? parsed.swaps : [])
    .slice(0, 5)
    .map((s) => ({ out: resolveName(String(s.out ?? ''))?.slug ?? null, in: resolveName(String(s.in ?? ''))?.slug ?? null, why: text(s.why, 160) }))
    .filter((s) => s.in && fixed.cards[s.in]);

  return res.status(200).json({
    legends,
    cards: fixed.cards,
    summary: text(parsed.summary, 600),
    plan: (Array.isArray(parsed.plan) ? parsed.plan : []).slice(0, 5).map((p) => text(p, 220)),
    mulligan: text(parsed.mulligan, 240),
    swaps,
    buy,
    repaired: { dropped: fixed.dropped, toppedUp: fixed.toppedUp },
    remaining,
    unlimited,
    model: MODEL,
  });
}
