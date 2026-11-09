import { useEffect, useRef, useState } from 'react';
import { artNeedsRefresh, fetchPrintingArt } from '../lib/printingArt';
import { CARD_BACK } from './bits';

export function PrintingArt({ slug, printingId, alt }: { slug: string; printingId: string; alt: string }) {
  const cache = useRef<Map<string, string> | null>(null);
  const [art, setArt] = useState<{ printingId: string; src: string | null }>();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const cached = cache.current;
      const cachedArt = cached?.get(printingId);
      if (cached && (!cachedArt || !artNeedsRefresh(cachedArt))) return cached;
      return fetchPrintingArt(slug, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
    }
    void load().then((images) => {
      if (controller.signal.aborted) return;
      cache.current = images;
      setArt({ printingId, src: images.get(printingId) ?? null });
    }, () => {
      if (!controller.signal.aborted) setArt({ printingId, src: null });
    });
    return () => controller.abort();
  }, [slug, printingId]);

  const loading = art?.printingId !== printingId;
  const src = loading ? null : art.src;
  return (
    <figure className="drawer-printing-art">
      <img
        key={src ?? 'card-back'}
        className="card-art"
        src={src ?? CARD_BACK}
        alt={src ? alt : ''}
        referrerPolicy="no-referrer"
        onError={src ? () => setArt({ printingId, src: null }) : undefined}
      />
      <figcaption className="tiny muted" role="status">
        {loading ? 'Loading printing art…' : !src ? 'Art unavailable for this printing' : ''}
      </figcaption>
    </figure>
  );
}
