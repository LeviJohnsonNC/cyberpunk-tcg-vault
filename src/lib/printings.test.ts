import { describe, expect, it } from 'vitest';
import sample from '../../public/imports/levi-collection.json';
import { BY_SLUG, editionPrinting, isUnspecified, normalizePrinting, printingLabel, unspecifiedId, valueHolding } from './data';
import { mergeEntries, type Entry } from './store';
import { buildPriceBook } from './pricebook';

const psycho = BY_SLUG.get('psycho-squad')!;
const jackie = BY_SLUG.get('jackie-welles-pour-one-out-for-me')!;

describe('printing identity', () => {
  it('keeps valid printing ids and turns unknown or mismatched ones into the card-specific unspecified id', () => {
    const real = psycho.printings[0].id;
    expect(normalizePrinting('psycho-squad', real)).toBe(real);
    expect(normalizePrinting('psycho-squad', jackie.printings[0].id)).toBe(unspecifiedId('psycho-squad')); // another card's printing
    expect(normalizePrinting('psycho-squad', 'nonsense')).toBe(unspecifiedId('psycho-squad'));
    expect(normalizePrinting('psycho-squad', unspecifiedId('psycho-squad'))).toBe(unspecifiedId('psycho-squad'));
    expect(unspecifiedId('psycho-squad')).not.toBe(unspecifiedId('delamain-cab')); // different cards never collide
  });
  it('labels unspecified holdings consistently and leaves them unpriced', () => {
    expect(isUnspecified(unspecifiedId('psycho-squad'))).toBe(true);
    expect(printingLabel(unspecifiedId('psycho-squad'))).toBe('Printing unspecified');
    expect(valueHolding(unspecifiedId('psycho-squad'))).toBeNull();
    const pb = buildPriceBook([{ slug: 'psycho-squad', printingId: unspecifiedId('psycho-squad'), qty: 2 }]);
    expect(pb.lines[0]).toMatchObject({ unit: null, total: null, basis: null });
    expect(pb.unpriced).toBe(2);
  });
  it('maps Retail and Beta to the base-rarity printing in the main release, or the starter for starter-only cards', () => {
    expect(editionPrinting('psycho-squad', 'Retail')?.set).toBe('Welcome to Night City — Retail');
    expect(editionPrinting('psycho-squad', 'Beta')?.set).toBe('Welcome to Night City — Beta');
    expect(editionPrinting(jackie.slug, 'Retail')?.set).toBe('The Heist — Retail Starter Deck');
    expect(editionPrinting(jackie.slug, 'Beta')?.set).toBe('The Heist — Beta Starter Deck');
  });
});

describe('collection merge and v1 import compatibility', () => {
  it('imports a v1 export unchanged: quantities, notes and valid printing ids preserved', () => {
    const v1 = sample.entries as Entry[];
    const merged = mergeEntries([], v1, 'add');
    const total = (es: Entry[]) => es.reduce((a, e) => a + e.qty, 0);
    expect(total(merged)).toBe(total(v1));
    for (const e of v1) expect(merged.find((m) => m.printingId === e.printingId)?.qty).toBeGreaterThanOrEqual(e.qty);
  });
  it('keeps copies with a bad printing id as unspecified instead of dropping them, and keeps their note', () => {
    const merged = mergeEntries([], [{ slug: 'psycho-squad', printingId: 'gone-123', qty: 2, note: 'from a trade' }], 'add');
    expect(merged).toEqual([{ slug: 'psycho-squad', printingId: unspecifiedId('psycho-squad'), qty: 2, note: 'from a trade' }]);
  });
  it('adds a second unspecified batch of the same card onto the same holding, separate from verified printings', () => {
    const retail = editionPrinting('psycho-squad', 'Retail')!.id;
    const a = mergeEntries([], [{ slug: 'psycho-squad', printingId: retail, qty: 1 }], 'add');
    const b = mergeEntries(a, [{ slug: 'psycho-squad', printingId: unspecifiedId('psycho-squad'), qty: 1 }, { slug: 'psycho-squad', printingId: unspecifiedId('psycho-squad'), qty: 2 }], 'add');
    expect(b.find((e) => e.printingId === retail)?.qty).toBe(1);
    expect(b.find((e) => isUnspecified(e.printingId))?.qty).toBe(3);
    // playable ownership is per card, so all 4 copies count for deck building
    expect(b.filter((e) => e.slug === 'psycho-squad').reduce((n, e) => n + e.qty, 0)).toBe(4);
  });
});
