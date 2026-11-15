import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getPrintingArt, prioritizePrintingArt } from '../lib/printingArt';
import { isIconicPrinting, type FoilMode } from '../lib/iconicFoil';
import { IconicFoil } from './IconicFoil';
import { CARD_BACK } from './bits';

const artRequests = new WeakMap<Element, (visible: boolean) => void>();
let lookahead: IntersectionObserver | undefined;
let viewport: IntersectionObserver | undefined;

function artObserver(visible: boolean) {
  return new IntersectionObserver((items, observer) => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      observer.unobserve(item.target);
      if (visible) lookahead?.unobserve(item.target);
      artRequests.get(item.target)?.(visible);
    }
  }, { rootMargin: visible ? '0px' : '640px 0px' });
}

function observeArt(element: Element, load: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    load(true);
    return;
  }
  viewport ??= artObserver(true);
  lookahead ??= artObserver(false);
  artRequests.set(element, load);
  viewport.observe(element);
  lookahead.observe(element);
  return () => {
    viewport?.unobserve(element);
    lookahead?.unobserve(element);
    artRequests.delete(element);
  };
}

export function PrintingArt({ slug, printingId, alt, pocket = false, inline = false, foil = 'compact', fallback, placeholder, onReady }: { slug: string; printingId: string; alt: string; pocket?: boolean; inline?: boolean; foil?: FoilMode; fallback?: ReactNode; placeholder?: string; onReady?: (src: string) => void }) {
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState<{ printingId: string; src: string }>();
  const [art, setArt] = useState<{ printingId: string; src: string | null }>();

  useEffect(() => {
    let current = true;
    let started = false;
    const node = image.current;
    if (node) node.fetchPriority = 'auto';
    const load = (visible: boolean) => {
      if (visible && node) node.fetchPriority = 'high';
      if (started) {
        if (visible) prioritizePrintingArt(slug);
        return;
      }
      started = true;
      void getPrintingArt(slug, printingId, visible).then(
        (src) => { if (current) setArt({ printingId, src }); },
        () => { if (current) setArt({ printingId, src: null }); },
      );
    };
    const stop = pocket && node ? observeArt(node, load) : (load(true), undefined);
    return () => {
      current = false;
      stop?.();
    };
  }, [slug, printingId, pocket]);

  const loading = art?.printingId !== printingId;
  const src = loading ? null : art.src;
  const foilMode = foil !== 'off' && isIconicPrinting(printingId) ? foil : undefined;
  const loaded = !!src && ready?.printingId === printingId && ready.src === src;
  const surface = foilMode && loaded ? <IconicFoil mode={foilMode} /> : null;
  const foilClass = surface ? ' iconic-art' : '';
  const img = (
    <img
      key={printingId}
      ref={image}
      className={pocket ? 'binder-card-image' : 'card-art'}
      src={src ?? CARD_BACK}
      alt={src ? alt : ''}
      decoding="async"
      referrerPolicy="no-referrer"
      data-printing-loaded={inline && loaded ? true : undefined}
      hidden={!!placeholder && !loaded}
      onLoad={(inline || foilMode) && src ? ({ currentTarget }) => {
        if (currentTarget !== image.current || !currentTarget.naturalWidth || currentTarget.currentSrc !== currentTarget.src) return;
        if (currentTarget.getAttribute('src') !== src) return;
        setReady({ printingId, src });
        if (inline) onReady?.(src);
      } : undefined}
      onError={src ? ({ currentTarget }) => {
        if (currentTarget === image.current && currentTarget.getAttribute('src') === src) {
          setArt({ printingId, src: null });
        }
      } : undefined}
    />
  );
  if (inline && !loading && !src && fallback) return fallback;
  if (inline) return <span className={`printing-inline${foilClass}`} aria-busy={loading || (!!placeholder && !!src && !loaded)}>
    {img}
    {surface}
    {placeholder && !loaded && <span className="printing-placeholder">{placeholder}</span>}
    {!loading && !src && <small role="status">Printing art unavailable</small>}
  </span>;
  if (pocket) {
    return <span className={`binder-art-frame${foilClass}`}>{img}{surface}{!loading && !src && <span className="binder-art-status">Art unavailable</span>}</span>;
  }
  return (
    <figure className={`drawer-printing-art${foilMode === 'inspection' ? '' : foilClass}`}>
      {foilMode === 'inspection' ? <span className={`iconic-inspection-art${foilClass}`}>{img}{surface}</span> : <>{img}{surface}</>}
      <figcaption className="tiny muted" role="status">
        {loading ? 'Loading printing art…' : !src ? 'Art unavailable for this printing' : ''}
      </figcaption>
    </figure>
  );
}
