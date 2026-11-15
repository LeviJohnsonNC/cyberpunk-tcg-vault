import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { FX } from '../lib/data';
import { money, type Currency } from '../lib/currency';
import type { Line } from '../lib/pricebook';
import { dailyPriceArchive, latestPriceSnapshot } from '../lib/priceSnapshots';
import { priceTrend, priceTrendPaths } from '../lib/priceTrend';

const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const plotInset = 9;
const plotWidth = 100 - 2 * plotInset;

export default function PriceTrend({ lines, count, currency }: { lines: Line[]; count: number; currency: Currency }) {
  const { points, change, start, end } = useMemo(() => priceTrend(lines, dailyPriceArchive, latestPriceSnapshot), [lines]);
  const [activeDate, setActiveDate] = useState<string>();
  const heading = <header><h3 id="pb-trend-title">30-day price trend</h3><span className="pb-unit">{currency}</span></header>;
  const values = points.flatMap(({ cents }) => cents === null ? [] : [cents]);
  if (!values.length) return <section className="pb-breakdown pb-trend" aria-labelledby="pb-trend-title">
    {heading}
    <p className="pb-trend-note">{count ? 'No exact-printing market quotes in this window.' : 'No holdings to chart.'}</p>
  </section>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max((max - min) * 0.14, 1);
  const lower = Math.max(0, min - margin);
  const range = max + margin - lower;
  const lastIndex = points.length - 1;
  const positioned = points.map((point, index) => ({
    ...point,
    x: plotInset + index / lastIndex * plotWidth,
    y: point.cents === null ? 88 : 100 - (point.cents - lower) / range * 100,
  }));
  const selected = points.findIndex(({ date }) => date === activeDate);
  const activeIndex = selected < 0 ? lastIndex : selected;
  const active = positioned[activeIndex];
  const value = (cents: number) => money(cents * FX / 100, currency);
  const activeValue = active.cents === null ? 'No quote' : value(active.cents);
  const coverage = `${active.covered} of ${count} ${count === 1 ? 'copy' : 'copies'} with quotes`;
  const observed = positioned.filter(point => point.cents !== null);
  const paths = priceTrendPaths(observed);
  const dots = observed.map(({ x, y }) => `M${x},${y}h.01`).join(' ');
  const prefix = change && change.cents > 0 ? '+' : '';
  const selectPoint = (index: number) => setActiveDate(points[Math.min(lastIndex, Math.max(0, index))].date);
  const pickPoint = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * 100;
    selectPoint(Math.round((x - plotInset) / plotWidth * lastIndex));
  };
  const browsePoints = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = event.key === 'ArrowLeft' ? activeIndex - 1 : event.key === 'ArrowRight' ? activeIndex + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex : null;
    if (index === null) return;
    event.preventDefault();
    selectPoint(index);
  };

  return <section className="pb-breakdown pb-trend" aria-labelledby="pb-trend-title">
    {heading}
    <div aria-live="polite">
      <div className="pb-trend-summary">
        <span className="pb-trend-value num">{activeValue}</span>
        <span>{dateLabel(active.date)} · Exact market value</span>
      </div>
      <p className="pb-trend-note">{coverage}</p>
    </div>
    {change ? <p className="pb-trend-change num" data-direction={Math.sign(change.cents)}>
      {prefix}{value(change.cents)} ({prefix}{change.percent.toFixed(1)}%) <span>{dateLabel(change.from)}–{dateLabel(change.to)} · {change.covered} matching {change.covered === 1 ? 'copy' : 'copies'}</span>
    </p> : <p className="pb-trend-note">Change needs quotes for the same copies on two dates.</p>}
    <div className="pb-trend-chart">
      <div className="pb-trend-scale" aria-hidden="true">
        {[0.84, 0.5, 0.16].map((fraction) => <span key={fraction}>{value(lower + fraction * range)}</span>)}
      </div>
      <div className="pb-trend-plot" role="group" aria-label="Daily price observations"
        onClick={event => { if (event.detail) pickPoint(event); }}
        onPointerMove={event => { if (event.pointerType === 'mouse') pickPoint(event); }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="pb-trend-grid" vectorEffect="non-scaling-stroke" d="M0 16H100 M0 50H100 M0 84H100" />
          <path className="pb-trend-line" vectorEffect="non-scaling-stroke" d={paths.solid} />
          <path className="pb-trend-line pb-trend-bridge" vectorEffect="non-scaling-stroke" d={paths.dashed} />
          <path className="pb-trend-dots" vectorEffect="non-scaling-stroke" d={dots} />
        </svg>
        <button type="button" className="pb-trend-point" style={{ left: `${active.x}%`, top: `${active.y}%` }}
          data-missing={active.cents === null || undefined}
          aria-label={`${dateLabel(active.date)}, ${active.cents === null ? activeValue : `${activeValue} ${currency}`}, ${coverage}. Use arrow keys to browse dates.`}
          onKeyDown={browsePoints} />
      </div>
      <div className="pb-trend-axis"><span>{dateLabel(start)}</span><span>{dateLabel(end)}</span></div>
    </div>
    {paths.dashed && <p className="pb-trend-note pb-trend-key">Dashed where quote coverage changes or a day has no quotes.</p>}
    <details className="pb-disclosure pb-trend-method">
      <summary>How the trend is calculated</summary>
      <p>Each day uses market quotes for your exact printings and today’s quantities. A solid line joins consecutive days with quotes for the same copies. The percentage change compares only copies quoted on both dates.</p>
      <p>Total value can also include Beta estimates and low listings. {currency === 'CAD' && 'CAD uses the same exchange rate for every date.'}</p>
    </details>
  </section>;
}
