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

const cache = new Map<string, { images: Map<string, string>; checkedAt: number }>();
const pending = new Map<string, Promise<Map<string, string>>>();
const queued: Array<() => void> = [];
const maxRequests = 4;
let active = 0;

/** Share lookups across pockets and the drawer, including while a lookup is still in flight. */
export async function getPrintingArt(slug: string, printingId: string, prioritize = false): Promise<string | null> {
  const cached = cache.get(slug);
  const url = cached?.images.get(printingId);
  if (cached && Date.now() - cached.checkedAt < 240_000 && (!url || !artNeedsRefresh(url))) return url ?? null;

  let lookup = pending.get(slug);
  if (!lookup) {
    lookup = new Promise((resolve, reject) => {
      const start = () => {
        active += 1;
        void fetchPrintingArt(slug, AbortSignal.timeout(8000)).then((images) => {
          cache.set(slug, { images, checkedAt: Date.now() });
          resolve(images);
        }, reject).finally(() => {
          pending.delete(slug);
          active -= 1;
          queued.shift()?.();
        });
      };
      if (active < maxRequests) start();
      else if (prioritize) queued.unshift(start);
      else queued.push(start);
    });
    pending.set(slug, lookup);
  }
  return (await lookup).get(printingId) ?? null;
}
