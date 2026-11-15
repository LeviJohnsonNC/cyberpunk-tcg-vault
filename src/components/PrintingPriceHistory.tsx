import { useState, type MouseEvent } from 'react';
import { getCurrency, money } from '../lib/currency';
import { FX } from '../lib/data';
import { latestPriceSnapshot, weeklyPriceSnapshots } from '../lib/priceSnapshots';
import { printingPriceHistory, type HistoryBasis } from '../lib/printingPriceHistory';

const dateLabel = (date: number | string) => new Date(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function PrintingPriceHistory({ id, basis }: { id: string; basis: HistoryBasis }) {
  const [activeDate, setActiveDate] = useState<string>();
  const series = printingPriceHistory(id, weeklyPriceSnapshots, latestPriceSnapshot, basis);
  const { points } = series;
  const active = points.find((point) => point.date === activeDate) ?? points.at(-1);
  const currency = getCurrency();
  const price = (cents: number) => money(cents * FX / 100, currency);
  const values = points.map(({ cents }) => cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max(1, (max - min) * 0.16, max * 0.03);
  const lower = Math.max(0, min - margin);
  const upper = max + margin;
  const positioned = points.map((p) => ({
    ...p,
    x: 4 + 92 * (p.time - series.start) / (series.end - series.start),
    y: 100 - (p.cents - lower) / (upper - lower) * 100,
  }));
  const path = positioned.map((point) => `${point.connect ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
  const pickPoint = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const distance = (p: typeof positioned[number]) =>
      Math.hypot(event.clientX - box.left - (p.x * box.width / 100), event.clientY - box.top - (p.y * box.height / 100));
    const nearest = positioned.reduce((best, point) => distance(point) < distance(best) ? point : best);
    setActiveDate(nearest.date);
  };

  return (
    <section className="card-drawer-history" aria-label="Price history">
      <header className="card-drawer-section-head"><h3>Price History</h3><span>30 days</span></header>
      <div className="card-drawer-history-body">
        <div className="card-drawer-history-basis">{basis} · {currency}{currency === 'CAD' && ' · Current exchange rate'}</div>
        {points.length < 2 ? (
          <div className="card-drawer-history-empty">
            <strong>{active ? 'Not enough price history' : 'Price history unavailable'}</strong>
            {active && <span>{dateLabel(active.date)} · {price(active.cents)}</span>}
          </div>
        ) : (
          <>
            <p className="card-drawer-history-active" aria-live="polite">
              {dateLabel(active!.date)} <strong>{price(active!.cents)}</strong>
            </p>
            <div className="card-drawer-chart">
              <div className="card-drawer-chart-scale" aria-hidden="true">
                {[upper, (lower + upper) / 2, lower].map((value) => <span key={value}>{price(value)}</span>)}
              </div>
              <div className="card-drawer-plot" role="group" aria-label="Price observations" onClick={pickPoint}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path className="card-drawer-chart-grid" vectorEffect="non-scaling-stroke" d="M0 0H100 M0 50H100 M0 100H100" />
                  <path className="card-drawer-chart-line" vectorEffect="non-scaling-stroke" d={path} />
                </svg>
                {positioned.map(({ date, cents, x, y }) => <button type="button" key={date}
                  className="card-drawer-chart-point" style={{ left: `${x}%`, top: `${y}%` }}
                  aria-pressed={active?.date === date}
                  aria-label={`${dateLabel(date)}, ${price(cents)} ${currency}`}
                  onFocus={() => setActiveDate(date)}
                  onClick={(event) => {
                    if (event.detail !== 0) return; // Pointer input uses nearest-point selection.
                    event.stopPropagation();
                    setActiveDate(date);
                  }}
                />)}
              </div>
              <div className="card-drawer-chart-axis" aria-hidden="true"><span>{dateLabel(series.start)}</span><span>{dateLabel(series.end)}</span></div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
