export const NETDECK_CARDS = 'https://api.netdeck.gg/api/cards/cyberpunk';

/** Netdeck signs CloudFront image URLs for only a few minutes. */
export function artNeedsRefresh(src: string, now = Date.now()): boolean {
  const expires = new URL(src).searchParams.get('Expires');
  return expires !== null && Number(expires) * 1000 <= now + 30_000;
}

export async function fetchPrintingArt(slug: string, signal: AbortSignal): Promise<Map<string, string>> {
  const response = await fetch(`${NETDECK_CARDS}/${encodeURIComponent(slug)}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Card artwork lookup failed (${response.status})`);
  const data: { printings?: Array<{ id?: string; image_url?: string }> } = await response.json();
  const art = new Map<string, string>();
  for (const printing of data.printings ?? []) {
    if (typeof printing?.id !== 'string' || typeof printing.image_url !== 'string') continue;
    if (!URL.canParse(printing.image_url) || new URL(printing.image_url).protocol !== 'https:') continue;
    art.set(printing.id, printing.image_url);
  }
  return art;
}
