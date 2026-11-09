import { describe, expect, it } from 'vitest';
import { FX } from './data';
import { money, toDisplay } from './currency';
import { buildPriceBook, toCsv } from './pricebook';

describe('currency', () => {
  it('defaults to USD and converts internal CAD amounts back to source USD', () => {
    expect(toDisplay(FX * 10)).toBeCloseTo(10, 6);
    expect(money(FX * 10)).toBe('$10.00');
  });
  it('formats CAD unchanged', () => {
    expect(toDisplay(12.5, 'CAD')).toBe(12.5);
    expect(money(12.5, 'CAD')).toBe('$12.50');
  });
  it('exports CSV in the chosen currency', () => {
    const pb = buildPriceBook([{ slug: 'psycho-squad', printingId: '', qty: 2 }]);
    const csv = toCsv(pb.lines, (n) => toDisplay(n, 'USD'), 'USD').split('\n');
    expect(csv[0]).toContain('"Unit USD"');
  });
});
