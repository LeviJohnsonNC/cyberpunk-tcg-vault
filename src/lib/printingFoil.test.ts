import { describe, expect, it } from 'vitest';
import { CARDS } from './data';
import { printingFoilFinish } from './printingFoil';

describe('Printing foil eligibility', () => {
  it.each([
    ['rogue-amendiares-queen-of-the-afterlife', '126', undefined],
    ['rogue-amendiares-queen-of-the-afterlife', '166', 'iconic'],
    ['rogue-amendiares-queen-of-the-afterlife', 'β126', undefined],
    ['rogue-amendiares-queen-of-the-afterlife', 'β166', 'iconic'],
    ['towerfall', '138', undefined],
    ['towerfall', '167', 'iconic'],
    ['adam-smasher-ender-of-legends', '141', 'iconic'],
    ['adam-smasher-ender-of-legends', '029', 'nova'],
    ['johnny-silverhand-rocking-renegade', '003', undefined],
    ['johnny-silverhand-rocking-renegade', '168', 'iconic'],
    ['johnny-silverhand-rocking-renegade', '031', 'nova'],
    ['maman-brigitte-spirit-of-death', '015', 'nova'],
    ['maman-brigitte-spirit-of-death', '037', undefined],
    ['rebecca-having-a-moment', '005', 'nova'],
    ['goro-takemura-hands-unclean', 'β003', 'nova'],
  ] as const)('checks %s #%s by its own printing', (slug, number, finish) => {
    const printing = CARDS.find(card => card.slug === slug)?.printings.find(candidate => candidate.num === number);
    expect(printing).toBeDefined();
    expect(printingFoilFinish(printing!.id)).toBe(finish);
  });

  it('requires a known printing ID', () => {
    expect(printingFoilFinish('towerfall')).toBeUndefined();
    expect(printingFoilFinish('')).toBeUndefined();
  });
});
