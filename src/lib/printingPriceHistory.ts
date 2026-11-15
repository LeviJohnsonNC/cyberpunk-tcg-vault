import type { PriceSnapshot } from './priceTrend';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const WEDNESDAY = Date.UTC(1970, 0, 7);

export type HistoryBasis = 'Market' | 'Low listing';

export function printingPriceHistory(id: string, history: PriceSnapshot[], latest: PriceSnapshot, basis: HistoryBasis) {
  const end = Date.parse(latest.date);
  const start = end - 30 * DAY;
  const slot = basis === 'Market' ? 0 : 1;
  // The current feed supersedes a saved observation from the same date.
  const snapshots = new Map([...history, latest].map((snapshot) => [snapshot.date, snapshot]));
  const points = [...snapshots.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(({ date, quotes }) => {
      const time = Date.parse(date);
      const cents = quotes[id]?.[slot];
      return time >= start && time <= end && cents != null && Number.isFinite(cents) && cents > 0
        ? [{ date, time, cents, week: Math.floor((time - WEDNESDAY) / WEEK) }]
        : [];
    });
  return {
    start,
    end,
    points: points.map((point, index) => ({
      ...point,
      connect: index > 0 && point.week - points[index - 1].week <= 1,
    })),
  };
}
