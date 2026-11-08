import { describe, expect, it } from 'vitest';
import sample from '../public/imports/levi-collection.json';
import { RECOMMENDED } from '../src/lib/data';
import { validate } from '../src/lib/decks';
import { autobuild } from '../src/lib/autobuild';
import { repair, resolveName, validateDeck } from './_deckrules';

const owned: Record<string, number> = {};
for (const e of sample.entries) owned[e.slug] = (owned[e.slug] ?? 0) + e.qty;

describe('server rules agree with client rules', () => {
  it('on every recommended deck', () => {
    for (const d of RECOMMENDED) {
      expect(validateDeck(d.legends, d.cards)).toEqual([]);
      expect(validate({ legends: d.legends, cards: d.cards, sideboard: {} }).legal).toBe(true);
    }
  });
  it('on auto-built decks', () => {
    const r = autobuild(new Map(Object.entries(owned)));
    if (!r.ok) throw new Error('no builds');
    for (const b of r.builds) expect(validateDeck(b.legends, b.cards)).toEqual([]);
  });
  it('on illegal decks', () => {
    const bad = { 'animals-wrecker': 4 };
    expect(validateDeck(['v-corporate-exile'], bad).length).toBeGreaterThan(0);
    expect(validate({ legends: ['v-corporate-exile'], cards: bad, sideboard: {} }).legal).toBe(false);
  });
});

describe('resolveName', () => {
  it('handles colons, dashes, case and accents', () => {
    expect(resolveName('Viktor Vektor - Sit Down and Relax')?.slug).toBe('viktor-vektor-sit-down-and-relax');
    expect(resolveName('les elemens')?.slug).toBe('les-e-le-mens');
    expect(resolveName('PSYCHO SQUAD')?.slug).toBe('psycho-squad');
    expect(resolveName('Totally Fake Card')).toBeUndefined();
  });
});

describe('repair', () => {
  const r = autobuild(new Map(Object.entries(owned)));
  if (!r.ok) throw new Error('no builds');
  const base = r.builds[0];
  it('drops unknown, unowned and over-RAM picks, clamps copies, tops up to 40', () => {
    const out = repair(
      base.legends,
      [
        { name: 'Totally Fake Card', qty: 3 },
        { name: 'Towerfall', qty: 2 }, // not owned
        { name: 'Animals Wrecker', qty: 3 }, // red, over RAM for a blue/yellow crew
        { name: 'Psycho Squad', qty: 3 },
        { name: 'Floor It', qty: 9 }, // owns 3
      ],
      owned,
      base.cards,
    );
    expect(validateDeck(base.legends, out.cards)).toEqual([]);
    expect(out.cards['towerfall']).toBeUndefined();
    expect(out.cards['animals-wrecker']).toBeUndefined();
    expect(out.cards['floor-it']).toBe(3);
    expect(out.dropped.join(' ')).toMatch(/unknown card/);
    expect(out.toppedUp).toBeGreaterThan(0);
    for (const [s, n] of Object.entries(out.cards)) expect(n).toBeLessThanOrEqual(owned[s]);
  });
  it('trims oversized answers to 50', () => {
    const many = Object.keys(owned).map((s) => ({ name: s.replace(/-/g, ' '), qty: 3 }));
    const out = repair(base.legends, many, owned, base.cards);
    expect(validateDeck(base.legends, out.cards)).toEqual([]);
  });
  it('keeps the baseline when the model returns nothing usable', () => {
    const out = repair(base.legends, [], owned, base.cards);
    expect(out.cards).toEqual(base.cards);
  });
});
