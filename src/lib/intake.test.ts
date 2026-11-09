import { describe, expect, it } from 'vitest';
import { CARDS, defaultPrinting, MAX_PRINTING_COPIES, unspecifiedId } from './data';
import { previewVaultImport, readVaultFile, searchIntake } from './intake';
import { mergeEntries } from './store';

const card = CARDS.find((item) => item.name === 'Alt Cunningham')!;
const slug = card.slug;
const printingId = defaultPrinting(card).id;

describe('Add Cards search', () => {
  it('ranks the exact card name ahead of text matches', () => {
    const matches = searchIntake('V');
    expect(matches.slice(0, 3).map((hit) => hit.card.name)).toEqual(['V', 'V', 'V']);
  });

  it('selects the numbered printing when searching for a Beta collector number', () => {
    const printing = card.printings.find((item) => item.num.startsWith('β'))!;
    const hit = searchIntake(`#${printing.num}`).find((match) => match.card.slug === slug);
    expect(hit?.printingId).toBe(printing.id);
  });
});

describe('Vault file import preview', () => {
  it('validates and groups both export shapes and retains unresolved printings as unspecified', () => {
    const entries = [
      { slug, printingId, qty: 2, note: 'Original' },
      { slug, printingId, qty: '3' },
      { slug, printingId: 'unknown', qty: 1 },
      { slug, printingId: unspecifiedId(slug), qty: 1 },
      { slug, printingId, qty: 0.5 },
      { slug: 'unknown', printingId, qty: 10 },
      null,
    ];
    const draft = readVaultFile({ entries });
    expect(readVaultFile(entries)).toEqual(draft);
    expect(draft).toMatchObject({
      skipped: 3, unverified: 1,
      items: [{ slug, printingId, qty: 5, note: 'Original' }, { slug, printingId: unspecifiedId(slug), qty: 2 }],
    });
    expect(() => readVaultFile({ entries: {} })).toThrow();
  });

  it('shows the quantities that will actually be saved, including duplicates and the holding limit', () => {
    const base = [{ slug, printingId, qty: MAX_PRINTING_COPIES - 2, note: 'Existing' }];
    const { items } = readVaultFile([{ slug, printingId, qty: 7, note: 'Replacement' }]);
    const preview = previewVaultImport(items, base);
    expect(preview).toMatchObject({
      total: 2, capped: 1, rows: [{ before: MAX_PRINTING_COPIES - 2, fromFile: 7, after: MAX_PRINTING_COPIES, noteChanges: true }],
    });
    expect(mergeEntries(base, preview.additions, 'add')).toEqual([{ slug, printingId, qty: MAX_PRINTING_COPIES, note: 'Replacement' }]);
    expect(previewVaultImport(items, mergeEntries(base, preview.additions, 'add')).additions).toEqual([]);
    expect(base[0].qty).toBe(MAX_PRINTING_COPIES - 2);
  });
});
