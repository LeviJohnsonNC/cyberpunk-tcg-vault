import { describe, expect, it } from 'vitest';
import { CARDS } from './data';
import { isIconicPrinting } from './iconicFoil';

describe('Iconic foil eligibility', () => {
  it.each([
    ['rogue-amendiares-queen-of-the-afterlife', '126', false],
    ['rogue-amendiares-queen-of-the-afterlife', '166', true],
    ['rogue-amendiares-queen-of-the-afterlife', 'β126', false],
    ['rogue-amendiares-queen-of-the-afterlife', 'β166', true],
    ['towerfall', '138', false],
    ['towerfall', '167', true],
    ['adam-smasher-ender-of-legends', '141', true],
    ['johnny-silverhand-rocking-renegade', '003', false],
    ['johnny-silverhand-rocking-renegade', '168', true],
    ['maman-brigitte-spirit-of-death', '037', false],
  ])('checks %s #%s by its own printing', (slug, number, eligible) => {
    const printing = CARDS.find(card => card.slug === slug)?.printings.find(candidate => candidate.num === number);
    expect(printing).toBeDefined();
    expect(isIconicPrinting(printing!.id)).toBe(eligible);
  });

  it('requires a known printing ID', () => {
    expect(isIconicPrinting('towerfall')).toBe(false);
    expect(isIconicPrinting('')).toBe(false);
  });
});
