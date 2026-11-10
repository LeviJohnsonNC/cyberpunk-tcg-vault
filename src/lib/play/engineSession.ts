import { chooseMove, createCardCatalog, createMatchState, LocalEngine, projectRevealedCardView, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import type { EngineEvent, EngineState } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { describeAction, hideConcealedTargets } from './matchView';
import type { CardView, MatchLogEntry, MatchSetup, MatchSnapshot, Move, Seat } from './protocol';

const catalog = createCardCatalog();
const cardAliases: Record<string, string> = {
  'el-sombrero-n-la-venganza-lenta': 'el-sombreron-la-venganza-lenta',
  'gilded-mato-n': 'gilded-maton',
  'judy-a-lvarez-braindance-maestro': 'judy-alvarez-braindance-maestro',
  'judy-a-lvarez-nothing-to-doubt': 'judy-alvarez-nothing-to-doubt',
  'les-e-le-mens': 'les-elemens',
  'lucyna-kushinada-fresh-beginnings': 'lucyna-kushinada',
  'muamar-reyes-el-capita-n': 'muamar-reyes-el-capitan',
};

export function engineCardId(slug: string) {
  const card = catalog.get(cardAliases[slug] ?? slug);
  if (card?.legality !== 'legal') throw new Error(`No playable engine card for ${slug}`);
  return card.id;
}

const seats = ['player', 'rival'] as const;

export function initialEngineState(setup: MatchSetup, seed: string, matchId: string) {
  return createMatchState({
    players: seats.map(seat => ({ id: seat, name: setup[seat].name })),
    deckLists: seats.map(seat => ({
      playerId: seat,
      playerName: setup[seat].name,
      legends: setup[seat].legends.map(engineCardId),
      mainDeck: setup[seat].mainDeck.map(engineCardId),
    })),
    catalog, seed, matchId,
  });
}

export function botDecision(engine: LocalEngine, seat: Seat, rng: () => number) {
  const view = hideConcealedTargets(engine.getFilteredView(seat));
  if (view.prompt.status === 'choice' || view.prompt.status === 'action') {
    return chooseMove(view, rng, seat);
  }
}

export function recordLegendPeeks(state: EngineState, events: EngineEvent[], known: Map<string, Set<Seat>>): CardView[] {
  const peeks: CardView[] = [];
  for (const event of events) {
    if (event.type !== 'cardsRevealed' || event.fromZone !== 'legendArea' || event.audience !== 'private') continue;
    const viewers = event.viewers ?? [event.playerId];
    for (const id of event.cardIds) {
      const informed = known.get(id) ?? new Set<Seat>();
      for (const viewer of viewers) informed.add(viewer);
      known.set(id, informed);
      if (viewers.includes('player')) {
        const peek = projectRevealedCardView(state, id);
        if (peek) peeks.push(peek);
      }
    }
  }
  return peeks;
}

export function createEngineSession(
  setup: MatchSetup,
  seeds: { shuffle: string; bot: string } = { shuffle: crypto.randomUUID(), bot: crypto.randomUUID() },
) {
  const matchId = crypto.randomUUID();
  const engine = new LocalEngine(initialEngineState(setup, seeds.shuffle, matchId));
  const botRng = new SeededRNG(seeds.bot);
  const known = new Map<string, Set<Seat>>();
  let peeks: CardView[] = [];
  const log: MatchLogEntry[] = [];
  let commandNumber = 0;
  let stalled = false;

  function apply(seat: Seat, command: Move) {
    const prompt = engine.getFilteredView(seat).prompt;
    if (!prompt.availableMoves.some(({ moveId }) => moveId === command.move)) {
      throw new Error('That action is no longer available.');
    }
    const before = engine.getFilteredView('player');
    const result = engine.processCommand({
      commandID: String(++commandNumber),
      move: command.move,
      input: command.args ? { args: command.args } : undefined,
    }, seat);
    if (!result.success) throw new Error(result.error);
    const after = engine.getFilteredView('player');
    const text = describeAction(seat, command, before, after);
    if (text) {
      log.push({ id: commandNumber, turn: before.turnNumber, seat, text });
      if (log.length > 80) log.shift();
    }
    if (seat === 'player') peeks = [];
    peeks.push(...recordLegendPeeks(result.state, result.gameEvents, known));
  }

  function advance(): MatchSnapshot {
    try {
      for (let actions = 0; actions < 200; actions++) {
        const view = hideConcealedTargets(engine.getFilteredView('player'));
        if (view.gameEnded || view.prompt.status === 'action' || view.prompt.status === 'choice') {
          const concealed = new Set(Object.values(view.players).flatMap(({ zones }) => {
            const legends = zones.legendArea;
            return Array.isArray(legends) ? legends.filter((card) => card.faceDown).map((card) => card.instanceId) : [];
          }));
          return {
            matchId, view, peeks: [...peeks], log: [...log],
            knownLegends: [...known].filter(([id]) => concealed.has(id))
              .flatMap(([instanceId, viewers]) => [...viewers].map(seat => ({ instanceId, seat }))),
          };
        }
        const command = botDecision(engine, 'rival', () => botRng.next());
        if (!command || command.move === 'concede') throw new Error('The rival could not resolve its current action.');
        apply('rival', command);
      }
      throw new Error('The rival exceeded its action limit.');
    } catch (error) {
      stalled = true;
      throw error;
    }
  }

  return {
    matchId,
    start: advance,
    move(stateID: number, move: Move) {
      if (stalled) throw new Error('This match is stalled. Start a rematch to try again.');
      if (engine.getFilteredView('player').stateID !== stateID) throw new Error('That action is from an older turn state.');
      apply('player', move);
      return advance();
    },
  };
}
