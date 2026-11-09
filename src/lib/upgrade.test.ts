import { describe, expect, it } from 'vitest';
import { PRICES, fitsRam, ramLimits, BY_SLUG, acquireQuote, _clearQuoteCache } from './data';
import { completion, deckNeed, purchaseEstimate } from './decks';
import { validate, COPY_MAX } from './decks';
import { budgetStatus, finishCost, planUpgrades, quoteFor } from './upgrade';
import { starterByKey, starterEntries } from './starters';

const heist = starterByKey('the-heist');
const ownedFrom = (entries: { slug: string; qty: number }[]) => {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.slug, (m.get(e.slug) ?? 0) + e.qty);
  return m;
};
const heistOnly = ownedFrom(starterEntries(heist, 'retail'));
const base = { legends: heist.legends, cards: heist.cards, owned: heistOnly };

describe('planUpgrades', () => {
  it('at $0 adds only owned copies, or explains why nothing is possible', () => {
    const p = planUpgrades({ ...base, budget: 0, currency: 'USD' });
    for (const o of p.options) for (const a of o.adds) expect(a.buyAdded).toBe(0);
    if (!p.options.length) expect(p.notes.join(' ')).toMatch(/\$0|own/);
  });

  it('at $0 uses spare owned copies when the collection has them', () => {
    const owned = new Map(heistOnly);
    owned.set('psycho-squad', 3); // a third copy owned, better than T-Bug
    owned.set('placide-voodoo-sentinel', 2);
    const p = planUpgrades({ ...base, owned, budget: 0, currency: 'USD' });
    expect(p.options.length).toBeGreaterThan(0);
    for (const o of p.options) {
      expect(o.cost.knownCad).toBe(0);
      expect(o.status).toBe('within');
      for (const a of o.adds) expect(a.buyAdded).toBe(0);
    }
  });

  it('every option is legal: RAM, copy cap, size, Legends unchanged', () => {
    for (const budget of [0, 10, 25]) {
      const p = planUpgrades({ ...base, budget, currency: 'USD' });
      const lim = ramLimits(heist.legends);
      for (const o of p.options) {
        expect(validate({ legends: heist.legends, cards: o.cards, sideboard: {} }).legal).toBe(true);
        for (const [slug, q] of Object.entries(o.cards)) {
          expect(q).toBeLessThanOrEqual(COPY_MAX);
          expect(fitsRam(BY_SLUG.get(slug)!, lim)).toBe(true);
        }
      }
    }
  });

  it('respects locks as minimum quantities and explains when locks block everything', () => {
    const locks = new Set(Object.keys(heist.cards));
    const p = planUpgrades({ ...base, budget: 25, currency: 'USD', locks });
    expect(p.options).toHaveLength(0);
    expect(p.notes.join(' ')).toMatch(/locks/i);
    const one = new Set(['t-bug-amateur-philosopher', 'delamain-cab']);
    const q = planUpgrades({ ...base, budget: 25, currency: 'USD', locks: one });
    expect(q.options.length).toBeGreaterThan(0);
    for (const o of q.options) for (const s of one) expect(o.cards[s] ?? 0).toBeGreaterThanOrEqual(heist.cards[s]);
  });

  it('keeps every option within budget, and strongest is never beaten by another in-budget option', () => {
    for (const [currency, budget] of [['USD', 10], ['CAD', 10], ['USD', 25]] as const) {
      const p = planUpgrades({ ...base, budget, currency });
      for (const o of p.options) expect(o.status).toBe('within');
      const strongest = p.options.find((o) => o.lenses.includes('strongest'))!;
      for (const o of p.options) expect(strongest.score).toBeGreaterThanOrEqual(o.score);
    }
  });

  it('a deck under $10 USD can be over $10 CAD, and switching currency recalculates', () => {
    const ep = starterByKey('embracing-power');
    const epBase = { legends: ep.legends, cards: ep.cards, owned: ownedFrom(starterEntries(ep, 'retail')) };
    const usd = planUpgrades({ ...epBase, budget: 10, currency: 'USD' });
    const pricey = usd.options.find((o) => budgetStatus(o.cost, 10, 'USD') === 'within' && budgetStatus(o.cost, 10, 'CAD') === 'over');
    expect(pricey, 'an option that fits $10 USD but not $10 CAD').toBeDefined();
    const cad = planUpgrades({ ...epBase, budget: 10, currency: 'CAD' });
    expect(cad.options.map((o) => JSON.stringify(o.cards))).not.toContain(JSON.stringify(pricey!.cards));
    for (const o of cad.options) expect(budgetStatus(o.cost, 10, 'CAD')).toBe('within');
  });

  it('counts copies the starting list was already missing in the finish cost', () => {
    const owned = new Map(heistOnly);
    owned.set('kiroshi-optics', 1); // the list runs 3
    const f = finishCost(heist.legends, heist.cards, owned);
    expect(f.lines.find((l) => l.slug === 'kiroshi-optics')?.buy).toBe(2);
    const p = planUpgrades({ ...base, owned, budget: 25, currency: 'USD' });
    expect(p.base.cost.knownCad).toBeGreaterThan(0);
    for (const o of p.options) expect(o.cost.knownCad).toBeCloseTo(finishCost(heist.legends, o.cards, owned).knownCad, 6);
  });

  it('never confirms a budget when a required purchase is unpriced, and never adds one', () => {
    const slug = 'kiroshi-optics';
    const ids = BY_SLUG.get(slug)!.printings.map((p) => p.id);
    const saved = Object.fromEntries(ids.map((id) => [id, PRICES.printings[id]]));
    for (const id of ids) delete PRICES.printings[id];
    _clearQuoteCache();
    try {
      expect(quoteFor(slug)).toBeNull();
      const owned = new Map(heistOnly);
      owned.set(slug, 1);
      const locks = new Set([slug]); // keep the unpriced copies in every option
      const p = planUpgrades({ ...base, owned, budget: 25, currency: 'USD', locks });
      expect(p.base.status).toBe('unknown');
      expect(p.base.cost.unpriced).toBe(2);
      for (const o of p.options) {
        expect(o.status).toBe('unknown');
        expect(o.cost.unpriced).toBe(2);
      }
      const free = planUpgrades({ ...base, owned: heistOnly, budget: 25, currency: 'USD' });
      for (const o of free.options) expect(o.cards[slug] ?? 0).toBeLessThanOrEqual(heist.cards[slug]); // never adds the unpriced card
    } finally {
      for (const id of ids) if (saved[id]) PRICES.printings[id] = saved[id];
      _clearQuoteCache();
    }
  });

  it('a $0 plan on a fully owned deck needs nothing, and a missing unpriced copy blocks a confirmed result', () => {
    const p = planUpgrades({ ...base, budget: 0, currency: 'CAD' });
    expect(p.base.cost.copies).toBe(0);
    expect(p.base.status).toBe('within');
    const slug = 'kiroshi-optics';
    const ids = BY_SLUG.get(slug)!.printings.map((x) => x.id);
    const saved = Object.fromEntries(ids.map((id) => [id, PRICES.printings[id]]));
    for (const id of ids) delete PRICES.printings[id];
    _clearQuoteCache();
    try {
      const owned = new Map(heistOnly);
      owned.set(slug, 2); // one copy short, and it has no quote
      const q = planUpgrades({ ...base, owned, budget: 0, currency: 'USD', locks: new Set([slug]) });
      expect(q.base.status).toBe('unknown');
      for (const o of q.options) expect(o.status).not.toBe('within');
    } finally {
      for (const id of ids) if (saved[id]) PRICES.printings[id] = saved[id];
      _clearQuoteCache();
    }
  });

  it('prices every purchase line with the shared estimator: same printing, basis and amount for search, budget and display', () => {
    const owned = new Map(heistOnly);
    owned.set('kiroshi-optics', 1); // a copy the starting list is already missing
    for (const currency of ['USD', 'CAD'] as const) {
      const p = planUpgrades({ ...base, owned, budget: 25, currency });
      for (const o of [{ cost: p.base.cost }, ...p.options])
        for (const l of o.cost.lines) {
          const q = acquireQuote(l.slug);
          expect(l.quote).toEqual(q);
          if (l.quote) expect(['Market', 'Low listing']).toContain(l.quote.basis); // never a valuation proxy
        }
      for (const o of p.options) {
        const known = o.cost.lines.reduce((a, l) => a + (l.quote ? l.quote.cad * l.buy : 0), 0);
        expect(o.cost.knownCad).toBeCloseTo(known, 6);
        expect(o.status).toBe(budgetStatus(o.cost, 25, currency));
      }
      // already-missing copies show up in the line items too
      expect(p.base.cost.lines.find((l) => l.slug === 'kiroshi-optics')?.buy).toBe(2);
    }
  });

  it('agrees with Meta Intel and the Deck Builder on the Legends + main-deck requirement', () => {
    const owned = new Map(heistOnly);
    owned.set('kiroshi-optics', 1);
    owned.set('jackie-welles-pour-one-out-for-me', 0);
    const planner = finishCost(heist.legends, heist.cards, owned);
    const meta = completion({ legends: heist.legends, cards: heist.cards }, owned).estimate;
    const builder = purchaseEstimate(deckNeed({ legends: heist.legends, cards: heist.cards }), owned);
    expect(meta).toEqual(planner);
    expect(builder).toEqual(planner);
    expect(planner.lines.map((l) => l.slug).sort()).toEqual(['jackie-welles-pour-one-out-for-me', 'kiroshi-optics']);
  });

  it('does not mutate the source deck and is deterministic', () => {
    const before = JSON.stringify(heist.cards);
    const a = planUpgrades({ ...base, budget: 10, currency: 'USD' });
    const b = planUpgrades({ ...base, budget: 10, currency: 'USD' });
    expect(JSON.stringify(heist.cards)).toBe(before);
    expect(JSON.stringify(a.options.map((o) => o.cards))).toBe(JSON.stringify(b.options.map((o) => o.cards)));
  });

  it('asks for three Legends instead of guessing', () => {
    const p = planUpgrades({ legends: heist.legends.slice(0, 2), cards: heist.cards, owned: heistOnly, budget: 10, currency: 'USD' });
    expect(p.ok).toBe(false);
    expect(p.notes[0]).toMatch(/three different Legends/);
  });
});
