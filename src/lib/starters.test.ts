import { describe, expect, it } from 'vitest';
import { PRINTING_INDEX } from './data';
import { validate } from './decks';
import { looksAlreadyLogged, starterAsDeck, starterByKey, starterCardCount, starterEntries, STARTERS } from './starters';

describe('starter decks', () => {
  it('match the official shape: 3 Legends + 40 cards, 17 distinct', () => {
    expect(STARTERS.map((s) => s.key).sort()).toEqual(['embracing-power', 'the-heist']);
    for (const s of STARTERS) {
      expect(s.legends).toHaveLength(3);
      expect(Object.keys(s.cards)).toHaveLength(17);
      expect(starterCardCount(s)).toBe(43);
    }
  });
  it('are legal constructed decks as they come out of the box', () => {
    for (const s of STARTERS) expect(validate({ ...starterAsDeck(s), sideboard: {} }).legal).toBe(true);
  });
  it('use real printings from the matching starter set for both editions', () => {
    for (const s of STARTERS)
      for (const ed of ['retail', 'beta'] as const)
        for (const e of starterEntries(s, ed)) {
          const hit = PRINTING_INDEX.get(e.printingId);
          expect(hit, `${s.key} ${ed} ${e.slug}`).toBeDefined();
          expect(hit!.card.slug).toBe(e.slug);
          expect(hit!.printing.set).toBe(`${s.name} — ${ed === 'retail' ? 'Retail' : 'Beta'} Starter Deck`);
        }
  });
  it('flags a starter that is already logged, but not partial overlap', () => {
    const heist = starterByKey('the-heist');
    const full = starterEntries(heist, 'retail');
    expect(looksAlreadyLogged([], heist, 'retail')).toBe(false);
    expect(looksAlreadyLogged(full.slice(0, 10), heist, 'retail')).toBe(false); // booster overlap
    expect(looksAlreadyLogged(full, heist, 'retail')).toBe(true);
    expect(looksAlreadyLogged(full, heist, 'beta')).toBe(false); // different edition
  });
});
