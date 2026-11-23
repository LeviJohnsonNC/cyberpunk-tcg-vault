// Offline positions for comparing the same decision across Ask Coach and all three rivals.
import { LocalEngine, SeededRNG, type EngineState } from '../../vendor/cyberpunk-engine/engine.mjs';
import { deckFromRecommended } from '../lib/decks';
import type { CoachPosition } from '../lib/play/coachTypes';
import { engineCardId, initialEngineState } from '../lib/play/engineSession';
import { prepareMatchDeck } from '../lib/play/matchDeck';
import { zoneCards } from '../lib/play/matchView';
import type { MatchSetup, Move, Seat } from '../lib/play/protocol';
import { combatSetup, giveGig, seventhGigAttack, twoGigAttack } from './combatFixtures';
import { createDecisionFixture, decisionSetup } from './decisionFixtures';

export const plannerCases = [
  'Ripper before equipment', 'Ripper after Radioport', 'Equip for two Gigs',
  'Opening hand', 'Mulligan expensive hand', 'Gig die', 'Block a Gig attack', 'Win in overtime',
] as const;
export type PlannerCase = typeof plannerCases[number];

function position(setup: MatchSetup, state: EngineState): CoachPosition {
  return { setup, checkpoint: {
    matchId: 'planner-baseline', state, commandNumber: state.ctx.stateID,
    known: new Map(), peeks: [], log: [], botRng: new SeededRNG('planner-decisions-v1').getState(),
  } };
}

function apply(engine: LocalEngine, seat: Seat, move: Move) {
  const result = engine.processCommand({ commandID: String(engine.getState().ctx.stateID), move: move.move,
    input: { args: move.args ?? {} } }, seat);
  if (!result.success) throw new Error(`Fixture ${seat} ${move.move}: ${result.error}`);
}

const hand = ['johnny-silverhand-never-stop-fighting', 'secondhand-bombus', 'rockn-rockerboy',
  'zetatech-faceplate', 'arasaka-emergency-radioport', 'secondhand-bombus'];
const ripper = 'sketchy-ripper';

// The unpublished YYR list is unknown. Use the legal curated Smasher/River/Viktor list,
// substituting three cards to match the pictured hand. BBG uses its actual curated list.
function ripperSetup(): MatchSetup {
  const base = deckFromRecommended('smasher-river-viktor')!;
  const cards = { ...base.cards, '6th-street-recruits': 0, 'maxtac-suppression-team': 0,
    'secondhand-bombus': 2, 'rockn-rockerboy': 1 };
  return {
    player: prepareMatchDeck({ ...base, cards }), rival: prepareMatchDeck(deckFromRecommended('baby-girl-bbg')!),
  };
}

// Deal real copies from the registered deck; duplicate names must consume distinct cards.
function setOpeningDraws(state: EngineState, seat: Seat, slugs: string[]) {
  const { deck } = state.G.players[seat].zones;
  const top = slugs.map(slug => {
    const index = deck.findIndex(id => state.G.cardIndex[id].definitionId === engineCardId(slug));
    if (index < 0) throw new Error(`Missing ${seat} fixture card ${slug}`);
    return deck.splice(index, 1)[0];
  });
  deck.unshift(...top);
}

function deal(setup: MatchSetup, seed: string, playerTop: string[], rivalTop: string[] = []) {
  const state = initialEngineState(setup, seed, 'planner-baseline');
  setOpeningDraws(state, 'player', playerTop);
  setOpeningDraws(state, 'rival', rivalTop);
  const engine = new LocalEngine(state);
  const chooser = engine.getFilteredView('player').activePlayerId;
  apply(engine, chooser, { move: 'resolveFirstPlayer', args: { goFirst: chooser === 'player' } });
  return engine;
}

function ripperTurn(afterRadioport: boolean) {
  const setup = ripperSetup();
  const sold = 'mantis-blades';
  // This deal seed naturally rolls d12=8, d4=2 and d10=1 in turn order.
  const engine = deal(setup, 'ripper-deal-835', [ripper, sold, ...hand], ['peace-offering']);
  const play = (seat: Seat, move: string, args?: Record<string, unknown>) => apply(engine, seat, { move, args });
  const cards = (seat: Seat, zone: string) => zoneCards(engine.getFilteredView(seat).players[seat], zone);
  const inHand = (seat: Seat, slug: string) => {
    const card = cards(seat, 'hand').find(c => c.definitionId === engineCardId(slug));
    if (!card) throw new Error(`Expected ${slug} in ${seat}'s hand`);
    return card.instanceId;
  };
  const roll = (seat: Seat, die: string) => play(seat, 'gainGig',
    { dieId: cards(seat, 'fixerArea').find(c => c.definitionId === die)!.instanceId });
  play('player', 'keepHand');
  play('rival', 'keepHand');
  roll('player', 'd12');
  play('player', 'sellCard', { cardId: inHand('player', sold) });
  const host = inHand('player', ripper);
  play('player', 'playCard', { cardId: host });
  play('player', 'passPhase');
  roll('rival', 'd4');
  play('rival', 'sellCard', { cardId: inHand('rival', 'peace-offering') });
  const slot = cards('rival', 'legendArea')[0].instanceId;
  play('rival', 'callLegend', { legendId: slot, paymentSourceIds: [slot] });
  play('rival', 'passPhase');
  roll('player', 'd10');

  if (afterRadioport) {
    const eddie = cards('player', 'eddieArea')[0];
    const legend = cards('player', 'legendArea')[0];
    play('player', 'playCard', { cardId: inHand('player', 'arasaka-emergency-radioport'),
      attachToId: host, paymentSourceIds: [eddie.instanceId, legend.instanceId] });
  }
  return position(setup, engine.getState());
}

export function plannerPosition(name: PlannerCase): CoachPosition {
  switch (name) {
    case 'Ripper before equipment': return ripperTurn(false);
    case 'Ripper after Radioport': return ripperTurn(true);
    case 'Equip for two Gigs': return position(combatSetup, twoGigAttack(true, 'player').state);
    case 'Win in overtime': {
      const { state } = seventhGigAttack('player');
      while (state.G.players.rival.fixerArea.length) giveGig(state, 'rival');
      state.G.overtime = true;
      Object.assign(state.G.turnMetadata, { overtimeActive: true, turnNumber: 15,
        previousTurnBeganWithEmptyFixer: true, turnBeganWithEmptyFixer: true });
      return position(combatSetup, state);
    }
    case 'Mulligan expensive hand': {
      const setup = { ...combatSetup, player: prepareMatchDeck(deckFromRecommended('jackie-padre-streetkid')!) };
      const top = Array<string>(3).fill('johnny-silverhand-never-stop-fighting').concat(Array<string>(3).fill('maxtac-av'));
      return position(setup, deal(setup, 'expensive-opening', top).getState());
    }
    default: return { setup: decisionSetup, checkpoint: createDecisionFixture(name).session.checkpoint() };
  }
}
