import { describe, expect, it } from 'vitest';
import { printingForVariant, printingVariant, printingVariants, type PrintingVariant } from './cardPrintingVariants';
import { BY_SLUG } from './data';

describe('drawer printing variants', () => {
  it.each<[string, PrintingVariant[], number]>([
    ['towerfall', ['Regular', 'Iconic'], 4],
    ['6th-street-recruits', ['Regular'], 2],
    ['secondhand-bombus', ['Regular', 'Nova', 'Judge'], 8],
    ['johnny-silverhand-rocking-renegade', ['Regular', 'Iconic', 'Nova'], 5],
    ['rebecca-having-a-moment', ['Nova'], 2],
    ['adam-smasher-ender-of-legends', ['Regular', 'Iconic', 'Nova'], 8],
  ])('uses the catalog for %s', (slug, variants, count) => {
    const { printings } = BY_SLUG.get(slug)!;
    expect(printings).toHaveLength(count);
    expect(printingVariants(printings)).toEqual(variants);
  });

  it('gives verified Judge stamps precedence over the Nova rarity', () => {
    for (const [slug, collectorNumber] of [['maman-brigitte-spirit-of-death', '037'], ['sandevistan', '005']]) {
      const { printings } = BY_SLUG.get(slug)!;
      const judge = printings.find((p) => p.num === collectorNumber)!;
      expect(judge.rarity).toBe('Nova Rare');
      expect(printingVariant(judge)).toBe('Judge');
      expect(printingVariant(printings.find((p) => p.set === judge.set && p.id !== judge.id)!)).toBe('Nova');
    }
  });

  it('matches the edition on the first switch and restores a remembered selection', () => {
    const { printings } = BY_SLUG.get('towerfall')!;
    const betaRegular = printings.find((p) => p.num === 'β138')!;
    const retailIconic = printings.find((p) => p.num === '167')!;
    expect(printingForVariant(printings, 'Iconic', betaRegular)?.num).toBe('β167');
    expect(printingForVariant(printings, 'Iconic', betaRegular, retailIconic.id)).toBe(retailIconic);
    expect(printingForVariant(printings, 'Iconic', betaRegular, betaRegular.id)?.num).toBe('β167');
    expect(printingForVariant(printings, 'Judge', betaRegular)).toBeUndefined();
  });
});
