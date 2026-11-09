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
type Lookup = { promise: Promise<Map<string, string>>; start: () => void; priority: boolean };
const pending = new Map<string, Lookup>();
const queued: Lookup[] = [];
const maxRequests = 6;
const maxPrefetchRequests = 4;
let active = 0;

function startQueuedLookups() {
  while (queued.length && active < maxRequests) {
    const priority = queued.findIndex((lookup) => lookup.priority);
    if (priority === -1 && active >= maxPrefetchRequests) return;
    const [lookup] = queued.splice(Math.max(0, priority), 1);
    lookup.start();
  }
}

/** A pocket that becomes visible can move ahead of the remaining lookahead work. */
export function prioritizePrintingArt(slug: string) {
  const lookup = pending.get(slug);
  if (!lookup || lookup.priority) return;
  lookup.priority = true;
  startQueuedLookups();
}

/** Share lookups across pockets and the drawer, including while a lookup is still in flight. */
export async function getPrintingArt(slug: string, printingId: string, prioritize = false): Promise<string | null> {
  const cached = cache.get(slug);
  const url = cached?.images.get(printingId);
  if (cached && Date.now() - cached.checkedAt < 240_000 && (!url || !artNeedsRefresh(url))) return url ?? null;

  let lookup = pending.get(slug);
  if (!lookup) {
    let start!: () => void;
    const promise = new Promise<Map<string, string>>((resolve, reject) => {
      start = () => {
        active += 1;
        void fetchPrintingArt(slug, AbortSignal.timeout(8000)).then((images) => {
          cache.set(slug, { images, checkedAt: Date.now() });
          resolve(images);
        }, reject).finally(() => {
          pending.delete(slug);
          active -= 1;
          startQueuedLookups();
        });
      };
    });
    lookup = { promise, start, priority: prioritize };
    pending.set(slug, lookup);
    queued.push(lookup);
    startQueuedLookups();
  } else if (prioritize) {
    prioritizePrintingArt(slug);
  }
  return (await lookup.promise).get(printingId) ?? null;
}
