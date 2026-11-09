import { describe, expect, it } from 'vitest';
import { BY_SLUG } from './data';
import { starterByKey } from './starters';
import {
  ANY_SELLABLE, HAND_SIZE, atLeastOne, deckStats, draw, expand, keep, matchCount, mulligan, newTrial, openingOdds,
  pct, ppDiff, seeded, shuffle, testIssues, withMulligan, type Trial,
} from './handtest';

const heist = starterByKey('the-heist');
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const counts = (xs: string[]) => xs.reduce<Record<string, number>>((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {});
const nonLegends = [...BY_SLUG.values()].filter((c) => c.type !== 'Legend');

/** A 40-card list with one copy of `one` and 3 copies of 13 others. */
const forty = (() => {
  const picks = nonLegends.slice(0, 14);
  const cards: Record<string, number> = { [picks[0].slug]: 1 };
  for (const c of picks.slice(1)) cards[c.slug] = 3;
  return { cards, one: picks[0].slug, other: picks[1].slug };
})();

describe('deckStats', () => {
  it('matches a hand count of the Heist main deck', () => {
    const s = deckStats(heist.cards);
    expect(s.n).toBe(total(heist.cards));
    expect(s.curve.reduce((a, b) => a + b.value, 0)).toBe(s.n);
    expect(s.units + s.gear + s.programs).toBe(s.n);
    const sellable = Object.entries(heist.cards).filter(([k]) => BY_SLUG.get(k)!.sellable).reduce((a, [, n]) => a + n, 0);
    expect(s.sellable).toBe(sellable);
    expect(s.curve.map((b) => b.label)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7+']);
  });
});

describe('testIssues', () => {
  it('allows a small draft and blocks fewer than six cards or unknown data', () => {
    const six = Object.fromEntries(Object.entries(heist.cards).slice(0, 3).map(([s]) => [s, 2]));
    expect(testIssues({ cards: six })).toEqual([]);
    expect(testIssues({ cards: { [forty.one]: 3, [forty.other]: 2 } }).join()).toMatch(/at least 6 .*has 5/);
    expect(testIssues({ cards: { ...six, 'mystery-card': 1 } }).join()).toMatch(/Card data missing/);
  });
});

describe('trials', () => {
  it('expands duplicates into copies and shuffles without replacement', () => {
    const lib = expand(heist.cards);
    expect(lib).toHaveLength(total(heist.cards));
    expect(counts(shuffle(lib, seeded(7)))).toEqual(counts(lib));
    expect(shuffle(lib, seeded(7))).toEqual(shuffle(lib, seeded(7))); // deterministic
    expect(shuffle(lib, seeded(7))).not.toEqual(shuffle(lib, seeded(8)));
  });

  it('deals six, keeps the rest in the pile, and never deals Legends or the sideboard', () => {
    const t = newTrial(heist.cards, seeded(1));
    expect(t.hand).toHaveLength(HAND_SIZE);
    expect(t.library).toHaveLength(total(heist.cards) - HAND_SIZE);
    expect(counts([...t.hand, ...t.library])).toEqual(counts(expand(heist.cards)));
    expect([...t.hand, ...t.library].some((s) => heist.legends.includes(s))).toBe(false);
  });

  it('allows one full-hand mulligan, then only draws', () => {
    const rng = seeded(42);
    const t0 = newTrial(heist.cards, rng);
    expect(draw(t0)).toBe(t0); // decide first
    const t1 = mulligan(t0, rng);
    expect(t1.mulliganed).toBe(true);
    expect(t1.phase).toBe('playing');
    expect(t1.hand).toHaveLength(HAND_SIZE);
    expect(counts([...t1.hand, ...t1.library])).toEqual(counts(expand(heist.cards))); // whole hand went back
    expect(mulligan(t1, rng)).toBe(t1); // only one
    expect(keep(t1)).toBe(t1);
    const t2 = draw(t1);
    expect(t2.hand).toHaveLength(HAND_SIZE + 1);
    expect(t2.hand[HAND_SIZE]).toBe(t1.library[0]);
    expect(t2.library).toHaveLength(t1.library.length - 1);
  });

  it('a kept hand cannot mulligan afterwards', () => {
    const t = keep(newTrial(heist.cards, seeded(3)));
    expect(mulligan(t, seeded(9))).toBe(t);
  });

  it('draws until the pile is empty, then stops', () => {
    const cards = { [forty.one]: 1, [forty.other]: 3, [nonLegends[2].slug]: 3 }; // 7 cards
    let t: Trial = keep(newTrial(cards, seeded(5)));
    t = draw(t);
    expect(t.library).toHaveLength(0);
    expect(t.hand).toHaveLength(7);
    expect(draw(t)).toBe(t);
  });

  it('a new trial resets the pile, hand and mulligan', () => {
    const rng = seeded(11);
    const used = draw(mulligan(newTrial(heist.cards, rng), rng));
    const fresh = newTrial(heist.cards, rng);
    expect(fresh).toMatchObject({ phase: 'deciding', mulliganed: false, opening: HAND_SIZE });
    expect(fresh.hand.length + fresh.library.length).toBe(used.hand.length + used.library.length);
  });

  it('a seeded sample of trials looks fair', () => {
    const rng = seeded(2026);
    let hits = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) if (newTrial(forty.cards, rng).hand.includes(forty.one)) hits++;
    expect(Math.abs(hits / runs - 0.15)).toBeLessThan(0.01);
  });
});

describe('opening hand odds', () => {
  it('is exact for the textbook cases', () => {
    expect(atLeastOne(40, 0)).toBe(0);
    expect(atLeastOne(40, 1)).toBeCloseTo(0.15, 12);
    expect(atLeastOne(40, 3)).toBeCloseTo(1 - (37 * 36 * 35 * 34 * 33 * 32) / (40 * 39 * 38 * 37 * 36 * 35), 12);
    expect(atLeastOne(50, 1)).toBeCloseTo(0.12, 12);
    expect(atLeastOne(6, 1)).toBe(1);
    expect(atLeastOne(8, 3)).toBe(1); // only 5 misses, so a 6-card hand must hit
    expect(withMulligan(0.15)).toBeCloseTo(0.2775, 12);
  });

  it('counts copies per deck, including a card cut from one list', () => {
    const upgraded = { ...forty.cards };
    delete upgraded[forty.one];
    upgraded[forty.other] = 3;
    upgraded[nonLegends[20].slug] = 1; // same size, the 1-of replaced
    const a = openingOdds(forty.cards, forty.one);
    const b = openingOdds(upgraded, forty.one);
    expect(a).toMatchObject({ copies: 1, deckSize: 40 });
    expect(a.opening).toBeCloseTo(0.15, 12);
    expect(b).toMatchObject({ copies: 0, deckSize: 40, opening: 0, mulligan: 0 });
    expect(ppDiff(a.opening, b.opening)).toBe('−15.0 pts');
    expect(pct(a.opening)).toBe('15.0%');
  });

  it('accounts for different deck sizes', () => {
    const bigger = { ...forty.cards, [nonLegends[30].slug]: 3, [nonLegends[31].slug]: 3, [nonLegends[32].slug]: 3, [nonLegends[33].slug]: 1 };
    const o = openingOdds(bigger, forty.one);
    expect(o).toMatchObject({ copies: 1, deckSize: 50 });
    expect(o.opening).toBeCloseTo(0.12, 12);
    expect(ppDiff(openingOdds(forty.cards, forty.one).opening, o.opening)).toBe('−3.0 pts');
  });

  it('supports any sellable card and ignores Legends', () => {
    expect(matchCount(heist.cards, ANY_SELLABLE)).toBe(deckStats(heist.cards).sellable);
    expect(matchCount(heist.cards, heist.legends[0])).toBe(0);
  });
});
