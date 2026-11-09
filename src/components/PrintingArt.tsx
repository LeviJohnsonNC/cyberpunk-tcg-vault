import { useEffect, useRef, useState } from 'react';
import { getPrintingArt } from '../lib/printingArt';
import { CARD_BACK } from './bits';

const near = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | undefined;

function nearViewport(element: Element, enter: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    enter();
    return;
  }
  observer ??= new IntersectionObserver((items, observer) => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      observer.unobserve(item.target);
      near.get(item.target)?.();
      near.delete(item.target);
    }
  }, { rootMargin: '120px' });
  near.set(element, enter);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    near.delete(element);
  };
}

export function PrintingArt({ slug, printingId, alt, pocket = false }: { slug: string; printingId: string; alt: string; pocket?: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [art, setArt] = useState<{ printingId: string; src: string | null }>();

  useEffect(() => {
    let current = true;
    const load = () => {
      void getPrintingArt(slug, printingId, !pocket).then(
        (src) => { if (current) setArt({ printingId, src }); },
        () => { if (current) setArt({ printingId, src: null }); },
      );
    };
    const stop = pocket && image.current ? nearViewport(image.current, load) : (load(), undefined);
    return () => {
      current = false;
      stop?.();
    };
  }, [slug, printingId, pocket]);

  const loading = art?.printingId !== printingId;
  const src = loading ? null : art.src;
  const img = (
    <img
      ref={image}
      className={pocket ? 'binder-card-image' : 'card-art'}
      src={src ?? CARD_BACK}
      alt={src ? alt : ''}
      referrerPolicy="no-referrer"
      onError={src ? () => setArt({ printingId, src: null }) : undefined}
    />
  );
  if (pocket) {
    return <span className="binder-art-frame">{img}{!loading && !src && <span className="binder-art-status">Art unavailable</span>}</span>;
  }
  return (
    <figure className="drawer-printing-art">
      {img}
      <figcaption className="tiny muted" role="status">
        {loading ? 'Loading printing art…' : !src ? 'Art unavailable for this printing' : ''}
      </figcaption>
    </figure>
  );
}
