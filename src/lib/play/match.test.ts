import { describe, expect, it } from 'vitest';
import { chooseMove, LocalEngine, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import type { EngineState } from '../../../vendor/cyberpunk-engine/engine.mjs';
import starters from '../../curated/starter-decks.json';
import { CARDS } from '../data';
import { deckFromRecommended } from '../decks';
import { botDecision, createEngineSession, engineCardId, initialEngineState, recordLegendPeeks } from './engineSession';
import { prepareMatchDeck } from './matchDeck';
import type { CardView, MatchSetup, Seat } from './protocol';
import { createMatchController } from './workerController';

const player = prepareMatchDeck({ ...starters.decks['the-heist'], sideboard: {} });
const setup = (id: string): MatchSetup => ({ player, rival: prepareMatchDeck(deckFromRecommended(id)!) });

function afterSetup(config: MatchSetup) {
  const engine = new LocalEngine(initialEngineState(config, 'vault-test-setup', 'test'));
  const preview = engine.getFilteredView('player');
  for (let n = 0; n < 12; n++) {
    if (engine.getFilteredView('player').gamePhase === 'main') return { engine, preview };
    const seats: Seat[] = ['player', 'rival'];
    const seat = seats.find((s) => ['action', 'choice'].includes(engine.getFilteredView(s).prompt.status));
    if (!seat) break;
    const move = botDecision(engine, seat, () => 0.3);
    if (!move) break;
    const result = engine.processCommand({
      commandID: `setup-${n}`, move: move.move, input: move.args ? { args: move.args } : undefined,
    }, seat);
    if (!result.success) throw new Error(result.error);
  }
  throw new Error('Expected both players to finish setup.');
}

describe('play engine', () => {
  it('maps every currently legal Vault card to a distinct playable engine definition', () => {
    const cards = CARDS.filter((card) => card.legal === 'legal');
    const mapped = cards.map((card) => engineCardId(card.slug));
    expect(new Set(mapped).size).toBe(cards.length);
    expect(() => engineCardId('not-in-the-catalog')).toThrow('No playable engine card');
  });

  it.each(['smasher-surge', 'chrome-syndicate', 'lowball-netrun-plus', 'nomad-convoy'])('finishes a real draft matchup against %s', (rivalId) => {
    const session = createEngineSession(setup(rivalId), { shuffle: `vault-match-${rivalId}`, bot: 'rival-test' });
    const rng = new SeededRNG('player-test');
    let snapshot = session.start();
    for (let step = 0; !snapshot.view.gameEnded && step < 200; step++) {
      const move = chooseMove(snapshot.view, () => rng.next(), 'player');
      expect(move?.move).toBeTruthy();
      expect(move?.move).not.toBe('concede');
      snapshot = session.move(snapshot.view.stateID, move!);
    }
    expect(snapshot.view.gameEnded).toBe(true);
    expect(snapshot.view.winReason).toMatch(/^(gig_victory|overtime_majority|deck_out_victory)$/);
  });

  it('keeps hidden card identities and pre-shuffle Legend IDs out of both seat projections', () => {
    const { engine, preview } = afterSetup(setup('chrome-syndicate'));
    const presented = new Set(Object.values(preview.players).flatMap(({ zones }) =>
      (zones.legendArea as CardView[]).map((card) => card.instanceId)));
    for (const seat of ['player', 'rival'] as const) {
      const other = seat === 'player' ? 'rival' : 'player';
      const view = engine.getFilteredView(seat);
      expect(typeof view.players[other].zones.hand).toBe('number');
      for (const owner of [seat, other] as const) {
        expect(typeof view.players[owner].zones.deck).toBe('number');
        const legends = view.players[owner].zones.legendArea as CardView[];
        expect(legends).toHaveLength(3);
        expect(legends.every((card) => card.faceDown && card.cardName === null && !card.definitionId && !presented.has(card.instanceId))).toBe(true);
      }
      const altered = structuredClone(engine.getState());
      changeHiddenCards(altered, other);
      const alternate = new LocalEngine(altered);
      expect(alternate.getFilteredView(seat)).toEqual(view);
      expect(botDecision(alternate, seat, () => 0.3)).toEqual(botDecision(engine, seat, () => 0.3));
    }
  });

  it('sends a private Legend peek only to its authorized viewer and marks the known slot', () => {
    const { engine } = afterSetup(setup('lowball-netrun-plus'));
    const state = engine.getState();
    const [slot] = state.G.players.player.zones.legendArea;
    const known = new Map<string, Set<Seat>>();
    const reveal = { type: 'cardsRevealed', audience: 'private', fromZone: 'legendArea', cardIds: [slot] } as const;
    const event = { ...reveal, cardIds: [...reveal.cardIds] };
    expect(recordLegendPeeks(state, [{ ...event, playerId: 'rival' }], known)).toEqual([]);
    expect([...known.get(slot)!]).toEqual(['rival']);
    expect(recordLegendPeeks(state, [{ ...event, playerId: 'rival', viewers: ['player'] }], known)[0]).toMatchObject({
      instanceId: slot, definitionId: state.G.cardIndex[slot].definitionId,
    });
    expect([...known.get(slot)!]).toEqual(['rival', 'player']);
    expect((engine.getFilteredView('player').players.player.zones.legendArea as CardView[])[0].definitionId).toBe('');
  });

  it('rejects an invalid draft before creating an engine match', () => {
    const draft = deckFromRecommended('heist-reloaded')!;
    const invalid = { ...draft, cards: { ...draft.cards, [draft.legends[0]]: 1 } };
    expect(() => prepareMatchDeck(invalid)).toThrow('Legends belong in the crew');
  });

  it('keeps the starting draft for rematch and rejects moves from an earlier match', () => {
    const respond = createMatchController();
    const original = structuredClone(setup('chrome-syndicate'));
    const opening = respond({ id: 1, action: { type: 'start', setup: original } });
    if (!('snapshot' in opening)) throw new Error(opening.error);
    original.player.legends.length = 0;
    original.player.mainDeck.length = 0;
    const firstId = opening.snapshot.matchId;
    const rematch = respond({ id: 2, action: { type: 'rematch', matchId: firstId } });
    if (!('snapshot' in rematch)) throw new Error(rematch.error);
    expect(rematch.snapshot.matchId).not.toBe(firstId);
    expect(rematch.snapshot.view.gameEnded).toBe(false);
    expect(rematch.snapshot.view.players.player.zones.legendArea).toHaveLength(3);
    expect(respond({ id: 3, action: { type: 'move', matchId: firstId, stateID: 0, move: { move: 'concede' } } })).toEqual({
      id: 3, error: 'That match is no longer active.',
    });
  });
});

function changeHiddenCards(state: EngineState, rival: Seat) {
  const { deck, hand } = state.G.players[rival].zones;
  const hiddenHandCard = state.G.cardIndex[hand[0]];
  const hiddenDeckCard = deck.map((id) => state.G.cardIndex[id]).find((card) => card.definitionId !== hiddenHandCard.definitionId)!;
  [hiddenHandCard.definitionId, hiddenDeckCard.definitionId] = [hiddenDeckCard.definitionId, hiddenHandCard.definitionId];
  for (const { zones } of Object.values(state.G.players)) {
    zones.deck.reverse();
    const cards = zones.legendArea.map((id) => state.G.cardIndex[id]);
    const last = cards.at(-1)!.definitionId;
    for (let i = cards.length - 1; i > 0; i--) cards[i].definitionId = cards[i - 1].definitionId;
    cards[0].definitionId = last;
  }
}
