import { describe, it, expect } from 'vitest';
import { formatDeckText, formatMeleeDeck } from '../deckDraft';
import { deckFromRecommended } from '../decks';
import { curatedOpponents, IMPORT_LIMIT, opponentIssues, readOpponentText } from './opponents';
import { prepareMatchDeck } from './matchDeck';
import { CARDS } from '../data';
import { engineCardId } from './engineSession';
import { isEngineSupported } from './engineCards';

describe('opponent lists', () => {
  it('offers every curated list as an independent, legal playable snapshot', () => {
    expect(curatedOpponents).toHaveLength(12);
    for (const { deck } of curatedOpponents) {
      expect(opponentIssues(deck)).toEqual([]);
      expect(prepareMatchDeck(deck).mainDeck.length).toBeGreaterThanOrEqual(40);
    }
    const copy = structuredClone(curatedOpponents[0].deck); copy.legends.pop();
    expect(curatedOpponents[0].deck.legends).toHaveLength(3);
  });
  it('keeps the lightweight engine manifest consistent with the real engine', () => {
    for (const card of CARDS.filter(card => card.legal === 'legal')) {
      expect(isEngineSupported(card.slug)).toBe(true);
      expect(engineCardId(card.slug)).toBeTruthy();
    }
    expect(isEngineSupported('future-card')).toBe(false);
  });
  it.each([formatDeckText, formatMeleeDeck])('reads exported lists without changing the card mix', format => {
    const original = deckFromRecommended('chrome-syndicate')!;
    const read = readOpponentText(format(original));
    expect(read.issues).toEqual([]);
    expect(read.deck).toMatchObject({ legends: original.legends, cards: original.cards, sideboard: {} });
  });
  it('rejects ambiguous card variants, unknown lines and oversized inputs rather than guessing', () => {
    const text = formatDeckText(deckFromRecommended('lowball-netrun-plus')!);
    expect(readOpponentText(text.replace('Jackie Welles: Pour One Out For Me', 'Jackie Welles')).issues.join()).toContain('full card name');
    expect(readOpponentText(text + '\n2 Made Up Card').issues.join()).toContain('Unrecognized line');
    expect(readOpponentText('x'.repeat(IMPORT_LIMIT + 1)).issues.join()).toContain('too large');
  });
  it('does not silently collapse extra Legend copies or duplicate lines', () => {
    const text = formatDeckText(deckFromRecommended('lowball-netrun-plus')!);
    expect(readOpponentText(text.replace('1 Jackie Welles:', '2 Jackie Welles:')).issues.join()).toContain('one copy');
    expect(readOpponentText(text+'\n1 Jackie Welles: Pour One Out For Me').issues.join()).toContain('Duplicate Legend');
    expect(readOpponentText(text.replace('1 Jackie Welles: Pour One Out For Me', '2 Jackie Welles: Pour One Out For Me (Retail)')).issues.join()).toContain('one copy');
    expect(readOpponentText(text.replace('1 Jackie Welles: Pour One Out For Me', '1 Jackie Welles (Retail)')).issues.join()).toContain('full card name');
  });
  it('reports illegal and unsupported lists, and excludes legal sideboards from the match', () => {
    const deck = deckFromRecommended('lowball-netrun-plus')!;
    expect(opponentIssues({ ...deck, cards: { ...deck.cards, 'future-card': 1 } }).join()).toContain('Not supported in Play Mode');
    expect(opponentIssues({ ...deck, cards: { 'floor-it': 40 } }).join()).toContain('Max 3 copies');
    const full = { ...deck, sideboard: { 'les-e-le-mens': 3, 'unlikely-bond': 3, 'pyramid-song': 1 } };
    expect(opponentIssues(full)).toEqual([]);
    expect(prepareMatchDeck(full).mainDeck).toEqual(prepareMatchDeck(deck).mainDeck);
  });
});
