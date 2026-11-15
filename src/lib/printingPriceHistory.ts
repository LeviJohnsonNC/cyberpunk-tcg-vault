import type { DailyPriceArchive, PriceSnapshot } from './priceSnapshots';

const DAY = 86_400_000;

export type HistoryBasis = 'Market' | 'Low listing';
export type HistoryRange = 'month' | 'all';

export function printingPriceHistory(id: string, archive: DailyPriceArchive, latest: PriceSnapshot, basis: HistoryBasis, range: HistoryRange) {
  const slot = basis === 'Market' ? 1 : 2;
  const byDate = new Map<string, number>();
  for (const point of archive.quotes[id] ?? []) {
    const cents = point[slot];
    if (cents != null && cents > 0) byDate.set(archive.dates[point[0]], cents);
  }
  const current = latest.quotes[id]?.[slot - 1];
  if (current != null && current > 0) byDate.set(latest.date, current);

  const end = Date.parse(latest.date);
  const earliest = [...byDate.keys()].sort()[0];
  const monthStart = end - 30 * DAY;
  const start = range === 'all' && earliest ? Date.parse(earliest) : monthStart;
  const points = [...byDate.entries()].map(([date, cents]) => ({ date, time: Date.parse(date), cents }))
    .filter((point) => point.time >= start && point.time <= end)
    .sort((a, b) => a.time - b.time);
  return {
    start, end,
    points: points.map((point, index) => ({
      ...point,
      connect: index > 0 && point.time - points[index - 1].time === DAY,
    })),
  };
}
