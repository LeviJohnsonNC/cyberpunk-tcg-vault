/** Preview-only positions. Every prompt and submitted move is produced/validated by the real engine. */
import { LocalEngine, chooseMove, type EngineState } from '../../vendor/cyberpunk-engine/engine.mjs';
import starters from '../curated/starter-decks.json';
import { deckFromRecommended } from '../lib/decks';
import { createEngineSession, engineCardId, type EngineCheckpoint } from '../lib/play/engineSession';
import { prepareMatchDeck } from '../lib/play/matchDeck';
import type { MatchSnapshot, Seat } from '../lib/play/protocol';

export const decisionSetup = {
  player: prepareMatchDeck({ ...starters.decks['the-heist'], sideboard: {} }),
  rival: prepareMatchDeck(deckFromRecommended('chrome-syndicate')!),
};
const adjustmentSources = {
  'Gig adjustment': 'dexter-deshawn-one-last-chance',
  'Single Gig adjustment': 'dexter-deshawn-one-last-chance',
  'Increase a Gig': 'industrial-assembly',
  'Decrease a Gig': 'trust-no-one',
} as const;
export const decisionFixtures = ['Turn order', 'Opening hand', 'Gig die', 'Main turn', 'Crowded table', 'Reaction', 'Forced payment', 'Target effect', 'Order effects', 'Card placement',
  'Gig adjustment', 'Single Gig adjustment', 'Increase a Gig', 'Decrease a Gig', 'Overtime', 'Complete'] as const;
export type DecisionFixture = typeof decisionFixtures[number];
type Position = EngineState & { G: {
  manualPaymentPlayerId?: Seat; overtime: boolean;
  turnMetadata: { activePlayerId: Seat; overtimeActive: boolean };
  players: Record<Seat, { eddies: number; eddieCardIds: string[]; gigArea: string[]; fixerArea: string[] }>;
  gigDice: Record<string, { dieType: string; faceValue: number; location: string }>;
  cardIndex: Record<string, { zone: string; meta: { faceDown: boolean; spent: boolean; hasLag: boolean; attachedToId?: string } }>;
} };

export function createDecisionFixture(name: DecisionFixture) {
  let session = createEngineSession(decisionSetup, { shuffle: 'decision-bar-0', bot: 'decision-bar' });
  let snapshot = session.start();
  for (let seed = 1; snapshot.view.prompt.choice?.type !== 'chooseFirstPlayer' && seed < 30; seed++) {
    session = createEngineSession(decisionSetup, { shuffle: `decision-bar-${seed}`, bot: 'decision-bar' });
    snapshot = session.start();
  }
  if (name === 'Turn order') return { session, snapshot };
  snapshot = session.move(snapshot.view.stateID, { move: 'resolveFirstPlayer', args: { goFirst: true } });
  if (name === 'Opening hand') return { session, snapshot };
  snapshot = session.move(snapshot.view.stateID, { move: 'keepHand' });
  if (name === 'Gig die') return { session, snapshot };
  for (let n = 0; snapshot.view.prompt.choice && n < 15; n++) {
    const move = chooseMove(snapshot.view, () => .3, 'player');
    if (!move) throw new Error('Fixture could not finish setup.');
    snapshot = session.move(snapshot.view.stateID, move);
  }
  const checkpoint = structuredClone(session.checkpoint());
  const state = checkpoint.state as Position;
  state.G.turnMetadata.activePlayerId = 'player';
  // Discard the random opening hands so the fixture is repeatable.
  for (const seat of ['player', 'rival'] as const) {
    const zones = state.G.players[seat].zones;
    for (const id of zones.hand.splice(0)) { zones.trash.push(id); state.G.cardIndex[id].zone = 'trash'; }
    for (const id of zones.legendArea) state.G.cardIndex[id].meta.spent = false;
  }
  const place = (seat: Seat, slug: string, zone: string, spent = false) => {
    const zones = state.G.players[seat].zones;
    const id = zones.deck.shift()!;
    const card = state.G.cardIndex[id];
    card.definitionId = engineCardId(slug); card.zone = zone;
    Object.assign(card.meta, { faceDown: zone === 'eddieArea', spent, hasLag: false });
    zones[zone].push(id); return id;
  };
  const eddie = (seat: Seat) => {
    const id = place(seat, 'floor-it', 'eddieArea');
    state.G.players[seat].eddieCardIds.push(id); state.G.players[seat].eddies++; return id;
  };
  const attacker = place('rival', 'field-operator', 'field', name === 'Main turn' || name === 'Overtime');
  const defender = place('player', name === 'Reaction' ? 'mox-inciters' : 'corpo-security', 'field', name === 'Forced payment');
  place('player', 'delamain-cab', 'hand');
  place('player', 'floor-it', 'hand');
  place('player', 'kiroshi-optics', 'hand');
  eddie('player'); eddie('player');
  if (name === 'Crowded table') {
    const legend = state.G.players.player.zones.legendArea[0];
    state.G.cardIndex[legend].meta.faceDown = false;
    for (let index = 0; index < 8; index++) {
      const unit = place('player', 'corpo-security', 'field');
      const gear = place('player', 'kiroshi-optics', 'field');
      state.G.cardIndex[gear].meta.attachedToId = index < 3 ? legend : unit;
      place('player', 'floor-it', 'hand');
      eddie('rival');
    }
  }
  let program: string | undefined;
  if (name === 'Forced payment') {
    const legend = state.G.cardIndex[state.G.players.player.zones.legendArea[0]];
    legend.definitionId = engineCardId('jackie-welles-mama-s-favorite'); legend.meta.faceDown = false;
  }
  if (name === 'Target effect') program = place('player', 'floor-it', 'hand');
  if (name === 'Card placement') program = place('player', 'three-mouths-one-desire', 'hand');
  if (name in adjustmentSources) {
    // Stage the table, then play the actual card to generate its engine prompt.
    for (const seat of ['player', 'rival'] as const) {
      const player = state.G.players[seat];
      player.fixerArea.push(...player.gigArea.splice(0));
      for (const id of player.fixerArea) state.G.gigDice[id].location = 'fixerArea';
    }
    const putGig = (seat: Seat, type: string, value: number) => {
      const player = state.G.players[seat];
      const index = player.fixerArea.findIndex(id => state.G.gigDice[id].dieType === type);
      if (index < 0) throw new Error(`Fixture die ${type} is unavailable.`);
      const [id] = player.fixerArea.splice(index, 1);
      player.gigArea.push(id);
      Object.assign(state.G.gigDice[id], { location: 'gigArea', faceValue: value });
    };
    putGig('player', 'd4', 3);
    if (name !== 'Single Gig adjustment') putGig('rival', 'd12', 4);
    if (name === 'Increase a Gig' || name === 'Decrease a Gig') putGig('rival', 'd8', 5);
    if (name === 'Increase a Gig') {
      const legend = state.G.cardIndex[state.G.players.player.zones.legendArea[0]];
      legend.definitionId = engineCardId('yorinobu-arasaka-embracing-destruction');
    }
    program = place('player', adjustmentSources[name as keyof typeof adjustmentSources], 'hand');
  }
  if (name === 'Order effects') {
    place('player', 'misty-olszewski-mender-of-broken-spirits', 'field');
    place('player', 'misty-olszewski-mender-of-broken-spirits', 'field');
  }
  if (name === 'Overtime') { state.G.overtime = true; state.G.turnMetadata.overtimeActive = true; }
  if (name === 'Reaction' || name === 'Forced payment') state.G.turnMetadata.activePlayerId = 'rival';
  if (program) state.G.manualPaymentPlayerId = undefined;
  const engine = new LocalEngine(state);
  const issue = (seat: Seat, move: string, args: Record<string, unknown> = {}) => {
    const result = engine.processCommand({ commandID: `fixture-${move}`, move, input: { args } }, seat);
    if (!result.success) throw new Error(result.error);
  };
  if (name === 'Reaction') issue('rival', 'attackRival', { attackerId: attacker });
  if (name === 'Forced payment') {
    issue('rival', 'attackUnit', { attackerId: attacker, defenderId: defender });
    if (engine.getFilteredView('player').attackState?.step === 'react') issue('player', 'resolveAttack', { pass: true });
  }
  if (program) issue('player', 'playCard', { cardId: program });
  if (name === 'Order effects') issue('player', 'passPhase');
  if (name === 'Complete') issue('player', 'concede');
  checkpoint.state = engine.getState();
  (checkpoint.state as Position).G.manualPaymentPlayerId = 'player';
  session = createEngineSession(decisionSetup, undefined, checkpoint);
  return { session, snapshot: session.start() };
}

const saveKey = 'qa:command-bar:checkpoint';
export function saveDecisionFixture(session: ReturnType<typeof createEngineSession>) {
  const checkpoint = session.checkpoint();
  localStorage.setItem(saveKey, JSON.stringify({ ...checkpoint, known: [...checkpoint.known].map(([id, seats]) => [id, [...seats]]) }));
}
export function resumeDecisionFixture(): { session: ReturnType<typeof createEngineSession>; snapshot: MatchSnapshot } {
  const saved = JSON.parse(localStorage.getItem(saveKey) ?? 'null');
  if (!saved) return createDecisionFixture('Turn order');
  const checkpoint: EngineCheckpoint = { ...saved, known: new Map(saved.known.map(([id, seats]: [string, Seat[]]) => [id, new Set(seats)])) };
  const session = createEngineSession(decisionSetup, undefined, checkpoint);
  return { session, snapshot: session.start() };
}
