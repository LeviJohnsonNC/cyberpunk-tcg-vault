import { useState } from 'react';
import { imageUrl, textSegments, type Card } from '../lib/data';

export const CARD_BACK = '/img/card-back.webp';

export function CardImg({ slug, alt, className }: { slug: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  // Card back shows while art loads and if it fails, so there's never a blank rectangle.
  return (
    <img
      className={`${className ?? ''} card-art`}
      src={err ? CARD_BACK : imageUrl(slug)}
      alt={err && alt ? `${alt} (art unavailable)` : alt}
      loading="lazy"
      onError={() => setErr(true)}
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
