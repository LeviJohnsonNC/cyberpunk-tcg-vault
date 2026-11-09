import { describe, expect, it } from 'vitest';
import { BY_SLUG } from './data';
import { addDeckCard, formatDeckText, newDeck, readDeckText } from './deckDraft';

describe('deck workbench edits', () => {
  it('adds only to the requested zone and caps copies across both', () => {
    const deck = { ...newDeck(), cards: { 'floor-it': 1 }, sideboard: { 'floor-it': 1 } };
    const card = BY_SLUG.get('floor-it')!;
    const result = addDeckCard(deck, card, 'cards');
    expect(result).toMatchObject({ destination: 'cards', deck: { cards: { 'floor-it': 2 }, sideboard: { 'floor-it': 1 } } });
    if ('deck' in result) expect(addDeckCard(result.deck, card, 'sideboard')).toHaveProperty('error');
  });

  it('always adds Legends to the crew and round-trips a list with a sideboard', () => {
    const deck = { ...newDeck(), name: 'Main Event', cards: { 'psycho-squad': 3 }, sideboard: { 'floor-it': 1 } };
    const result = addDeckCard(deck, BY_SLUG.get('v-corporate-exile')!, 'sideboard');
    expect(result).toMatchObject({ destination: 'crew', deck: { legends: ['v-corporate-exile'] } });
    if ('deck' in result) {
      const imported = readDeckText(formatDeckText(result.deck));
      expect(imported.unknown).toEqual([]);
      expect(imported.deck).toMatchObject({ name: deck.name, legends: result.deck.legends, cards: deck.cards, sideboard: deck.sideboard });
    }
  });
});
