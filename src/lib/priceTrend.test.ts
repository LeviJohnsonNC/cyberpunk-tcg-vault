import { describe, expect, it } from 'vitest';
import { archiveQuotes, priceSnapshot, retainDaily, retainWeekly, weekStart } from '../../scripts/price-history.mjs';
import { priceTrend, priceTrendPaths } from './priceTrend';
import type { DailyPriceArchive, PriceSnapshot } from './priceSnapshots';
import type { Line } from './pricebook';

const line = (printingId: string, qty: number) => ({ entry: { printingId, qty } }) as Line;
const snapshot = (date: string, quotes: PriceSnapshot['quotes']): PriceSnapshot => ({ date, quotes });

describe('price trend', () => {
  it('joins observed points with bounded curves and dashes across changes in coverage', () => {
    const points = [
      { x: 0, y: 10, connect: false },
      { x: 6, y: 4, connect: true },
      { x: 15, y: 13, connect: false },
      { x: 21, y: 13, connect: false },
    ];
    expect(priceTrendPaths(points)).toEqual({
      solid: 'M0,10 C2,8 4,4 6,4 ',
      dashed: 'M6,4 C9,4 12,13 15,13 C17,13 19,13 21,13 ',
    });
    expect(priceTrendPaths(points.slice(0, 1))).toEqual({ solid: '', dashed: '' });
  });

  it('adds exact Retail market quotes when they appear and compares the same copies at both ends', () => {
    const lines = [line('retail', 3), line('stable', 2), line('listing', 1)];
    const archive: DailyPriceArchive = {
      dates: ['2026-10-14', '2026-10-15', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
      quotes: {
        beta: [[1, 100, 80], [2, 110, 85]],
        stable: [[0, 1, null], [1, 50, 25], [2, 50, 25], [3, 55, 30], [4, 600, null], [5, 10, null]],
        retail: [[2, null, 800], [3, 900, 800], [4, 800, 750]],
        listing: [[1, null, 200], [4, 200, null]],
      },
    };
    const latest = snapshot('2026-11-14', { retail: [950, 850], beta: [110, 85], stable: [65, 30], listing: [null, 210] });
    const result = priceTrend(lines, archive, latest);
    expect(result).toMatchObject({ start: '2026-10-15', end: '2026-11-14' });
    expect(result.points).toHaveLength(31);
    expect(result.points[0]).toEqual({ date: '2026-10-15', cents: 100, covered: 2, connect: false });
    expect(result.points[1]).toEqual({ date: '2026-10-16', cents: null, covered: 0, connect: false });
    expect(result.points.slice(-3)).toEqual([
      { date: '2026-11-12', cents: 100, covered: 2, connect: false },
      { date: '2026-11-13', cents: 2810, covered: 5, connect: false },
      { date: '2026-11-14', cents: 2980, covered: 5, connect: true },
    ]);
    expect(result.change).toEqual({ cents: 30, percent: 30, from: '2026-10-15', to: latest.date, covered: 2 });
  });

  it('skips earlier days with no shared printings and breaks a line even when coverage counts match', () => {
    const lines = [line('old', 2), line('current', 1), line('current', 1)];
    const archive: DailyPriceArchive = {
      dates: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
      quotes: { old: [[0, 100, null], [1, 90, null], [3, 90, null]], current: [[2, 200, null]] },
    };
    const result = priceTrend(lines, archive, snapshot('2026-11-13', { current: [200, null] }));
    expect(result.points.slice(-4)).toEqual([
      { date: '2026-11-10', cents: 200, covered: 2, connect: false },
      { date: '2026-11-11', cents: 180, covered: 2, connect: true },
      { date: '2026-11-12', cents: 400, covered: 2, connect: false },
      { date: '2026-11-13', cents: 400, covered: 2, connect: true },
    ]);
    expect(result.change).toEqual({ cents: 0, percent: 0, from: '2026-11-12', to: '2026-11-13', covered: 2 });
  });

  it('shows missing values and suppresses change with no shared quote dates', () => {
    const archive: DailyPriceArchive = { dates: ['2026-11-12'], quotes: { old: [[0, 100, null]] } };
    const latest = snapshot('2026-11-13', { current: [200, null] });
    expect(priceTrend([line('old', 1), line('current', 1)], archive, latest).change).toBeNull();
    const pastOnly = priceTrend([line('old', 1)], archive, latest);
    expect(pastOnly.points.at(-1)).toMatchObject({ cents: null, covered: 0 });
    expect(pastOnly.change).toBeNull();
    expect(priceTrend([line('absent', 1)], archive, latest).points.every(({ cents }) => cents === null)).toBe(true);
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

describe('persistent daily price archive', () => {
  it('inserts earlier dates, preserves unrelated quotes, and is idempotent on retry', () => {
    const daily: PriceSnapshot[] = [{ date: '2026-11-15', quotes: { exact: [120, null], other: [90, null] } },
      { date: '2026-11-13', quotes: { exact: [100, 80] } }];
    const initial = retainDaily({ version: 1, dates: [], quotes: {} }, daily.slice(0, 1));
    const backfilled = retainDaily(initial, daily.slice(1));
    expect(backfilled).toEqual({
      version: 1, dates: ['2026-11-13', '2026-11-15'],
      quotes: { exact: [[0, 100, 80], [1, 120, null]], other: [[1, 90, null]] },
    });
    expect(retainDaily(backfilled, daily)).toEqual(backfilled);
    const corrected = retainDaily(backfilled, [{ date: '2026-11-15', quotes: { exact: [130, null] } }]);
    expect(corrected.quotes.exact.at(-1)).toEqual([1, 130, null]);
    expect(corrected.quotes.other).toEqual(backfilled.quotes.other);
  });
});
