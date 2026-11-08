import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sample from '../public/imports/levi-collection.json';
import { autobuild } from '../src/lib/autobuild';
import { validateDeck } from './_deckrules';

const owned: Record<string, number> = {};
for (const e of sample.entries) owned[e.slug] = (owned[e.slug] ?? 0) + e.qty;
const built = autobuild(new Map(Object.entries(owned)));
if (!built.ok) throw new Error('no build');
const base = built.builds[0];

type Res = { code: number; body: Record<string, unknown> };
const mkRes = () => {
  const r: Res & { status: (c: number) => typeof r; json: (b: Record<string, unknown>) => typeof r } = {
    code: 0, body: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return r;
};
const req = (over: Record<string, unknown> = {}, auth = 'Bearer good') => ({
  method: 'POST',
  headers: { authorization: auth },
  body: { legends: base.legends, baseline: base.cards, owned, style: 'balanced', ...over },
});

function mockFetch(opts: { email?: string; used?: number; model?: string; modelStatus?: number }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push(url);
    if (url.endsWith('/auth/v1/user'))
      return new Response(JSON.stringify(opts.email ? { id: 'u1', email: opts.email } : {}), { status: opts.email ? 200 : 401 });
    if (url.includes('/rpc/bump_ai_usage')) return new Response(String(opts.used ?? 1), { status: 200 });
    if (url.includes('openrouter.ai')) {
      expect(JSON.parse(init!.body!).model).toBe('anthropic/claude-sonnet-5.5');
      return new Response(JSON.stringify({ choices: [{ message: { content: opts.model ?? '{}' } }] }), { status: opts.modelStatus ?? 200 });
    }
    throw new Error('unexpected ' + url);
  }));
  return calls;
}

async function load() {
  vi.resetModules();
  return (await import('./refine-deck')).default;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'k';
  process.env.SUPABASE_URL = 'https://sb.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
  process.env.UNLIMITED_EMAILS = 'boss@example.com';
  process.env.DECK_DAILY_LIMIT = '3';
  delete process.env.DECK_MODEL;
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/refine-deck', () => {
  it('requires sign-in', async () => {
    mockFetch({});
    const res = mkRes();
    await (await load())(req({}, '') as never, res as never);
    expect(res.code).toBe(401);
  });
  it('enforces the daily limit', async () => {
    mockFetch({ email: 'someone@example.com', used: 4 });
    const res = mkRes();
    await (await load())(req() as never, res as never);
    expect(res.code).toBe(429);
  });
  it('lets UNLIMITED_EMAILS skip the counter entirely', async () => {
    const calls = mockFetch({ email: 'Boss@Example.com', model: JSON.stringify({ deck: [], summary: 'ok' }) });
    const res = mkRes();
    await (await load())(req() as never, res as never);
    expect(res.code).toBe(200);
    expect(res.body.unlimited).toBe(true);
    expect(calls.some((c) => c.includes('bump_ai_usage'))).toBe(false);
  });
  it('rejects an illegal baseline before spending anything', async () => {
    const calls = mockFetch({ email: 'someone@example.com' });
    const res = mkRes();
    await (await load())(req({ baseline: { 'psycho-squad': 3 } }) as never, res as never);
    expect(res.code).toBe(400);
    expect(calls.length).toBe(0);
  });
  it('repairs a sloppy model answer into a legal deck and filters buy suggestions', async () => {
    const answer = 'Sure! ```json\n' + JSON.stringify({
      deck: [{ name: 'Psycho Squad', qty: 3 }, { name: 'Fake Card', qty: 2 }, { name: 'Towerfall', qty: 3 }],
      swaps: [{ out: 'Secondhand Bombus', in: 'Psycho Squad', why: 'bigger body' }],
      summary: 'Blue tempo — with draw.',
      plan: ['a', 'b'],
      mulligan: 'keep two units',
      buy: [{ name: 'Towerfall', why: 'sweeper' }, { name: 'Animals Wrecker', why: 'off colour' }, { name: 'Nope', why: 'x' }],
    }) + '\n```';
    mockFetch({ email: 'someone@example.com', used: 1, model: answer });
    const res = mkRes();
    await (await load())(req() as never, res as never);
    expect(res.code).toBe(200);
    const cards = res.body.cards as Record<string, number>;
    expect(validateDeck(base.legends, cards)).toEqual([]);
    expect(cards['towerfall']).toBeUndefined(); // not owned, so it can't be in the deck...
    expect((res.body.buy as { slug: string }[]).map((b) => b.slug)).toEqual(['towerfall']); // ...but it can be a buy suggestion
    expect(res.body.summary).not.toContain('—');
    expect(res.body.remaining).toBe(2);
  });
  it('surfaces model errors without returning a deck', async () => {
    mockFetch({ email: 'someone@example.com', used: 1, model: '{}', modelStatus: 500 });
    const res = mkRes();
    await (await load())(req() as never, res as never);
    expect(res.code).toBe(502);
    expect(res.body.cards).toBeUndefined();
  });
});
