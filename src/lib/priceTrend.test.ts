import { describe, expect, it } from 'vitest';
import { archiveQuotes, priceSnapshot, retainWeekly, weekStart } from '../../scripts/price-history.mjs';
import { priceTrend, type PriceSnapshot } from './priceTrend';
import type { Line } from './pricebook';

const line = (printingId: string, qty: number) => ({ entry: { printingId, qty } }) as Line;
const snapshot = (date: string, quotes: PriceSnapshot['quotes']): PriceSnapshot => ({ date, quotes });

describe('price trend', () => {
  it('holds quantities and each quote source fixed through the Retail transition', () => {
    const lines = [line('retail', 3), line('stable', 2), line('listing', 1), line('unpriced', 1)];
    const old = snapshot('2026-10-14', { beta: [100, 80], stable: [50, 25], listing: [null, 200] });
    const latest = snapshot('2026-11-13', { retail: [900, 800], beta: [110, 85], stable: [65, 30], listing: [500, 210], unpriced: [300, 200] });
    const result = priceTrend(lines, [old, latest], latest, { retail: 'beta' });
    expect(result).toMatchObject({ covered: 6, proxies: 3, listings: 1, start: '2026-10-14', end: '2026-11-13' });
    expect(result.points).toEqual([
      { date: '2026-10-14', cents: 600 },
      { date: '2026-10-21', cents: null },
      { date: '2026-10-28', cents: null },
      { date: '2026-11-04', cents: null },
      { date: '2026-11-13', cents: 670 },
    ]);
    expect(result.change).toMatchObject({ cents: 70, from: old.date, to: latest.date });
    expect(result.change!.percent).toBeCloseTo(11.67, 2);
  });

  it('omits change with one observation and keeps both a real zero change and a missing series distinct', () => {
    const latest = snapshot('2026-11-13', { exact: [300, null] });
    expect(priceTrend([line('exact', 1)], [], latest, {}).change).toBeNull();
    const old = snapshot('2026-11-04', latest.quotes);
    expect(priceTrend([line('exact', 1)], [old], latest, {}).change?.percent).toBe(0);
    const missing = priceTrend([line('absent', 1)], [old], latest, {});
    expect(missing.covered).toBe(0);
    expect(missing.points.every(({ cents }) => cents === null)).toBe(true);
  });
});

describe('weekly price snapshots', () => {
  it('keeps the first successful capture each week across retries and rolls over on Wednesday UTC', () => {
    const first = priceSnapshot('2026-11-11T11:00:00Z', { exact: { market: 1.15, low: 0 } });
    expect(first).toEqual({ date: '2026-11-11', quotes: { exact: [115, null] } });
    expect(weekStart('2026-11-17T23:59:00Z')).toBe(first.date);
    const retry = priceSnapshot(first.date, { exact: { market: 4.25 } });
    expect(retainWeekly([first], retry)).toEqual([first]);
    const next = priceSnapshot('2026-11-18', { exact: { low: 2.25 } });
    expect(retainWeekly([first], next)).toEqual([first, next]);
    expect(retainWeekly([first], priceSnapshot(next.date, {}))).toEqual([first]);
  });

  it('backfills only unique product and finish matches and drops conflicting archive rows', () => {
    const catalog = {
      exact: { url: 'https://www.tcgplayer.com/product/1/card', finish: 'Foil' },
      duplicate: { productId: 2, finish: 'Normal' },
      alsoDuplicate: { productId: 2, finish: 'Normal' },
      conflict: { productId: 3, finish: 'Normal' },
    };
    const row = (productId: number, subTypeName: string, marketPrice: number) => ({ productId, subTypeName, marketPrice, lowPrice: null });
    expect(archiveQuotes(catalog, [
      row(1, 'Normal', 99), row(1, 'Foil', 3), row(2, 'Normal', 2), row(3, 'Normal', 1), row(3, 'Normal', 2),
    ])).toEqual({ exact: { market: 3, low: null } });
  });
});
