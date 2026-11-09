import { afterEach, describe, expect, it } from 'vitest';
import { BY_SLUG, CARDS, FX, PRICES, _clearQuoteCache, acquireQuote, printingLabel, valueHolding } from './data';
// @ts-expect-error plain ESM generator module, no types
import { buildPrices } from '../../scripts/price-build.mjs';

const card = (slug: string) => BY_SLUG.get(slug)!;
const printing = (slug: string, set: string) => card(slug).printings.find((p) => p.set === set)!;
const JACKIE = 'jackie-welles-pour-one-out-for-me';
const jackieRetail = printing(JACKIE, 'The Heist — Retail Starter Deck').id;
const jackieBeta = printing(JACKIE, 'The Heist — Beta Starter Deck').id;
const novaEO = printing('adam-smasher-ender-of-legends', 'Edgerunner Open S 1').id;
const smasherRetail = printing('adam-smasher-ender-of-legends', 'Welcome to Night City — Retail').id;

afterEach(() => _clearQuoteCache());

describe('valueHolding: what a copy you own is worth', () => {
  it('leaves the Edgerunner Open Nova Rare unpriced even though the base Retail printing is priced', () => {
    expect(valueHolding(smasherRetail)?.basis).toBe('Market');
    expect(valueHolding(novaEO)).toBeNull();
  });

  it('values a listing-only Heist Retail Legend at its verified Beta twin, naming the source printing', () => {
    const v = valueHolding(jackieRetail)!;
    expect(PRICES.printings[jackieRetail].market).toBeNull();
    expect(v.basis).toBe('Beta proxy');
    expect(v.sourcePrintingId).toBe(jackieBeta);
    expect(v.cad).toBeCloseTo(PRICES.printings[jackieBeta].market! * FX, 6);
    expect(printingLabel(v.sourcePrintingId, false)).toMatch(/Beta/);
  });

  it('calls a direct market quote on a Beta holding "Market", not a proxy', () => {
    const v = valueHolding(jackieBeta)!;
    expect(v.basis).toBe('Market');
    expect(v.sourcePrintingId).toBe(jackieBeta);
  });

  it('uses the exact low listing when there is no market quote and no cheaper verified twin', () => {
    const lowOnly = Object.entries(PRICES.printings).find(([id, q]) => q.market == null && q.low != null && !PRICES.pairs[id]);
    if (!lowOnly) return; // feed-dependent
    const v = valueHolding(lowOnly[0])!;
    expect(v.basis).toBe('Low listing');
    expect(v.cad).toBeCloseTo(lowOnly[1].low! * FX, 6);
  });

  it('never borrows a price for a printing outside a verified pair', () => {
    for (const c of CARDS)
      for (const p of c.printings) {
        const v = valueHolding(p.id);
        if (!v) continue;
        if (v.sourcePrintingId !== p.id) {
          expect(v.basis).toBe('Beta proxy');
          expect(PRICES.pairs[p.id]).toBe(v.sourcePrintingId);
        }
      }
  });
});

describe('acquireQuote: what one playable copy costs to buy', () => {
  it('excludes proxies: the quote always sits directly on the named printing', () => {
    for (const c of CARDS) {
      const q = acquireQuote(c.slug);
      if (!q) continue;
      expect(['Market', 'Low listing']).toContain(q.basis);
      const own = PRICES.printings[q.printingId];
      expect(own).toBeDefined();
      expect(q.cad).toBeCloseTo((q.basis === 'Market' ? own.market! : own.low!) * FX, 6);
      expect(card(c.slug).printings.some((p) => p.id === q.printingId)).toBe(true);
    }
  });

  it('can use a direct Beta quote and identifies it as Beta', () => {
    const q = acquireQuote(JACKIE)!;
    expect(q.basis).toBe('Market');
    expect(q.printingId).toBe(jackieBeta); // cheapest direct market quote across printings
    expect(printingLabel(q.printingId, false)).toMatch(/Beta/);
  });

  it('prefers any market quote over a listing, and returns null when nothing is quoted', () => {
    const saved = { ...PRICES.printings };
    try {
      for (const p of card(JACKIE).printings) delete PRICES.printings[p.id];
      _clearQuoteCache();
      expect(acquireQuote(JACKIE)).toBeNull();
      PRICES.printings[jackieRetail] = { market: null, low: 3, finish: 'Foil', url: null };
      PRICES.printings[jackieBeta] = { market: 9, low: 8, finish: 'Foil', url: null };
      _clearQuoteCache();
      expect(acquireQuote(JACKIE)).toMatchObject({ basis: 'Market', printingId: jackieBeta });
    } finally {
      Object.assign(PRICES.printings, saved);
    }
  });
});

describe('price generator (scripts/price-build.mjs)', () => {
  const cat = [
    {
      slug: 'x',
      printings: [
        { id: 'r1', set: 'The Heist — Retail Starter Deck', num: '011', rarity: 'Epic' },
        { id: 'b1', set: 'The Heist — Beta Starter Deck', num: 'β011', rarity: 'Epic' },
        { id: 'pr', set: 'Pre-Release Retail', num: '001', rarity: 'Epic' },
        { id: 'pb', set: 'Pre-Release Beta', num: '001', rarity: 'Epic' },
        { id: 'amb', set: 'Welcome to Night City — Retail', num: '050', rarity: 'Rare' },
        { id: 'nova', set: 'Edgerunner Open S 1', num: '029', rarity: 'Nova Rare' },
      ],
    },
  ];
  const rows = [
    { set: 'The Heist - Retail Starter Deck', num: '011', productId: 1, finish: 'Foil', market: null, low: 25, url: 'u1' },
    { set: 'The Heist - Beta Starter Deck', num: 'B011', productId: 2, finish: 'Foil', market: 14.52, low: 13, url: 'u2' },
    { set: 'The Heist - Beta Starter Deck', num: 'B011', productId: 2, finish: 'Foil', market: 14.52, low: 13, url: 'u2' }, // duplicate row
    { set: 'Welcome to Night City - Retail', num: '050', productId: 3, finish: 'Normal', market: 1, low: 0.5, url: 'u3' },
    { set: 'Welcome to Night City - Retail', num: '050', productId: 4, finish: 'Foil', market: 9, low: 7, url: 'u4' },
  ];
  const out = buildPrices(cat, rows);

  it('leaves ambiguous finish matches unpriced instead of taking the first row', () => {
    expect(out.printings.amb).toBeUndefined();
    expect(out.ambiguous).toEqual([expect.objectContaining({ printingId: 'amb', finishes: ['Normal', 'Foil'] })]);
  });
  it('treats a repeated identical row as one match, and keeps only market and low (no mid)', () => {
    expect(out.printings.b1).toEqual({ market: 14.52, low: 13, finish: 'Foil', url: 'u2' });
    expect(out.printings.r1).toEqual({ market: null, low: 25, finish: 'Foil', url: 'u1' });
  });
  it('pairs Retail and Beta twins by card, rarity and collector number (β011 and plain 001 styles)', () => {
    expect(out.pairs).toEqual({ r1: 'b1', pr: 'pb' });
  });
  it('gives an unlisted Nova Rare no quote at all', () => {
    expect(out.printings.nova).toBeUndefined();
  });
});
