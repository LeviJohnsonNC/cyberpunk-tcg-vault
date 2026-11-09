import { describe, expect, it } from 'vitest';
import { BY_SLUG, PRICES, _clearQuoteCache, acquireQuote } from './data';
import { estimateText } from './currency';
import { starterByKey } from './starters';
import { compareDeck, copyForBuilder, sanitizeShared, shareBlockers, shareStatus, shareUrl, TOKEN_RE } from './share';

const heist = starterByKey('the-heist');
const deck = { name: 'The Heist', legends: [...heist.legends], cards: { ...heist.cards }, sideboard: {} as Record<string, number> };
const mainSlugs = Object.keys(heist.cards);

/** A playable non-Legend card that isn't in the Heist main deck, for sideboard tests. */
const outsider = [...BY_SLUG.values()].find((c) => c.type !== 'Legend' && c.legal === 'legal' && !(c.slug in heist.cards) && acquireQuote(c.slug))!.slug;

const unprice = <T,>(slug: string, fn: () => T): T => {
  const ids = BY_SLUG.get(slug)!.printings.map((p) => p.id);
  const saved = Object.fromEntries(ids.map((id) => [id, PRICES.printings[id]]));
  for (const id of ids) delete PRICES.printings[id];
  _clearQuoteCache();
  try {
    return fn();
  } finally {
    for (const id of ids) if (saved[id]) PRICES.printings[id] = saved[id];
    _clearQuoteCache();
  }
};

describe('shareBlockers and status', () => {
  it('lets an unfinished but well-formed list share as a Draft', () => {
    const draft = { ...deck, legends: deck.legends.slice(0, 2) };
    expect(shareBlockers(draft)).toEqual([]);
    expect(shareStatus(draft).label).toBe('Draft');
    expect(shareStatus(deck).label).toBe(shareStatus(deck).legal ? 'Legal' : 'Draft');
  });

  it('blocks malformed lists', () => {
    expect(shareBlockers({ ...deck, name: '  ' })).toContain('Give the deck a name');
    expect(shareBlockers({ ...deck, cards: { ...deck.cards, 'not-a-card': 1 } }).join()).toMatch(/Unknown cards/);
    expect(shareBlockers({ ...deck, cards: { [mainSlugs[0]]: 3 }, sideboard: { [mainSlugs[0]]: 1 } }).join()).toMatch(/More than 3/);
    expect(shareBlockers({ name: 'x', legends: [], cards: {}, sideboard: {} })).toContain('Add some cards first');
  });
});

describe('sanitizeShared', () => {
  it('keeps only known cards and sane quantities, and reports what it dropped', () => {
    const s = sanitizeShared({
      name: 'x'.repeat(200),
      legends: [heist.legends[0], heist.legends[0], 'ghost-legend', mainSlugs[0]],
      cards: { [mainSlugs[0]]: 2, [mainSlugs[1]]: 9, [mainSlugs[2]]: 1.5, 'from-the-future': 2 },
      sideboard: 'nope',
      created_at: '2026-11-08T00:00:00Z',
    });
    expect(s.name).toHaveLength(80);
    expect(s.legends).toEqual([heist.legends[0]]);
    expect(s.cards).toEqual({ [mainSlugs[0]]: 2 });
    expect(s.sideboard).toEqual({});
    expect(s.dropped.sort()).toEqual(['from-the-future', 'ghost-legend', mainSlugs[0]].sort());
  });

  it('round-trips a real deck unchanged', () => {
    const s = sanitizeShared({ ...deck, created_at: 'now' });
    expect({ legends: s.legends, cards: s.cards, sideboard: s.sideboard, dropped: s.dropped }).toEqual({ legends: deck.legends, cards: deck.cards, sideboard: {}, dropped: [] });
  });
});

describe('compareDeck', () => {
  it('an empty collection needs the whole list', () => {
    const c = compareDeck(deck, new Map());
    expect(c.have).toBe(0);
    expect(c.canBuild).toBe(false);
    expect(c.play.copies).toBe(c.total);
    expect(c.full.copies).toBe(c.total);
  });

  it('owning everything means you can build it, at no cost', () => {
    const owned = new Map(Object.entries({ ...deck.cards }));
    for (const l of deck.legends) owned.set(l, 1);
    const c = compareDeck(deck, owned);
    expect(c.canBuild).toBe(true);
    expect(c.play.copies).toBe(0);
    expect(estimateText(c.full)).toBe('Nothing to buy');
  });

  it('allocates owned copies once when a card is in both the main deck and the sideboard', () => {
    const slug = mainSlugs[0];
    const split = { ...deck, cards: { ...deck.cards, [slug]: 2 }, sideboard: { [slug]: 1 } };
    const owned = new Map(Object.entries(split.cards));
    for (const l of split.legends) owned.set(l, 1);
    const c = compareDeck(split, owned); // owns the 2 main copies only
    const row = c.rows.find((r) => r.slug === slug)!;
    expect(row).toMatchObject({ main: 2, side: 1, need: 3, have: 2 });
    expect(c.canBuild).toBe(true); // the sideboard shortfall doesn't stop you playing
    expect(c.side.copies).toBe(1);
    expect(c.full.lines).toEqual([expect.objectContaining({ slug, buy: 1 })]);
  });

  it('reports a known sideboard shortfall separately from the main deck', () => {
    const withSide = { ...deck, sideboard: { [outsider]: 2 } };
    const owned = new Map(Object.entries(deck.cards));
    for (const l of deck.legends) owned.set(l, 1);
    const c = compareDeck(withSide, owned);
    expect(c.canBuild).toBe(true);
    expect(c.play.copies).toBe(0);
    expect(c.side).toEqual({ copies: 2, knownCad: acquireQuote(outsider)!.cad * 2, unpriced: 0 });
  });

  it('keeps an unpriced missing copy unpriced and shows a partial total', () => {
    const slug = mainSlugs[0];
    unprice(slug, () => {
      const owned = new Map(Object.entries(deck.cards));
      for (const l of deck.legends) owned.set(l, 1);
      owned.set(slug, 0);
      owned.set(mainSlugs[1], 0); // a priced card is missing too
      const c = compareDeck(deck, owned);
      expect(c.play.unpriced).toBe(deck.cards[slug]);
      expect(c.play.knownCad).toBeGreaterThan(0);
      expect(estimateText(c.play, 'USD')).toMatch(/USD \+ \d+ unpriced cop/);
      expect(estimateText(c.play, 'CAD')).toMatch(/CAD \+ \d+ unpriced cop/);
      expect(c.full.lines.find((l) => l.slug === slug)!.quote).toBeNull();
    });
  });
});

describe('links and copies', () => {
  it('builds a /d/ link and a fresh, unsaved, private copy', () => {
    expect(shareUrl('a'.repeat(32), 'https://x.test')).toBe(`https://x.test/d/${'a'.repeat(32)}`);
    expect(TOKEN_RE.test('A'.repeat(32))).toBe(false);
    const s = sanitizeShared({ ...deck, sideboard: { [outsider]: 1 } });
    const c = copyForBuilder(s, 'new-id');
    expect(c).toMatchObject({ id: 'new-id', name: 'Copy of The Heist', notes: '', updatedAt: '', legends: deck.legends, cards: deck.cards, sideboard: { [outsider]: 1 } });
    c.cards[mainSlugs[0]] = 0;
    expect(s.cards[mainSlugs[0]]).toBe(deck.cards[mainSlugs[0]]); // a real copy, not shared references
  });
});
