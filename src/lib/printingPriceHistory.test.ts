import { describe, expect, it } from 'vitest';
import { printingPriceHistory, type DailyPriceArchive } from './printingPriceHistory';
import type { PriceSnapshot } from './priceTrend';

const history: DailyPriceArchive = {
  dates: ['2026-10-14', '2026-10-21', '2026-10-22', '2026-11-04', '2026-11-13', '2026-11-14'],
  quotes: {
    selected: [[0, 80, null], [1, 100, 75], [2, null, 160], [3, 200, 175], [4, 300, 240], [5, 350, 280]],
    sibling: [[0, 999, 800]],
  },
};
const latest: PriceSnapshot = { date: '2026-11-14', quotes: { selected: [400, 340] } };

describe('printing price history', () => {
  it('keeps exact daily prices, deduplicates the latest date, and breaks at gaps', () => {
    const market = printingPriceHistory('selected', history, latest, 'Market', 'month');
    expect(market.points.map(({ date, cents, connect }) => [date, cents, connect])).toEqual([
      ['2026-10-21', 100, false],
      ['2026-11-04', 200, false],
      ['2026-11-13', 300, false],
      ['2026-11-14', 400, true],
    ]);
    const low = printingPriceHistory('selected', history, latest, 'Low listing', 'month');
    expect(low.points.map(({ cents }) => cents)).toEqual([75, 160, 175, 240, 340]);
  });

  it('starts the all-time series on the first quote for that exact printing and basis', () => {
    const all = printingPriceHistory('selected', history, latest, 'Market', 'all');
    expect(all.start).toBe(Date.parse('2026-10-14'));
    expect(all.points[0]).toMatchObject({ date: '2026-10-14', cents: 80 });
    expect(printingPriceHistory('selected', history, latest, 'Low listing', 'all').start).toBe(Date.parse('2026-10-21'));
  });

  it('preserves earlier quotes for a printing with no current quote', () => {
    const series = printingPriceHistory('sibling', history, latest, 'Market', 'all');
    expect(series.points.map(({ cents }) => cents)).toEqual([999]);
    expect(printingPriceHistory('unknown', history, latest, 'Low listing', 'all').points).toEqual([]);
  });
});
