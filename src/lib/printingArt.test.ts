import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETDECK_CARDS, artNeedsRefresh, fetchPrintingArt, getPrintingArt, prioritizePrintingArt } from './printingArt';

afterEach(() => vi.unstubAllGlobals());

describe('printing artwork', () => {
  it('uses each exact printing image and never falls back to the card-level image', async () => {
    const retail = 'https://art.example/retail.webp?Expires=1794231710&Signature=abc';
    const alt = 'https://art.example/alt.webp?Expires=1794231710&Signature=def';
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      image_url: retail,
      printings: [
        { id: 'retail', image_url: retail },
        { id: 'alt', image_url: alt },
        { id: 'missing', source_image_url: 'https://art.example/unsigned.webp' },
        { id: 'invalid', image_url: 'http://art.example/insecure.webp' },
      ],
    })));
    vi.stubGlobal('fetch', fetch);

    const { signal } = new AbortController();
    expect(await fetchPrintingArt('v-streetkid', signal)).toEqual(new Map([['retail', retail], ['alt', alt]]));
    expect(fetch).toHaveBeenCalledWith(`${NETDECK_CARDS}/v-streetkid`, { cache: 'no-store', signal });
  });

  it('refreshes before a signed URL expires', () => {
    const signed = 'https://art.example/card.webp?Expires=1794231710';
    const expiry = 1794231710 * 1000;
    expect(artNeedsRefresh(signed, expiry - 60_000)).toBe(false);
    expect(artNeedsRefresh(signed, expiry - 10_000)).toBe(true);
    expect(artNeedsRefresh('https://art.example/card.webp', expiry)).toBe(false);
  });

  it('caps concurrent lookups and shares in-flight and cached art across printings', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((resolve) => responses.push(resolve)));
    vi.stubGlobal('fetch', fetch);
    const lookups = Array.from({ length: 5 }, (_, i) => getPrintingArt(`queue-test-${i}`, 'retail'));
    const alt = getPrintingArt('queue-test-0', 'alt', true);
    expect(fetch).toHaveBeenCalledTimes(4);

    const reply = () => new Response(JSON.stringify({ printings: [
      { id: 'retail', image_url: 'https://art.example/retail.webp' },
      { id: 'alt', image_url: 'https://art.example/alt.webp' },
    ] }));
    responses[0](reply());
    await expect(alt).resolves.toBe('https://art.example/alt.webp');
    await expect(getPrintingArt('queue-test-0', 'retail')).resolves.toBe('https://art.example/retail.webp');
    expect(fetch).toHaveBeenCalledTimes(5);
    responses.slice(1).forEach((respond) => respond(reply()));
    await Promise.all(lookups);
  });

  it('starts a whole visible row ahead of queued lookahead without losing the request cap', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetch = vi.fn((_url: string) => new Promise<Response>((resolve) => responses.push(resolve)));
    vi.stubGlobal('fetch', fetch);
    const lookups = Array.from({ length: 7 }, (_, i) => getPrintingArt(`lookahead-${i}`, 'retail'));
    expect(fetch).toHaveBeenCalledTimes(4);

    prioritizePrintingArt('lookahead-6');
    prioritizePrintingArt('lookahead-5');
    prioritizePrintingArt('lookahead-4');
    expect(fetch.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual([
      'lookahead-0', 'lookahead-1', 'lookahead-2', 'lookahead-3', 'lookahead-6', 'lookahead-5',
    ]);

    const reply = () => new Response(JSON.stringify({ printings: [{ id: 'retail', image_url: 'https://art.example/retail.webp' }] }));
    responses[0](reply());
    await lookups[0];
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(`${NETDECK_CARDS}/lookahead-4`);
    responses.slice(1).forEach((respond) => respond(reply()));
    await expect(Promise.all(lookups)).resolves.toEqual(Array(7).fill('https://art.example/retail.webp'));
  });
});
