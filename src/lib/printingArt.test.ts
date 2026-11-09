import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETDECK_CARDS, artNeedsRefresh, fetchPrintingArt } from './printingArt';

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
});
