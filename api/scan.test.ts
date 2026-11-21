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
  const image = 'data:image/jpeg;base64,AAAA';
  const request = (mode?: string, detailImages?: string[]) => ({ method: 'POST', body: { image, mode, detailImages }, headers: {} }) as VercelRequest;
  const json = vi.fn();
  const response = { status: vi.fn().mockReturnValue({ json }) } as unknown as VercelResponse;

  await handler(request('single'), response);
  expect(JSON.parse(String(provider.mock.calls[0][1].body)).messages[0].content[0].text).toContain('cropped camera frame');
  expect(json.mock.calls[0][0].matches).toMatchObject([{ slug: 'floor-it', qty: 1 }]);
  await handler(request(), response);
  expect(json.mock.calls[1][0].matches).toMatchObject([{ slug: 'floor-it', qty: 3 }]);

  const detailImages = ['AAAB', 'AAAC', 'AAAD', 'AAAE'].map((content) => `data:image/jpeg;base64,${content}`);
  await handler(request(undefined, detailImages), response);
  const parts = JSON.parse(String(provider.mock.calls[2][1].body)).messages[0].content;
  expect(parts[0].text).toContain('Never count the same card again');
  expect(parts[0].text).toContain('yellow diagonal collector-number tab');
  expect(parts.slice(1).map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual([image, ...detailImages]);
  expect(json.mock.calls[2][0].matches).toMatchObject([{ slug: 'floor-it', qty: 3 }]);

  await handler(request(undefined, detailImages.slice(0, 3)), response);
  expect(response.status).toHaveBeenLastCalledWith(400);
  expect(provider).toHaveBeenCalledTimes(3);

  provider.mockResolvedValueOnce(Response.json({ error: { message: 'This model does not support multiple images' } }, { status: 400 }));
  await handler(request(undefined, detailImages), response);
  expect(provider).toHaveBeenCalledTimes(5);
  expect(JSON.parse(String(provider.mock.calls[4][1].body)).messages[0].content).toHaveLength(2);
  expect(json.mock.lastCall?.[0].matches).toMatchObject([{ slug: 'floor-it', qty: 3 }]);
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
    { name: 'Towerfall', collector_number: 138, count: 2 },
    { name: 'Towerfall', collector_number: '#167', printing_code: 'MS01 - WNC [A]', count: 1 },
    { name: 'Towerfall', collector_number: 'B167', printing_code: 'MS01 - WNC [A]', count: 1 },
    { name: 'Towerfall', collector_number: 'beta 167', count: 1 },
    { name: 'Towerfall', collector_number: null, count: 1 },
  ]);
  expect(matches).toMatchObject([
    { printingId: '15920617-a06f-4302-9dfb-c85d3470c7eb', collectorNumber: '138', qty: 2 },
    { printingId: 'b4ff8d51-99e1-4d6f-b8b7-c98d59283400', collectorNumber: '167', printingCode: 'MS01-WNC', qty: 1 },
    { printingId: '4d8a1ccb-6d46-45b1-839a-fd3b7fa84b72', collectorNumber: 'β167', qty: 2 },
    { printingId: null, collectorNumber: null, qty: 1 },
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
    { slug: 'towerfall', printingId: null, collectorNumber: '167', qty: 1 },
    { slug: 'towerfall', printingId: null, collectorNumber: null, qty: 1 },
    { slug: 'secondhand-bombus', printingId: '534faf6c-78ff-4256-8c1b-a77438b7f979', qty: 1 },
  ]);
});

it('distinguishes the same collector number using the set code printed on the card', async () => {
  const { matches } = await scan([
    { name: 'Adam Smasher: Ender of Legends', collector_number: '001', printing_code: 'MS01 - WNC [A]' },
    { name: 'Adam Smasher: Ender of Legends', collector_number: '001', printing_code: 'PRR02 – WNC' },
    { name: 'Adam Smasher: Ender of Legends', collector_number: '001', printing_code: 'prr01 wnc' },
    { name: 'Secondhand Bombus', collector_number: '005', printing_code: 'SD01-HEI [A]' },
    { name: 'Secondhand Bombus', collector_number: '005', printing_code: 'NCB01 - WNC' },
    { name: 'Secondhand Bombus', collector_number: '005', printing_code: 'JDG - WNC' },
    { name: 'Secondhand Bombus', collector_number: '005' },
  ]);
  expect(matches.map(({ printingId }) => printingId)).toEqual([
    'a9c1137e-2e33-4293-9dcc-9351c9a0bbee', '3d5b7ebf-0378-401b-bfa2-32a02734c921', '10ca370b-deb7-4c58-a9f9-faf4f9708f6d',
    'b7d9313c-f2a4-40c0-85ed-81adb7653125', 'a78c25bb-94ce-4833-bcc4-be6dce72ecb1', null, null,
  ]);
  expect(matches.slice(-2)).toMatchObject([{ collectorNumber: '005', printingCode: 'JDG-WNC' }, { collectorNumber: '005', printingCode: null }]);
});

async function scan(cards: { name: string; collector_number?: string | number | null; printing_set?: string; printing_code?: string; confidence?: number; count?: number }[], mode?: 'single') {
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
