import { afterEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uses a single-card prompt for a live frame and preserves batch photo scans', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  const provider = vi.fn(async (_url: string, init: RequestInit) => {
    const prompt = JSON.parse(String(init.body)).messages[0].content[0].text;
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      cards: [{ name: 'Floor It', count: prompt.includes('Count EVERY') ? 3 : 1, confidence: 0.95 }], unidentified: 0,
    }) } }] });
  });
  vi.stubGlobal('fetch', provider);
  const { default: handler } = await import('./scan');
  const request = (mode?: string) => ({ method: 'POST', body: { image: 'data:image/jpeg;base64,AAAA', mode }, headers: {} }) as VercelRequest;
  const json = vi.fn();
  const response = { status: vi.fn().mockReturnValue({ json }) } as unknown as VercelResponse;

  await handler(request('single'), response);
  expect(JSON.parse(String(provider.mock.calls[0][1].body)).messages[0].content[0].text).toContain('cropped camera frame');
  expect(json.mock.calls[0][0].matches).toMatchObject([{ slug: 'floor-it', qty: 1 }]);
  await handler(request(), response);
  expect(json.mock.calls[1][0].matches).toMatchObject([{ slug: 'floor-it', qty: 3 }]);
});

it('uses the collector number to identify Towerfall in a live scan and saves the exact printing', async () => {
  const { matches } = await scan([{ name: 'Towerfall', collector_number: '167', confidence: 0.99 }], 'single');
  expect(matches).toMatchObject([{ slug: 'towerfall', printingId: 'b4ff8d51-99e1-4d6f-b8b7-c98d59283400', qty: 1 }]);
  const { normalizePrinting } = await import('../src/lib/data');
  const { mergeEntries } = await import('../src/lib/store');
  const entries = matches.map(({ slug, printingId, qty }) => ({ slug, printingId: normalizePrinting(slug, printingId), qty }));
  const standard = { slug: 'towerfall', printingId: '15920617-a06f-4302-9dfb-c85d3470c7eb', qty: 1 };
  expect(mergeEntries([standard], entries, 'add')).toEqual([standard, ...entries]);
});

it('keeps regular, Iconic, Beta Iconic and unreadable Towerfall copies separate in a photo', async () => {
  const { matches } = await scan([
    { name: 'Towerfall', collector_number: '138', count: 2 },
    { name: 'Towerfall', collector_number: '#167', count: 1 },
    { name: 'Towerfall', collector_number: 'β167', count: 1 },
    { name: 'Towerfall', collector_number: 'beta 167', count: 1 },
    { name: 'Towerfall', collector_number: null, count: 1 },
  ]);
  expect(matches).toMatchObject([
    { printingId: '15920617-a06f-4302-9dfb-c85d3470c7eb', qty: 2 },
    { printingId: 'b4ff8d51-99e1-4d6f-b8b7-c98d59283400', qty: 1 },
    { printingId: '4d8a1ccb-6d46-45b1-839a-fd3b7fa84b72', qty: 2 },
    { printingId: null, qty: 1 },
  ]);
});

it('leaves colliding or contradictory markings unspecified and recognizes an explicit Judge printing', async () => {
  const { matches } = await scan([
    { name: 'Adam Smasher: Ender of Legends', collector_number: '001' },
    { name: 'Adam Smasher: Ender of Legends', collector_number: '001', printing_set: 'Welcome to Night City — Retail' },
    { name: 'Towerfall', collector_number: '167', printing_set: 'Welcome to Night City — Beta' },
    { name: 'Towerfall', collector_number: '16?' },
    { name: 'Secondhand Bombus', collector_number: '001', printing_set: 'Judge Promos' },
  ]);
  expect(matches).toMatchObject([
    { slug: 'adam-smasher-ender-of-legends', printingId: null, qty: 1 },
    { slug: 'adam-smasher-ender-of-legends', printingId: expect.any(String), qty: 1 },
    { slug: 'towerfall', printingId: null, qty: 2 },
    { slug: 'secondhand-bombus', printingId: '534faf6c-78ff-4256-8c1b-a77438b7f979', qty: 1 },
  ]);
});

async function scan(cards: { name: string; collector_number?: string | null; printing_set?: string; confidence?: number; count?: number }[], mode?: 'single') {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    choices: [{ message: { content: JSON.stringify({ cards, unidentified: 0 }) } }],
  })));
  const { default: handler } = await import('./scan');
  const req = { method: 'POST', body: { image: 'data:image/jpeg;base64,AAAA', mode }, headers: {} } as VercelRequest;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  await handler(req, { status } as unknown as VercelResponse);
  expect(status).toHaveBeenCalledWith(200);
  return json.mock.calls[0][0] as { matches: { slug: string; printingId: string | null; qty: number }[] };
}
