import { describe, expect, it } from 'vitest';
import { BY_SLUG } from './data';
import { addDeckCard, formatDeckText, formatMeleeDeck, newDeck, readDeckText } from './deckDraft';
import { deckFromRecommended, validate } from './decks';

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

  it('keeps an imported promo Legend visible and reports the deck as illegal', () => {
    const deck = deckFromRecommended('lowball-netrun')!;
    const text = formatDeckText(deck).replace('Jackie Welles: Pour One Out For Me', 'Rebecca: Having a Moment');
    const imported = readDeckText(text);
    expect(imported.unknown).toEqual([]);
    expect(imported.deck.legends).toContain('rebecca-having-a-moment');
    expect(validate(imported.deck)).toMatchObject({ legal: false, issues: ['Not eligible for play: Rebecca: Having a Moment'] });
    expect(addDeckCard(newDeck(), BY_SLUG.get('rebecca-having-a-moment')!, 'cards')).toHaveProperty('error');
  });
});

describe('decklist formats', () => {
  const sections = {
    legends: ['alt-cunningham-soulkiller-architect'],
    cards: { 'jacked-in-voodoo-boy': 3, 'riot-shield': 2, 'les-e-le-mens': 3, 'nocturne-op55-n1': 2 },
    sideboard: { 'nocturne-op55-n1': 1, towerfall: 2 },
  };

  it('reads the title and grouped sections of a NetDeck Text List', () => {
    const imported = readDeckText(`# New Deck

// Legends (1)
1 Alt Cunningham: Soulkiller Architect

// Units (3)
3 Jacked-In Voodoo Boy

// Gears (2)
2 Riot Shield

// Programs (5)
3 Les Élémens
2 Nocturne OP55 N1

// Sideboard (3)
1 Nocturne OP55 N1
2 Towerfall`);
    expect(imported.unknown).toEqual([]);
    expect(imported.deck).toMatchObject({ name: 'New Deck', ...sections });
  });

  it('matches the official Melee format and round-trips its three sections', () => {
    const official = `MainDeck
3 Jacked-In Voodoo Boy
2 Riot Shield
3 Les Élémens
2 Nocturne OP55 N1

Legends
1 Alt Cunningham | Soulkiller Architect

Sideboard
1 Nocturne OP55 N1
2 Towerfall`;
    const exported = formatMeleeDeck({ ...newDeck(), ...sections });
    expect(exported).toBe(official);
    const imported = readDeckText(exported.replace('Les Élémens', 'Les Elemens').replaceAll('\n', '\r\n'));
    expect(imported.unknown).toEqual([]);
    expect(imported.deck).toMatchObject(sections);
  });

  it('accepts existing Vault lists and preserves titles that resemble section names', () => {
    const legacy = readDeckText('// Saved crew\n// Legends\n1 Alt Cunningham: Soulkiller Architect\n// Main\n2 Floor It\n// Sideboard: 1 card\n1 Floor It');
    expect(legacy.unknown).toEqual([]);
    expect(legacy.deck).toMatchObject({ name: 'Saved crew', cards: { 'floor-it': 2 }, sideboard: { 'floor-it': 1 } });
    const deck = { ...newDeck(), name: 'Units (14)', ...sections };
    expect(readDeckText(formatDeckText(deck)).deck).toMatchObject({ name: deck.name, ...sections });
  });
});
