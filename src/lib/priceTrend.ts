import type { Line } from './pricebook';
import type { DailyPriceArchive, PriceSnapshot } from './priceSnapshots';

const DAY = 86_400_000;
const dayLabel = (date: number) => new Date(date).toISOString().slice(0, 10);

export function priceTrend(lines: Line[], archive: DailyPriceArchive, latest: PriceSnapshot) {
  const start = Date.parse(latest.date) - 30 * DAY;
  const days = Array.from({ length: 31 }, (_, index) => ({
    date: dayLabel(start + index * DAY),
    market: new Map<string, number>(),
  }));
  const byDate = new Map(days.map(day => [day.date, day.market]));
  const quantities = new Map<string, number>();
  for (const { entry: { printingId, qty } } of lines) {
    quantities.set(printingId, (quantities.get(printingId) ?? 0) + qty);
  }

  const current = days.at(-1)!.market;
  for (const id of quantities.keys()) {
    for (const [index, market] of archive.quotes[id] ?? []) {
      const date = archive.dates[index];
      if (date < latest.date && market != null && market > 0) byDate.get(date)?.set(id, market);
    }
    const [market] = latest.quotes[id] ?? [];
    if (market != null && market > 0) current.set(id, market);
  }

  const points = days.map(({ date, market }, index) => {
    let cents = 0;
    let covered = 0;
    for (const [id, price] of market) {
      const qty = quantities.get(id)!;
      cents += price * qty;
      covered += qty;
    }
    const previous = days[index - 1]?.market;
    // A different set of priced printings changes what the subtotal represents.
    const connect = covered > 0 && previous?.size === market.size && [...market.keys()].every(id => previous.has(id));
    return { date, cents: covered ? cents : null, covered, connect };
  });

  let change: { cents: number; percent: number; from: string; to: string; covered: number } | null = null;
  // Use the longest available comparison with the latest snapshot and a shared basket.
  for (const { date, market } of days.slice(0, -1)) {
    let first = 0;
    let last = 0;
    let covered = 0;
    for (const [id, price] of market) {
      const latestPrice = current.get(id);
      if (latestPrice === undefined) continue;
      const qty = quantities.get(id)!;
      first += price * qty;
      last += latestPrice * qty;
      covered += qty;
    }
    if (covered) {
      change = { cents: last - first, percent: (last - first) / first * 100, from: date, to: latest.date, covered };
      break;
    }
  }

  return { points, change, start: days[0].date, end: latest.date };
}
