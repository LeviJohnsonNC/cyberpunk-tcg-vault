// Vercel serverless function: POST /api/scan
// Body: { image: "data:image/jpeg;base64,...", detailImages?: string[] }  Header: Authorization: Bearer <supabase access token>
// Env: OPENROUTER_API_KEY (required), OPENROUTER_MODEL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCAN_DAILY_LIMIT,
//      SCAN_GLOBAL_DAILY_LIMIT (default 300), UNLIMITED_EMAILS
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GLOBAL_CAP_MESSAGE, isUnlimited, takeGlobal } from './_aiguard.js';
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

const PRINTINGS_BY_SLUG = new Map(CARD_NAMES.map(card => [card.slug, card.printings]));

// Match the small code beside the yellow number to the catalog's set names.
const SETS_BY_CODE = new Map<string, readonly string[]>([
  ['ms01wnc', ['Welcome to Night City — Retail', 'Welcome to Night City — Beta']],
  ['sd01hei', ['The Heist — Retail Starter Deck', 'The Heist — Beta Starter Deck']],
  ['sd02ebp', ['Embracing Power — Retail Starter Deck', 'Embracing Power — Beta Starter Deck']],
  ['prr01wnc', ['Pre-Release Beta']],
  ['prr02wnc', ['Pre-Release Retail']],
  ['prmwnc', ['Box Toppers — Retail', 'Box Toppers — Beta']],
  ['prm01', ['Set 1 Promos']],
  ['prmdd1', ['Merc Demo Deck']],
  ['prmdd2', ['Arasaka Demo Deck']],
  ['ncb01wnc', ['Night City Brawl S 1']],
  ['ncs01wnc', ['Night City Showdown S1']],
  ['eor01wnc', ['Edgerunner Open S 1']],
  ['jdgwnc', ['Judge Promos']],
]);

function collectorNumber(value: unknown) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).normalize('NFKC').trim() : '';
  const match = text.match(/^#?\s*(β|beta|b)?\s*([0-9]{1,3})([a-z]?)$/i);
  if (!match) return null;
  const [, beta, digits, suffix] = match;
  return `${beta ? 'β' : ''}${digits.padStart(3, '0')}${suffix.toLowerCase()}`;
}

function printedSetCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const code = value.normalize('NFKC').trim().toUpperCase().replace(/\s*\[[A-Z]\]$/, '').replace(/\s*[-–—]\s*|\s+/g, '-');
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(code) ? code : null;
}

function identifyPrinting(slug: string, number: string | null, code: string | null, set: unknown): string | null {
  if (!number) return null;
  const codeSets = code ? SETS_BY_CODE.get(norm(code)) : undefined;
  if (code && !codeSets) return null;
  const setKey = typeof set === 'string' ? norm(set) : '';
  const candidates = (PRINTINGS_BY_SLUG.get(slug) ?? []).filter(
    (printing) => collectorNumber(printing.num) === number && (!codeSets || codeSets.includes(printing.set))
      && (!setKey || norm(printing.set) === setKey),
  );
  return candidates.length === 1 ? candidates[0].id : null;
}

async function authUser(token: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!SB_URL || !SB_KEY || !token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
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

const sets = [...new Set(CARD_NAMES.flatMap(card => card.printings.map(printing => printing.set)))].sort();
const NUMBER_INSTRUCTIONS = `Read the small black digits on the yellow diagonal collector-number tab at the card's lower left. Transcribe them as a string, including leading zeroes, any letter suffix and the B-shaped or β prefix on Beta copies (for example "138", "B167", or "004a"). Keep that prefix distinct from the digits. Return null if the number or its prefix is unreadable. Never infer a number from a title, illustration, rarity, foil, or game stats.`;
const cardResult = (setField: string) => `{"name":"<exact catalog name>","collector_number":<string or null>,"${setField}":<string or null>,"count":<int>,"confidence":<0-1>,"read":"<title text you actually read>"}`;

const PROMPT = `You are identifying physical Cyberpunk TCG cards (WeirdCo / CD PROJEKT RED) in a photo, including starter cards and promos.
Cards may be rotated sideways or upside down, sleeved, glossy, or partly overlapping. The card title and subtitle identify the card; its footer identifies the printing.
{{PHOTO_LAYOUT}}
${NUMBER_INSTRUCTIONS}
In "printing_code", transcribe the complete small code running along the left edge beside the yellow number, such as "MS01 - WNC [A]", "SD01 - HEI [A]", "PRR02 - WNC", or "PRM01". Return null if it is unreadable. Do not translate it into an edition name or guess it from the art.
Count EVERY visible card in the overview, including duplicates. Group copies only when their card name, collector number, and printing code agree. Use only names from this list (format "Name: Subtitle"):
{{NAMES}}
Respond with JSON only:
{"cards":[${cardResult('printing_code')}],"unidentified":<int>}
If you cannot read a card well enough, add it to "unidentified" rather than guessing.`;

const SINGLE_PROMPT = `Identify one physical Cyberpunk TCG card centered in a cropped camera frame. The frame may be empty or contain a blurry or partly visible card.
Read the printed title and subtitle, and only identify the card if you can distinguish it from similar cards in this catalog:
{{NAMES}}
${NUMBER_INSTRUCTIONS}
Set "printing_set" only when a readable marking establishes a catalog label: ${sets.join('; ')}. Otherwise return null.
Respond with JSON only, using {"cards":[${cardResult('printing_set')}],"unidentified":0}. When identified, set "count" to 1.
If no single card is clearly identifiable, return {"cards":[],"unidentified":1}. Never infer a card from background objects.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'Photo scanning is not configured on this server yet.' });

  const image: unknown = req.body?.image;
  const detailImages: unknown = req.body?.detailImages;
  const single = req.body?.mode === 'single';
  if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > 4_400_000)
    return res.status(400).json({ error: 'Send a JPEG/PNG data URL under ~4 MB.' });
  const details = Array.isArray(detailImages) ? detailImages : [];
  if (detailImages !== undefined && (single || !Array.isArray(detailImages) || details.length !== 4
    || !details.every((url) => typeof url === 'string' && url.startsWith('data:image/jpeg;base64,'))
    || image.length + details.reduce((total, url) => total + url.length, 0) > 4_400_000)) {
    return res.status(400).json({ error: 'The photo and its close-ups must fit in a single upload.' });
  }

  // --- auth + rate limit ---
  let remaining: number | undefined;
  if (SB_URL && SB_KEY) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || undefined;
    const user = await authUser(token);
    if (!user) return res.status(401).json({ error: 'Sign in to use photo scanning.' });
    if (!isUnlimited(user.email)) {
      const used = await bumpUsage(user.id);
      if (used > LIMIT) return res.status(429).json({ error: `Daily scan limit reached (${LIMIT}). Try again tomorrow.` });
      remaining = LIMIT - used;
      if (!(await takeGlobal('scan', SB_URL, SB_KEY))) return res.status(429).json({ error: GLOBAL_CAP_MESSAGE, code: 'global' });
    }
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
  const recognize = async (imageUrls: string[]) => {
    const layout = imageUrls.length > 1
      ? 'Image 1 is the full photo. Images 2–5 are overlapping close-ups of the same photo, ordered top left, top right, bottom left, bottom right. Use the first image for locations and counts. Use the close-ups to read the title and footer of the corresponding card. Never count the same card again in a close-up or transfer a footer to a different copy.'
      : 'The image is the full photo. Read each footer from the same card as its title.';
    const prompt = (single ? SINGLE_PROMPT : PROMPT.replace('{{PHOTO_LAYOUT}}', layout)).replace('{{NAMES}}', names);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: single ? 2500 : 4500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      }),
    });
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    return { response, data };
  };

  let content = '';
  try {
    let { response, data } = await recognize([image, ...details]);
    // A configured vision model can accept a single image but reject a multi-image request.
    if (details.length && (response.status === 400 || response.status === 422)
      && /multiple images|too many images|(?:one|1) image\b/i.test(data.error?.message ?? '')) {
      ({ response, data } = await recognize([image]));
    }
    if (!response.ok) return res.status(502).json({ error: `Vision model error: ${data.error?.message ?? response.status}` });
    content = data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return res.status(502).json({ error: `Vision request failed: ${(e as Error).message}` });
  }

  let parsed: { cards?: { name: string; count?: number; confidence?: number; read?: string; collector_number?: unknown; printing_code?: unknown; printing_set?: unknown }[]; unidentified?: number };
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return res.status(502).json({ error: 'Could not parse the model response. Try a clearer photo.' });
  }

  const matches: { slug: string; printingId: string | null; collectorNumber: string | null; printingCode: string | null; qty: number; confidence: number; read: string }[] = [];
  const unmatched: string[] = [];
  for (const c of parsed.cards ?? []) {
    const m = match(c.name || c.read || '');
    if (!m) { unmatched.push(c.name || c.read || '?'); continue; }
    const qty = Math.max(1, Math.min(30, Math.round(c.count ?? 1)));
    const conf = Math.min(1, (c.confidence ?? 0.8) * (m.score < 1 ? m.score : 1));
    const number = collectorNumber(c.collector_number);
    const code = printedSetCode(c.printing_code);
    const printingId = identifyPrinting(m.slug, number, code, c.printing_set);
    const ex = matches.find((x) => x.slug === m.slug && x.printingId === printingId
      && (printingId !== null || (x.collectorNumber === number && x.printingCode === code)));
    if (ex) ex.qty += qty;
    else matches.push({ slug: m.slug, printingId, collectorNumber: number, printingCode: code, qty, confidence: conf, read: c.read ?? '' });
  }
  return res.status(200).json({ matches, unmatched, unidentified: parsed.unidentified ?? 0, remaining, model: MODEL });
}
