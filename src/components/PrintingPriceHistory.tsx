import { useMemo, useState, type MouseEvent, type KeyboardEvent } from 'react';
import archiveJson from '../data/printing-price-history.json';
import { getCurrency, money } from '../lib/currency';
import { FX } from '../lib/data';
import { latestPriceSnapshot } from '../lib/priceSnapshots';
import { printingPriceHistory, type DailyPriceArchive, type HistoryBasis, type HistoryRange } from '../lib/printingPriceHistory';

const archive = archiveJson as unknown as DailyPriceArchive;
const dateLabel = (date: number | string, year = false) => new Date(date).toLocaleDateString('en-CA', {
  month: 'short', day: 'numeric', year: year ? 'numeric' : undefined, timeZone: 'UTC',
});

export default function PrintingPriceHistory({ id, basis: preferred }: { id: string; basis: HistoryBasis }) {
  const [activeDate, setActiveDate] = useState<string>();
  const [range, setRange] = useState<HistoryRange>('month');
  const [selectedBasis, setSelectedBasis] = useState<HistoryBasis>();
  const availability = useMemo(() => ({
    Market: printingPriceHistory(id, archive, latestPriceSnapshot, 'Market', 'all').points.length > 0,
    'Low listing': printingPriceHistory(id, archive, latestPriceSnapshot, 'Low listing', 'all').points.length > 0,
  }), [id]);
  const alternative = preferred === 'Market' ? 'Low listing' : 'Market';
  const basis = selectedBasis ?? (availability[preferred] || !availability[alternative] ? preferred : alternative);
  const series = useMemo(() => printingPriceHistory(id, archive, latestPriceSnapshot, basis, range), [id, basis, range]);
  const { points } = series;
  const activeIndex = points.findIndex((point) => point.date === activeDate);
  const currentIndex = activeIndex < 0 ? points.length - 1 : activeIndex;
  const active = points[currentIndex];
  const currency = getCurrency();
  const price = (cents: number) => money(cents * FX / 100, currency);
  const values = points.map(({ cents }) => cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max(1, (max - min) * 0.16, max * 0.03);
  const lower = Math.max(0, min - margin);
  const upper = max + margin;
  const positioned = points.map((point) => ({
    ...point,
    x: 4 + 92 * (point.time - series.start) / Math.max(1, series.end - series.start),
    y: 100 - (point.cents - lower) / (upper - lower) * 100,
  }));
  const activePoint = positioned[currentIndex];
  const path = positioned.map((point) => `${point.connect ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
  const pickPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (event.detail === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const distance = (point: typeof positioned[number]) =>
      Math.hypot(event.clientX - box.left - point.x * box.width / 100, event.clientY - box.top - point.y * box.height / 100);
    setActiveDate(positioned.reduce((best, point) => distance(point) < distance(best) ? point : best).date);
  };
  const browsePoints = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = event.key === 'ArrowLeft' ? currentIndex - 1 : event.key === 'ArrowRight' ? currentIndex + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : null;
    if (move === null) return;
    event.preventDefault();
    setActiveDate(points[Math.min(points.length - 1, Math.max(0, move))].date);
  };

  return (
    <section className="card-drawer-history" aria-label="Price history">
      <header className="card-drawer-section-head">
        <h3>Price History</h3>
        <select aria-label="Price history range" value={range} onChange={(event) => {
          setRange(event.target.value as HistoryRange); setActiveDate(undefined);
        }}>
          <option value="month">30 days</option>
          <option value="all">All time</option>
        </select>
      </header>
      <div className="card-drawer-history-body">
        <div className="card-drawer-history-basis">
          {availability.Market && availability['Low listing'] ? (
            <select aria-label="Historical price basis" value={basis} onChange={(event) => {
              setSelectedBasis(event.target.value as HistoryBasis); setActiveDate(undefined);
            }}>
              <option>Market</option>
              <option>Low listing</option>
            </select>
          ) : basis} · {currency}{currency === 'CAD' && ' · Current exchange rate'}
        </div>
        {points.length < 2 ? (
          <div className="card-drawer-history-empty">
            <strong>{active ? 'Not enough price history' : 'Price history unavailable'}</strong>
            {active && <span>{dateLabel(active.date, range === 'all')} · {price(active.cents)}</span>}
            {!active && range === 'month' && availability[basis] && <span>Earlier prices are available under All time.</span>}
          </div>
        ) : (
          <>
            <p className="card-drawer-history-active" aria-live="polite">
              {dateLabel(active.date, range === 'all')} <strong>{price(active.cents)}</strong>
            </p>
            <div className="card-drawer-chart">
              <div className="card-drawer-chart-scale" aria-hidden="true">
                {[upper, (lower + upper) / 2, lower].map((value) => <span key={value}>{price(value)}</span>)}
              </div>
              <div className="card-drawer-plot" role="group" aria-label="Price observations" onClick={pickPoint}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path className="card-drawer-chart-grid" vectorEffect="non-scaling-stroke" d="M0 0H100 M0 50H100 M0 100H100" />
                  <path className="card-drawer-chart-line" vectorEffect="non-scaling-stroke" d={path} />
                  {positioned.map(({ date, x, y }, index) => (
                    !positioned[index].connect && !positioned[index + 1]?.connect
                      ? <circle key={date} className="card-drawer-chart-dot" cx={x} cy={y} r=".7" />
                      : null
                  ))}
                </svg>
                <button type="button" className="card-drawer-chart-point" aria-pressed="true"
                  style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
                  aria-label={`${dateLabel(active.date, true)}, ${price(active.cents)} ${currency}. Use arrow keys to inspect observations.`}
                  onKeyDown={browsePoints} />
              </div>
              <div className="card-drawer-chart-axis" aria-hidden="true">
                <span>{dateLabel(series.start, range === 'all')}</span><span>{dateLabel(series.end, range === 'all')}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
