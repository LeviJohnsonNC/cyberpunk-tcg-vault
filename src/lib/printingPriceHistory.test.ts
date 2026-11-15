import { describe, expect, it } from 'vitest';
import { printingPriceHistory } from './printingPriceHistory';
import type { PriceSnapshot } from './priceTrend';

const snapshot = (date: string, market: number | null, low: number | null): PriceSnapshot => ({
  date,
  quotes: { selected: [market, low], sibling: [900, 800] },
});

describe('printing price history', () => {
  it('uses exact quotes, deduplicates the latest date, and breaks at a missing week', () => {
    const history = [
      snapshot('2026-10-14', 1, 1),
      snapshot('2026-10-21', 100, 75),
      snapshot('2026-10-28', null, 160),
      snapshot('2026-11-04', 200, 175),
      snapshot('2026-11-13', 300, 240),
      snapshot('2026-11-14', 350, 280),
      snapshot('2026-11-15', 999, 999),
    ];
    const latest = snapshot('2026-11-14', 400, 340);
    const market = printingPriceHistory('selected', history, latest, 'Market');
    expect(market.points.map(({ date, cents, connect }) => [date, cents, connect])).toEqual([
      ['2026-10-21', 100, false],
      ['2026-11-04', 200, false],
      ['2026-11-13', 300, true],
      ['2026-11-14', 400, true],
    ]);
    const low = printingPriceHistory('selected', history, latest, 'Low listing');
    expect(low.points.map(({ cents }) => cents)).toEqual([75, 160, 175, 240, 340]);
  });

  it('allows an empty series and a lone observation without substituting another basis or printing', () => {
    const latest = snapshot('2026-11-14', null, 340);
    expect(printingPriceHistory('selected', [], latest, 'Market').points).toEqual([]);
    expect(printingPriceHistory('unknown', [], latest, 'Low listing').points).toEqual([]);
    expect(printingPriceHistory('selected', [], latest, 'Low listing').points).toMatchObject([{ cents: 340, connect: false }]);
  });
});
