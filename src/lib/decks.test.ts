import { describe, expect, it } from 'vitest';
import sample from '../../public/imports/levi-collection.json';
import { BY_SLUG, RECOMMENDED } from './data';
import { completion, deckFromRecommended, matchesFilter, validate } from './decks';

const owned = new Map<string, number>();
for (const e of sample.entries) owned.set(e.slug, (owned.get(e.slug) ?? 0) + e.qty);

describe('recommended decks', () => {
  it('cover all four colours', () => {
    const colors = new Set(RECOMMENDED.flatMap((d) => d.colors));
    expect([...colors].sort()).toEqual(['Blue', 'Green', 'Red', 'Yellow']);
  });
  it.each(RECOMMENDED.map((d) => [d.id, d] as const))('%s is legal', (_id, d) => {
    const v = validate(deckFromRecommended(d.id)!);
    expect(v.issues).toEqual([]);
  });
  it.each(RECOMMENDED.map((d) => [d.id, d] as const))('%s links only real key cards', (_id, d) => {
    for (const k of d.keyCards) expect(BY_SLUG.has(k.slug)).toBe(true);
    expect(d.source.length).toBeGreaterThan(0);
  });
  it('declared colours match the cards in the list', () => {
    for (const d of RECOMMENDED) {
      const used = new Set(Object.keys(d.cards).map((s) => BY_SLUG.get(s)!.color));
      for (const c of used) expect(d.colors).toContain(c);
    }
  });
});

describe('completion', () => {
  it('budget decks are fully covered by the sample collection', () => {
    for (const id of ['lowball-netrun', 'heist-reloaded']) {
      const c = completion(RECOMMENDED.find((d) => d.id === id)!, owned);
      expect(c.have).toBe(c.total);
      expect(c.estimate.copies).toBe(0);
      expect(c.estimate.knownCad).toBe(0);
      expect(matchesFilter(c, 'owned')).toBe(true);
    }
  });
  it('an empty collection owns nothing and pays for everything', () => {
    const d = RECOMMENDED[0];
    const c = completion(d, new Map());
    expect(c.have).toBe(0);
    expect(c.total).toBe(Object.values(d.cards).reduce((a, b) => a + b, 0) + 3);
    expect(matchesFilter(c, 'close')).toBe(false);
    expect(matchesFilter(c, 'all')).toBe(true);
  });
  it('never rounds a partial deck up to 100%', () => {
    const d = RECOMMENDED.find((x) => x.id === 'heist-reloaded')!;
    const almost = new Map(owned);
    almost.set('psycho-squad', 2); // deck wants 3
    const c = completion(d, almost);
    expect(c.pct).toBeLessThan(100);
    expect(matchesFilter(c, 'owned')).toBe(false);
  });
});

describe('validate', () => {
  it('requires distinct Legend names across subtitles', () => {
    const deck = deckFromRecommended('heist-reloaded')!;
    const checked = validate({ ...deck, legends: ['jackie-welles-mama-s-favorite', 'jackie-welles-pour-one-out-for-me', 'v-corporate-exile'] });
    expect(checked.issues).toContain('Needs exactly 3 different Legends by name (has 2)');
  });

  it('flags Legends outside the crew, including in imported lists', () => {
    const deck = deckFromRecommended('heist-reloaded')!;
    const [legend] = deck.legends;
    const checked = validate({ ...deck, cards: { ...deck.cards, [legend]: 1 }, sideboard: { [legend]: 1 } });
    expect(checked.issues).toContain(`Legends belong in the crew: ${BY_SLUG.get(legend)!.display}`);
  });

  it('checks sideboard-only and combined copies against the same cap', () => {
    const deck = deckFromRecommended('heist-reloaded')!;
    const checked = validate({ ...deck, cards: { ...deck.cards, 'floor-it': 0 }, sideboard: { 'floor-it': 4, 'psycho-squad': 3 } });
    expect(checked.overCopies).toEqual(expect.arrayContaining(['floor-it', 'psycho-squad']));
    const { ['floor-it']: _floorIt, ...main } = deck.cards;
    const sideOnly = validate({ ...deck, cards: main, sideboard: { 'floor-it': 4 } });
    expect(sideOnly.overCopies).toEqual(['floor-it']);
    expect(sideOnly.legal).toBe(false);
  });

  it('flags RAM, copy and size problems', () => {
    const v = validate({ legends: ['v-corporate-exile'], cards: { 'animals-wrecker': 4 }, sideboard: {} });
    expect(v.legal).toBe(false);
    expect(v.issues.join(' ')).toMatch(/3 different Legends/);
    expect(v.issues.join(' ')).toMatch(/Max 3 copies/);
    expect(v.issues.join(' ')).toMatch(/RAM/);
  });
});
