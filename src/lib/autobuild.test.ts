import { describe, expect, it } from 'vitest';
import sample from '../../public/imports/levi-collection.json';
import ratings from '../curated/card-ratings.json';
import { BY_SLUG, CARDS } from './data';
import { validate } from './decks';
import { autobuild, rating, type Build } from './autobuild';

const owned = new Map<string, number>();
for (const e of sample.entries) owned.set(e.slug, (owned.get(e.slug) ?? 0) + e.qty);
const builds = (r: ReturnType<typeof autobuild>): Build[] => {
  if (!r.ok) throw new Error(r.message);
  return r.builds;
};

describe('ratings file', () => {
  it('rates every playable card with a 1-10 power', () => {
    const rated = (ratings as { cards: Record<string, { power: number }> }).cards;
    for (const c of CARDS.filter((x) => x.ram != null && (x.text || x.type === 'Legend'))) {
      expect(rated[c.slug], c.display).toBeDefined();
      expect(rated[c.slug].power).toBeGreaterThanOrEqual(1);
      expect(rated[c.slug].power).toBeLessThanOrEqual(10);
    }
  });
});

describe('autobuild with the sample collection', () => {
  const res = builds(autobuild(owned));
  it('returns up to 3 legal, distinct builds', () => {
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThanOrEqual(3);
    for (const b of res) expect(validate({ legends: b.legends, cards: b.cards, sideboard: {} }).issues).toEqual([]);
    expect(new Set(res.map((b) => b.legends.join())).size).toBe(res.length);
  });
  it('never uses more copies than you own', () => {
    for (const b of res) {
      for (const l of b.legends) expect(owned.get(l)).toBeGreaterThan(0);
      for (const [s, n] of Object.entries(b.cards)) expect(n).toBeLessThanOrEqual(owned.get(s) ?? 0);
    }
  });
  it('keeps an economy: 18+ sellable cards and 16+ Units', () => {
    expect(res[0].stats.sellable).toBeGreaterThanOrEqual(18);
    expect(res[0].stats.units).toBeGreaterThanOrEqual(16);
  });
  it('is deterministic', () => {
    expect(builds(autobuild(owned))).toEqual(res);
  });
  it('suggests upgrades that are legal for the crew and priced', () => {
    for (const u of res[0].upgrades) {
      expect(BY_SLUG.has(u.slug)).toBe(true);
      expect(u.gain).toBeGreaterThan(0);
      if (u.quote) expect(u.quote.cad).toBeGreaterThan(0); // null means unpriced, never a fake $0
    }
  });
});

describe('steering', () => {
  it('respects a colour restriction', () => {
    for (const b of builds(autobuild(owned, { colors: ['Blue'] }))) expect(b.colors).toEqual(['Blue']);
  });
  it('includes a must-include card when any crew can run it', () => {
    const b = builds(autobuild(owned, { mustInclude: ['placide-voodoo-sentinel'] }));
    for (const x of b) expect(x.cards['placide-voodoo-sentinel']).toBeGreaterThan(0);
  });
  it('includes a must-include Legend', () => {
    for (const x of builds(autobuild(owned, { mustInclude: ['viktor-vektor-sit-down-and-relax'] })))
      expect(x.legends).toContain('viktor-vektor-sit-down-and-relax');
  });
  it('aggro plays more cheap Units than control', () => {
    const a = builds(autobuild(owned, { style: 'aggro', results: 1 }))[0];
    const c = builds(autobuild(owned, { style: 'control', results: 1 }))[0];
    expect(a.stats.early).toBeGreaterThanOrEqual(c.stats.early);
    expect(c.stats.removal).toBeGreaterThanOrEqual(a.stats.removal);
  });
});

describe('failure states', () => {
  it('asks for Legends when you own fewer than 3', () => {
    const r = autobuild(new Map([['psycho-squad', 3]]));
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'need-legends') expect(r.suggestions.length).toBeGreaterThan(0);
  });
  it('reports a shortfall when there are too few cards', () => {
    const tiny = new Map([['v-corporate-exile', 1], ['jackie-welles-pour-one-out-for-me', 1], ['alt-cunningham-soulkiller-architect', 1], ['psycho-squad', 3]]);
    const r = autobuild(tiny);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-enough-cards');
  });
  it('treats unknown ratings as filler rather than crashing', () => {
    expect(rating('not-a-card').power).toBe(3);
  });
});
