import { useMemo, useState } from 'react';
import history from '../data/price-history.json';
import { FX, PRICES } from '../lib/data';
import { money, type Currency } from '../lib/currency';
import type { Line } from '../lib/pricebook';
import { priceTrend, type PriceSnapshot } from '../lib/priceTrend';

const latest: PriceSnapshot = {
  date: PRICES.updatedAt.slice(0, 10),
  quotes: Object.fromEntries(Object.entries(PRICES.printings).map(([id, quote]) => [
    id, [quote.market === null ? null : Math.round(quote.market * 100), quote.low === null ? null : Math.round(quote.low * 100)],
  ])),
};
const snapshots = history.snapshots as unknown as PriceSnapshot[];
const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function PriceTrend({ lines, count, currency }: { lines: Line[]; count: number; currency: Currency }) {
  const series = useMemo(() => priceTrend(lines, snapshots, latest, PRICES.pairs), [lines]);
  const [activeDate, setActiveDate] = useState<string>();
  const quoted = series.points.filter(({ cents }) => cents !== null);
  const active = series.points.find(({ date }) => date === activeDate) ?? quoted.at(-1);
  const values = quoted.map(({ cents }) => cents!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max((max - min) * 0.14, 1);
  const timeSpan = Date.parse(series.end) - Date.parse(series.start);
  const x = (date: string) => 9 + (Date.parse(date) - Date.parse(series.start)) / timeSpan * 82;
  const y = (cents: number) => 100 - (cents - min + margin) / Math.max(max - min + 2 * margin, 1) * 100;
  const value = (cents: number) => money(cents * FX / 100, currency);
  const path = series.points.reduce((segments, point, index, all) => {
    if (point.cents === null) return segments;
    const command = index && all[index - 1].cents !== null ? 'L' : 'M';
    return `${segments}${command}${x(point.date)},${y(point.cents)} `;
  }, '');
  const { change } = series;
  const prefix = change && change.cents > 0 ? '+' : '';

  return <section className="pb-breakdown pb-trend" aria-labelledby="pb-trend-title">
    <header><h3 id="pb-trend-title">30-day price trend</h3><span className="pb-unit">{currency}</span></header>
    {!series.covered ? <p className="pb-trend-note">{count ? 'No comparable weekly prices for these holdings.' : 'No holdings to chart.'}</p> : <>
      <div className="pb-trend-summary">
        <span className="pb-trend-value num">{active?.cents != null ? value(active.cents) : 'No quote'}</span>
        {active && <span>{dateLabel(active.date)} · Comparable value</span>}
      </div>
      {change ? <p className="pb-trend-change num" data-direction={Math.sign(change.cents)}>
        {prefix}{value(change.cents)} ({prefix}{change.percent.toFixed(1)}%) <span>{dateLabel(change.from)}–{dateLabel(change.to)}</span>
      </p> : <p className="pb-trend-note">One observation. Change needs two comparable dates.</p>}
      <div className="pb-trend-chart">
      <div className="pb-trend-plot" role="group" aria-label="Weekly price points">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="pb-trend-grid" vectorEffect="non-scaling-stroke" d="M0 16H100 M0 50H100 M0 84H100" />
          <path className="pb-trend-line" vectorEffect="non-scaling-stroke" d={path} />
        </svg>
        {series.points.map(({ date, cents }) => <button key={date} type="button" className="pb-trend-point"
          style={{ left: `${x(date)}%`, top: `${cents === null ? 88 : y(cents)}%` }}
          data-missing={cents === null || undefined}
          aria-pressed={active?.date === date}
          aria-label={`${dateLabel(date)}, ${cents === null ? 'no quote' : `${value(cents)} ${currency}`}`}
          onFocus={() => setActiveDate(date)} onPointerEnter={(event) => { if (event.pointerType === 'mouse') setActiveDate(date); }}
          onClick={() => setActiveDate(date)} />)}
      </div>
      <div className="pb-trend-scale" aria-hidden="true">
        {[0.84, 0.5, 0.16].map((fraction) => <span key={fraction}>{value(min - margin + fraction * (max - min + 2 * margin))}</span>)}
      </div>
      </div>
      <div className="pb-trend-axis"><span>{dateLabel(series.start)}</span><span>{dateLabel(series.end)}</span></div>
      <p className="pb-trend-note">{series.covered} of {count} {count === 1 ? 'copy' : 'copies'} represented
        {series.proxies > 0 && ` · ${series.proxies} Beta ${series.proxies === 1 ? 'proxy' : 'proxies'}`}
        {series.listings > 0 && ` · ${series.listings} low ${series.listings === 1 ? 'listing' : 'listings'}`}</p>
      <details className="pb-disclosure pb-trend-method">
        <summary>How the trend is calculated</summary>
        <p>Uses today’s quantities and one consistent quote per printing. {currency === 'CAD' && 'CAD uses the same exchange rate for every date.'}</p>
      </details>
    </>}
  </section>;
}
