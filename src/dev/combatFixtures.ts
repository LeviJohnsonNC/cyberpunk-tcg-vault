/** Shared engine positions for the combat regressions and offline planner benchmark. */
import { LocalEngine, type EngineState } from '../../vendor/cyberpunk-engine/engine.mjs';
import starters from '../curated/starter-decks.json';
import { deckFromRecommended } from '../lib/decks';
import { botDecision, engineCardId, initialEngineState } from '../lib/play/engineSession';
import { prepareMatchDeck } from '../lib/play/matchDeck';
import type { MatchSetup, Seat } from '../lib/play/protocol';

export const combatSetup = {
  player: prepareMatchDeck({ ...starters.decks['the-heist'], sideboard: {} }),
  rival: prepareMatchDeck(deckFromRecommended('chrome-syndicate')!),
};

export function afterSetup(config: MatchSetup) {
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

export type FixtureState = EngineState & { G: {
  manualPaymentPlayerId?: Seat;
  overtime: boolean;
  turnMetadata: { activePlayerId: Seat; overtimeActive: boolean; turnNumber: number };
  players: Record<Seat, { eddies: number; spentEddies: number; eddieCardIds: string[]; fixerArea: string[]; gigArea: string[] }>;
  gigDice: Record<string, { location: string; faceValue: number; ownerId: Seat; dieType: string }>;
  cardIndex: Record<string, { zone: string; meta: { faceDown: boolean; spent: boolean; hasLag: boolean; attachedGearIds: string[]; attachedToId: string | null } }>;
} };

export function rulesFixture(desiredSeat?: Seat) {
  const { engine } = afterSetup(combatSetup);
  const active = engine.getFilteredView('player').activePlayerId;
  const other: Seat = active === 'player' ? 'rival' : 'player';
  const state = structuredClone(engine.getState()) as FixtureState;
  if (!desiredSeat || desiredSeat === active) return { state, active, other };
  state.G.turnMetadata.activePlayerId = desiredSeat;
  return { state, active: desiredSeat, other: active };
}

export function placeEddie(state: FixtureState, seat: Seat) {
  const id = placeCard(state, seat, 'floor-it', 'eddieArea');
  state.G.players[seat].eddieCardIds.push(id);
  state.G.players[seat].eddies++;
  return id;
}

export function giveGig(state: FixtureState, seat: Seat) {
  const { fixerArea, gigArea } = state.G.players[seat];
  const id = fixerArea.shift()!;
  Object.assign(state.G.gigDice[id], { location: 'gigArea', faceValue: 1 });
  gigArea.push(id);
}

export function placeCard(state: FixtureState, seat: Seat, slug: string, zone: string, spent = false) {
  const { zones } = state.G.players[seat];
  const id = zones.deck.shift()!;
  const card = state.G.cardIndex[id];
  card.definitionId = engineCardId(slug);
  card.zone = zone;
  Object.assign(card.meta, { faceDown: zone === 'eddieArea', spent, hasLag: false });
  zones[zone].push(id);
  return id;
}

export function quietRivalFixture(desiredSeat?: Seat) {
  const fixture = rulesFixture(desiredSeat);
  for (const seat of [fixture.active, fixture.other]) {
    const { hand, deck } = fixture.state.G.players[seat].zones;
    for (const id of hand.splice(0)) {
      deck.push(id);
      fixture.state.G.cardIndex[id].zone = 'deck';
    }
    for (const id of fixture.state.G.players[seat].zones.legendArea) fixture.state.G.cardIndex[id].meta.spent = true;
  }
  return fixture;
}

export function twoGigAttack(fightAvailable: boolean, seat?: Seat) {
  const { state, active, other } = quietRivalFixture(seat);
  for (let i = 0; i < 3; i++) giveGig(state, other);
  for (let i = 0; i < 4; i++) placeEddie(state, active);
  const attacker = placeCard(state, active, 'maxtac-av', 'field');
  const gear = placeCard(state, active, 'mantis-blades', 'hand');
  if (fightAvailable) placeCard(state, other, 'corpo-security', 'field', true);
  return { state, active, attacker, gear };
}

export function seventhGigAttack(seat?: Seat) {
  const { state, active, other } = quietRivalFixture(seat);
  while (state.G.players[active].fixerArea.length) giveGig(state, active);
  giveGig(state, other);
  const attacker = placeCard(state, active, 'psycho-squad', 'field');
  placeCard(state, other, 'corpo-security', 'field', true);
  return { state, active, attacker };
}
