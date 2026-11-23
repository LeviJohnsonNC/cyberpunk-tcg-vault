import { describe, expect, it, vi } from 'vitest';
import { LocalEngine, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { giveGig, placeCard, quietRivalFixture, type FixtureState } from '../../dev/combatFixtures';
import { plannerPosition } from '../../dev/plannerPositions';
import { botDecision, botDeckTypePrior, engineCardId } from './engineSession';
import { planTurn } from './coachPlanner';
import type { CoachPosition } from './coachTypes';
import { zoneCards } from './matchView';
import type { RivalSkill } from './protocol';

const attack = 'Attack the rival with Sketchy Ripper';
const radioport = 'Equip Arasaka Emergency Radioport to Sketchy Ripper';
const faceplate = 'Equip Zetatech Faceplate to Sketchy Ripper';

function decide(position: CoachPosition, skill: RivalSkill) {
  const state = structuredClone(position.checkpoint.state) as FixtureState;
  delete state.G.manualPaymentPlayerId;
  return botDecision(new LocalEngine(state), 'player', () => 0.5, skill, undefined,
    { deckTypePrior: botDeckTypePrior(position.setup.player.mainDeck) });
}

describe('equipment and attack sequencing', () => {
  it('compares the second purchase after a shared opener and stops the line at the attack', () => {
    const root = plannerPosition('Ripper before equipment');
    const fork = plannerPosition('Ripper after Radioport');
    const view = new LocalEngine(root.checkpoint.state).getFilteredView('player');
    const cardId = zoneCards(view.players.player, 'hand').find(c => c.cardName === 'Arasaka Emergency Radioport')!.instanceId;
    const attackerId = zoneCards(view.players.player, 'field')[0].instanceId;
    expect(planTurn(root).steps.map(s => s.title)).toEqual([radioport, attack]);
    expect(planTurn(fork).steps.map(s => s.title)).toEqual([attack]);
    for (const skill of ['sharp', 'masterful'] as const) {
      expect(decide(root, skill)).toMatchObject({ move: 'playCard', args: { cardId, attachToId: attackerId } });
      expect(decide(fork, skill)).toMatchObject({ move: 'attackRival', args: { attackerId } });
    }
  });

  it('buys Gear when its spend trigger can draw before combat or its power enables two steals', () => {
    const fork = plannerPosition('Ripper after Radioport');
    const state = fork.checkpoint.state as FixtureState;
    giveGig(state, 'player');
    state.G.gigDice[state.G.players.player.gigArea.at(-1)!].faceValue = 3;
    expect(planTurn(fork).steps.map(s => s.title)).toEqual([faceplate, attack]);
    expect(decide(fork, 'masterful')).toMatchObject({ move: 'playCard', args: {
      cardId: state.G.players.player.zones.hand.find(id => state.G.cardIndex[id].definitionId === engineCardId('zetatech-faceplate')),
    } });
    expect(planTurn(plannerPosition('Equip for two Gigs')).steps.map(s => s.title)).toEqual([
      'Equip Mantis Blades to MaxTac AV', 'Attack the rival with MaxTac AV',
    ]);
  });

  it('keeps the decision independent of concealed responses, crew slots, draws and the real roll stream', () => {
    const position = plannerPosition('Ripper after Radioport');
    const other = structuredClone(position);
    const { players, cardIndex } = other.checkpoint.state.G;
    const { deck, hand } = players.rival.zones;
    // Toggle Take Control in the six-card rival hand without changing its public size or list.
    const takeControl = engineCardId('take-control');
    const inHand = hand.filter(id => cardIndex[id].definitionId === takeControl);
    const swaps = inHand.length ? inHand : [hand[0]];
    for (const id of swaps) {
      const replacement = deck.find(d => (cardIndex[d].definitionId === takeControl) !== (inHand.length > 0))!;
      [cardIndex[id].definitionId, cardIndex[replacement].definitionId] = [cardIndex[replacement].definitionId, cardIndex[id].definitionId];
    }
    const [a, b] = players.player.zones.legendArea;
    [cardIndex[a].definitionId, cardIndex[b].definitionId] = [cardIndex[b].definitionId, cardIndex[a].definitionId];
    for (const seat of ['player', 'rival'] as const) players[seat].zones.deck.reverse();
    other.checkpoint.state.ctx.rngState = new SeededRNG('different unseen rolls').getState();

    expect(new LocalEngine(other.checkpoint.state).getFilteredView('player')).toEqual(
      new LocalEngine(position.checkpoint.state).getFilteredView('player'));
    expect(planTurn(other)).toEqual(planTurn(position));
    for (const skill of ['sharp', 'masterful'] as const) expect(decide(other, skill)).toEqual(decide(position, skill));
  });

  it('can attack at zero power to trigger a search when no Gear or blocker is available', () => {
    const { state, active, other } = quietRivalFixture('player');
    giveGig(state, other);
    const attackerId = placeCard(state, active, 'sketchy-ripper', 'field');
    for (const skill of ['sharp', 'masterful'] as const) {
      expect(botDecision(new LocalEngine(structuredClone(state)), active, () => 0.5, skill)).toMatchObject({
        move: 'attackRival', args: { attackerId },
      });
    }
  });

  it('scores a search attack before executing a speculative draw, even with an empty rival hand', () => {
    const position = plannerPosition('Ripper after Radioport');
    const state = position.checkpoint.state as FixtureState;
    const rival = state.G.players.rival;
    for (const id of rival.zones.hand.splice(0)) {
      rival.zones.deck.push(id);
      state.G.cardIndex[id].zone = 'deck';
    }
    // Remove rival responses so Ripper's own search is the first information boundary.
    rival.eddies = 0;
    rival.spentEddies = rival.eddieCardIds.length;
    for (const id of [...rival.eddieCardIds, ...rival.zones.legendArea]) state.G.cardIndex[id].meta.spent = true;
    const spy = vi.spyOn(LocalEngine.prototype, 'processCommand');
    try {
      expect(decide(position, 'masterful')?.move).toBe('attackRival');
      expect(spy.mock.calls.some(([command]) => command.move === 'attackRival')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
