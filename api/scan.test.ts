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
