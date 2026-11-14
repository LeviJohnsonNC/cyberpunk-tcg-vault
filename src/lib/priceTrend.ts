import type { Line } from './pricebook';

type Quote = [market: number | null, low: number | null];
export interface PriceSnapshot { date: string; quotes: Record<string, Quote> }
export interface TrendPoint { date: string; cents: number | null }

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const WEDNESDAY = Date.UTC(1970, 0, 7);
const dayLabel = (date: number) => new Date(date).toISOString().slice(0, 10);
const weekStart = (date: number) => Math.floor((date - WEDNESDAY) / WEEK) * WEEK + WEDNESDAY;

export function priceTrend(lines: Line[], history: PriceSnapshot[], latest: PriceSnapshot, pairs: Record<string, string>) {
  const endDate = Date.parse(latest.date);
  const startDate = endDate - 30 * DAY;
  const currentWeek = weekStart(endDate);
  const slots = new Map<number, PriceSnapshot>();
  for (const snapshot of history) {
    const date = Date.parse(snapshot.date);
    if (date >= startDate && date < currentWeek) slots.set(weekStart(date), snapshot);
  }
  const dates: { date: string; snapshot?: PriceSnapshot }[] = [];
  for (let week = weekStart(startDate); week < currentWeek; week += WEEK) {
    const snapshot = slots.get(week);
    if (snapshot) dates.push({ date: snapshot.date, snapshot });
    else if (week >= startDate) dates.push({ date: dayLabel(week) });
  }
  dates.push({ date: latest.date, snapshot: latest });

  const available = dates.flatMap(({ snapshot }) => snapshot ? [snapshot] : []);
  const totals = new Map(available.map(({ date }) => [date, 0]));
  let covered = 0;
  let proxies = 0;
  let listings = 0;
  for (const { entry: { printingId, qty } } of lines) {
    const candidates = [
      { id: printingId, index: 0, basis: 'market' },
      { id: printingId, index: 1, basis: 'listing' },
      { id: pairs[printingId], index: 0, basis: 'proxy' },
    ] as const;
    const source = candidates.find(({ id, index }) => id && available.every(({ quotes }) => (quotes[id]?.[index] ?? 0) > 0));
    if (!source) continue;
    covered += qty;
    if (source.basis === 'proxy') proxies += qty;
    if (source.basis === 'listing') listings += qty;
    for (const { date, quotes } of available) {
      const cents = quotes[source.id][source.index]!;
      totals.set(date, totals.get(date)! + cents * qty);
    }
  }
  const points: TrendPoint[] = dates.map(({ date }) => ({ date, cents: covered ? totals.get(date) ?? null : null }));
  const quoted = points.filter((point) => point.cents !== null);
  const first = quoted[0];
  const last = quoted.at(-1);
  const change = first?.cents && last?.cents != null && first !== last
    ? { cents: last.cents - first.cents, percent: (last.cents - first.cents) / first.cents * 100, from: first.date, to: last.date }
    : null;
  return { points, covered, proxies, listings, change, start: dayLabel(startDate), end: latest.date };
}
