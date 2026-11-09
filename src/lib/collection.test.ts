import { describe, expect, it } from 'vitest';
import { collectionCard, compareCollection } from './collection';
import { BY_SLUG, unspecifiedId, valueHolding } from './data';

const card = BY_SLUG.get('v-streetkid')!;
const retail = card.printings.find((p) => p.num === '005a')!;
const iconic = card.printings.find((p) => p.num === '144')!;
const holding = (printingId: string, qty: number) => ({ slug: card.slug, printingId, qty });

describe('collection binder model', () => {
  it('keeps a single held printing independent of the catalog and buy quote', () => {
    const row = collectionCard(card, [holding(iconic.id, 2)], 2);
    expect(row.cover?.printingId).toBe(iconic.id);
    expect(row.catalog.id).toBe(retail.id);
    expect(row.exact).toEqual(valueHolding(iconic.id));
    expect(row.value.knownCad).toBe(2 * valueHolding(iconic.id)!.cad);
    expect(row.quote?.printingId).not.toBe(iconic.id);
  });

  it('chooses a stable cover for mixed holdings and keeps unknown copies unpriced', () => {
    const entries = [holding(unspecifiedId(card.slug), 3), holding(iconic.id, 2), holding(retail.id, 2)];
    const row = collectionCard(card, entries, 7);
    expect(row.cover?.printingId).toBe(retail.id);
    expect(collectionCard(card, [...entries].reverse(), 7).cover).toEqual(row.cover);
    expect(row.exact).toBeNull();
    expect(row.unknownCopies).toBe(3);
    expect(row.value).toEqual({ copies: 7, unpriced: 3, knownCad: 2 * (valueHolding(iconic.id)!.cad + valueHolding(retail.id)!.cad) });
  });

  it('keeps unknown owned values last in both directions and separates buy estimates', () => {
    const priced = collectionCard(card, [holding(retail.id, 1)], 1);
    const unknown = collectionCard(card, [holding('legacy-id', 1)], 1);
    expect(unknown.cover).toBeUndefined();
    expect(unknown.value).toEqual({ copies: 1, unpriced: 1, knownCad: 0 });
    expect(unknown.quote).toEqual(priced.quote);
    expect(compareCollection(priced, unknown, { key: 'value', direction: 1 })).toBe(-1);
    expect(compareCollection(priced, unknown, { key: 'value', direction: -1 })).toBe(-1);
    expect(compareCollection(priced, unknown, { key: 'unit', direction: 1 })).toBe(0);
  });
});
