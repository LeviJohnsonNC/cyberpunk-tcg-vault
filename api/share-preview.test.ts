import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { fetchDeck, previewText, renderPreview } from './share-preview';
import { CARD } from './_deckrules';

const legend = [...CARD.values()].find((c) => c.type === 'Legend')!;
const token = 'a'.repeat(32);
const deck = { name: '<b>Heist</b> & "friends"', legends: [legend.slug, 'unknown-legend'], cards: { x: 3, y: 2 }, sideboard: { z: 1 } };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

describe('share preview', () => {
  it('describes the deck without leaking anything but the list', () => {
    const t = previewText(deck);
    expect(t.title).toContain('Heist');
    expect(t.description).toContain(legend.name);
    expect(t.description).toContain('5 card main deck, 1 card sideboard');
    expect(t.description).not.toContain('unknown-legend');
  });

  it('escapes the deck name and redirects to the reader', () => {
    const html = renderPreview(token, deck, 'https://x.test');
    expect(html).not.toContain('<b>Heist</b>');
    expect(html).toContain('&lt;b&gt;Heist&lt;/b&gt; &amp; &quot;friends&quot;');
    expect(html).toContain(`url=/#/shared?deck=${token}`);
    expect(html).toContain('og:image" content="https://x.test/og.jpg"');
  });

  it('calls only get_shared_deck, and ignores malformed tokens', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const f = vi.fn(async () => new Response(JSON.stringify([deck]), { status: 200 }));
    expect(await fetchDeck(token, f as unknown as typeof fetch)).toEqual(deck);
    expect(f).toHaveBeenCalledWith('https://sb.test/rest/v1/rpc/get_shared_deck', expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_token: token }) }));
    expect(await fetchDeck('../../decks', f as unknown as typeof fetch)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('serves a 404 preview for a revoked link', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_ANON_KEY = 'anon';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const sent: { status?: number; body?: string; headers: Record<string, string> } = { headers: {} };
    const res = {
      setHeader: (k: string, v: string) => { sent.headers[k] = v; },
      status(n: number) { sent.status = n; return this; },
      send(b: string) { sent.body = b; },
    };
    await handler({ query: { token } } as never, res as never);
    expect(sent.status).toBe(404);
    expect(sent.body).toContain('not found');
    expect(sent.headers['Cache-Control']).toMatch(/s-maxage=60/);
  });
});
