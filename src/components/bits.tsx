import { useEffect, useRef, useState } from 'react';
import { imageUrl, textSegments, type Card } from '../lib/data';

import cardBack from '../assets/card-back.webp';

export const CARD_BACK = cardBack;

// Reserve priority for the small group of cards a player is about to see.
const visibleImages = new WeakMap<Element, () => void>();
let imageObserver: IntersectionObserver | undefined;

export function CardImg({ slug, alt, className, priority = false }: { slug: string; alt: string; className?: string; priority?: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    const node = image.current;
    if (!priority || near || !node || typeof IntersectionObserver === 'undefined') return;
    imageObserver ??= new IntersectionObserver((items, observer) => {
      for (const item of items) {
        if (!item.isIntersecting) continue;
        observer.unobserve(item.target);
        visibleImages.get(item.target)?.();
      }
    }, { rootMargin: '160px 0px' });
    visibleImages.set(node, () => setNear(true));
    imageObserver.observe(node);
    return () => {
      imageObserver?.unobserve(node);
      visibleImages.delete(node);
    };
  }, [priority, near]);

  const useBack = failed === slug || (priority && !near);
  return (
    <img
      ref={image}
      className={`${className ?? ''} card-art`}
      src={useBack ? CARD_BACK : imageUrl(slug)}
      alt={failed === slug && alt ? `${alt} (art unavailable)` : alt}
      loading={priority && near ? 'eager' : 'lazy'}
      fetchPriority={priority && near ? 'high' : undefined}
      decoding="async"
      onError={useBack ? undefined : () => setFailed(slug)}
    />
  );
}

export function Rules({ text }: { text: string }) {
  return (
    <>
      {textSegments(text).map((s, i) =>
        s.kw ? (
          <span key={i} className={`kw ${s.kw.replace(/\s/g, '')}`}>{s.kw}</span>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
    </>
  );
}

export function Pip({ color, bare }: { color: string; bare?: boolean }) {
  return <span className={`pip ${color}`} title={color}>{bare ? null : color}</span>;
}

export function RarityBadge({ r }: { r: string }) {
  const cls = r.startsWith('Iconic') ? 'Iconic' : r.replace(/\s/g, '');
  return <span className={`badge r-${cls}`}>{r}</span>;
}

export function statsLine(c: Card) {
  const parts: string[] = [];
  if (c.cost != null) parts.push(`${c.cost} €$`);
  if (c.power != null && c.type !== 'Gear') parts.push(`${c.power} PWR`);
  if (c.type === 'Gear' && c.power != null) parts.push(`+${c.power} PWR`);
  if (c.ram != null) parts.push(`RAM ${c.ram}`);
  return parts.join(' · ');
}

export function Bars({ data, tone }: { data: { label: string; value: number }[]; tone?: 'red' | 'cyan' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar" key={d.label}>
          <span className="val">{d.value || ''}</span>
          <div className={`fill ${tone ?? ''}`} style={{ height: `${(d.value / max) * 85}%` }} />
          <span className="lbl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
