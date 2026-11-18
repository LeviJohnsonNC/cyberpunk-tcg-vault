import { CAMPAIGN_RIVAL_PLANS } from './campaignBalance';
import { engineSlug } from './engineCards';
import { chooseMove, createCardCatalog, createMatchState, LocalEngine, projectRevealedCardView, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import type { EngineCardView, EngineEvent, EngineHandle, EngineState } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { describeAction, hideConcealedTargets, visibleCards, zoneCards, zoneCount } from './matchView';
import { completedFight, describeBeat, describeRolls, matchTableCues, presentationView } from './matchPresentation';
import { emptyTally, matchReport, recordMove } from './matchReport';
import type { CampaignRivalPlan, CardView, GigRoll, MatchBeat, MatchFrame, MatchLogEntry, MatchSetup, MatchSnapshot, MatchTally, Move, RivalSkill, Seat } from './protocol';

const catalog = createCardCatalog();

export function engineCardId(slug: string) {
  const card = catalog.get(engineSlug(slug));
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
    catalog, seed, matchId, manualPaymentPlayerId: 'player',
  });
}

const strategies = { standard: 'greedy', sharp: 'tactical', masterful: 'tactical-ability-aware' } as const;

/**
 * The engine as a look-ahead strategy may use it: it can try its own moves on a
 * fork, but every view it reads is the seat's filtered one with concealed
 * targets masked, exactly as the player's is.
 */
function fairHandle(engine: LocalEngine, rootSeat: Seat, remembered: ReadonlyMap<string, EngineCardView>): EngineHandle {
  const memory = new Map(remembered);
  // A search reads the same position many times. Views are kept until the fork moves on.
  const views = new Map<Seat, ReturnType<typeof hideConcealedTargets>>();
  const view = (seat: Seat) => {
    let seen = views.get(seat);
    if (!seen) views.set(seat, seen = botView(engine, seat, seat === rootSeat ? memory : new Map()));
    return seen;
  };
  return {
    getFilteredView: view,
    getPrompt: (seat) => view(seat).prompt,
    processCommand: (command, seat) => {
      views.clear();
      const result = engine.processCommand(command, seat);
      if (result.success) for (const event of result.gameEvents) {
        if (event.type !== 'legendsShuffled') continue;
        const slots = new Set(result.state.G.players[event.playerId].zones.legendArea);
        for (const id of memory.keys()) if (slots.has(id) || id.startsWith(`hidden-crew:${event.playerId}:`)) memory.delete(id);
      }
      return { success: result.success };
    },
    // The engine's own fork also copies its undo history, which a search never uses and which
    // made each look-ahead several times slower. A fresh engine on a copy of the state plays the same.
    fork: () => fairHandle(new LocalEngine(structuredClone(engine.getState())), rootSeat, memory),
  };
}

/** Own registered deck composition is legal knowledge; no deck order is inspected. */
export function botDeckTypePrior(mainDeck: readonly string[]) {
  const counts: Record<string, number> = {};
  for (const slug of mainDeck) {
    const type = catalog.get(engineSlug(slug))?.type;
    if (type) counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

export interface BotKnowledge {
  /** Snapshots from this seat's actual observations, never from speculative forks. */
  legends?: ReadonlyMap<string, EngineCardView>;
  /** Registered own main-deck mix; this is a prior, not a current deck inspection. */
  deckTypePrior?: Readonly<Record<string, number>>;
}

export function botView(engine: LocalEngine, seat: Seat, memory: ReadonlyMap<string, EngineCardView>) {
  const view = hideConcealedTargets(engine.getFilteredView(seat));
  const players = { ...view.players };
  for (const owner of seats) {
    const player = view.players[owner];
    players[owner] = { ...player, zones: { ...player.zones, legendArea: zoneCards(player, 'legendArea').map(slot => {
      const remembered = memory.get(slot.instanceId);
      if (!slot.faceDown || slot.definitionId || !remembered) return slot;
      const { definitionId, cardName, type, cost, power, color, classifications, hasSellTag,
        keywords, triggerHints, abilityHints } = remembered;
      // Preserve public position/status, attach only legally remembered card details.
      return { ...slot, definitionId, cardName, type, cost, power, effectivePower: power,
        color, classifications, hasSellTag, keywords, triggerHints, abilityHints };
    }) } };
  }
  return { ...view, players };
}

export function botDecision(engine: LocalEngine, seat: Seat, rng: () => number, skill: RivalSkill = 'standard',
  plan?: CampaignRivalPlan, knowledge: BotKnowledge = {}) {
  const memory = knowledge.legends ?? new Map<string, EngineCardView>();
  const view = botView(engine, seat, memory);
  if (view.prompt.status === 'choice' || view.prompt.status === 'action') {
    return chooseMove(view, rng, seat, { strategy: strategies[skill], deckTypePrior: knowledge.deckTypePrior,
      ...(skill !== 'standard' && { engine: fairHandle(engine, seat, memory), profile: plan ? CAMPAIGN_RIVAL_PLANS[plan] : undefined }) });
  }
}

export function recordLegendPeeks(state: EngineState, events: EngineEvent[], known: Map<string, Set<Seat>>, memory?: Map<string, EngineCardView>): CardView[] {
  const peeks: CardView[] = [];
  for (const event of events) {
    if (event.type === 'legendsShuffled') {
      const slots = new Set(state.G.players[event.playerId].zones.legendArea);
      for (const id of known.keys()) if (slots.has(id) || id.startsWith(`hidden-crew:${event.playerId}:`)) {
        known.delete(id);
        memory?.delete(id);
      }
    }
    if (event.type !== 'cardsRevealed' || event.fromZone !== 'legendArea' || event.audience !== 'private') continue;
    const viewers = event.viewers ?? [event.playerId];
    for (const id of event.cardIds) {
      const informed = known.get(id) ?? new Set<Seat>();
      for (const viewer of viewers) informed.add(viewer);
      known.set(id, informed);
      const peek = projectRevealedCardView(state, id);
      if (peek) {
        memory?.set(id, structuredClone(peek));
        if (viewers.includes('player')) peeks.push(peek);
      }
    }
  }
  const currentSlots = new Set(seats.flatMap(seat => state.G.players[seat].zones.legendArea));
  for (const id of known.keys()) if (!currentSlots.has(id)) { known.delete(id); memory?.delete(id); }
  return peeks;
}

export interface EngineCheckpoint {
  matchId: string;
  state: EngineState;
  botRng: { state: number };
  known: Map<string, Set<Seat>>;
  peeks: CardView[];
  legendMemory?: Map<string, EngineCardView>;
  log: MatchLogEntry[];
  commandNumber: number;
  /** Absent in matches saved before the report existed. */
  tally?: MatchTally;
}

export function createEngineSession(
  setup: MatchSetup,
  seeds: { shuffle: string; bot: string } = { shuffle: crypto.randomUUID(), bot: crypto.randomUUID() },
  checkpoint?: EngineCheckpoint,
) {
  const matchId = checkpoint?.matchId ?? crypto.randomUUID();
  // The pinned engine registers card definitions through match initialization.
  const initial = initialEngineState(setup, seeds.shuffle, matchId);
  const engine = new LocalEngine(checkpoint?.state ?? initial);
  const botRng = new SeededRNG(seeds.bot);
  if (checkpoint) botRng.setState(checkpoint.botRng);
  const known = checkpoint?.known ?? new Map<string, Set<Seat>>();
  // Older checkpoints recorded authorization but not the snapshot. Hydrate only
  // those explicitly known slots once, before search can fork the position.
  const legendMemory = checkpoint?.legendMemory ?? new Map([...known.keys()].flatMap(id => {
    const card = projectRevealedCardView(engine.getState(), id);
    return card ? [[id, card] as const] : [];
  }));
  const deckTypePrior = botDeckTypePrior(setup.rival.mainDeck);
  let peeks = checkpoint?.peeks ?? [];
  const log = checkpoint?.log ?? [];
  const tally = checkpoint?.tally ?? emptyTally();
  let gigRolls: GigRoll[] = [];
  let commandNumber = checkpoint?.commandNumber ?? 0;
  const names = { player: setup.player.name.trim() || 'Untitled deck', rival: setup.rival.name };
  const isCurrent = (stateID: number) => engine.getState().ctx.stateID === stateID;
  let stalled = false;
  let beats: MatchBeat[] = [];
  let feedback: MatchBeat | undefined;

  function frame(view: MatchFrame['view'], rolls: GigRoll[]): MatchFrame {
    const knownLegends = seats.flatMap(seat => zoneCards(view.players[seat], 'legendArea')).flatMap(slot => {
      if (!slot.faceDown || slot.definitionId || !known.get(slot.instanceId)?.has('player')) return [];
      const revealed = legendMemory.get(slot.instanceId);
      if (!revealed) return [];
      const { definitionId, cardName, type, cost, power } = revealed;
      // Keep the filtered slot's public status and attach only its remembered printed details.
      return [{ ...slot, definitionId, cardName, type, cost, power, effectivePower: power }];
    });
    return { view, peeks: [...peeks], log: [...log], gigRolls: rolls, knownLegends };
  }

  function apply(seat: Seat, command: Move) {
    const prompt = engine.getFilteredView(seat).prompt;
    if (!prompt.availableMoves.some(({ moveId }) => moveId === command.move)) {
      throw new Error('That action is no longer available.');
    }
    const before = hideConcealedTargets(engine.getFilteredView('player'));
    const result = engine.processCommand({
      commandID: String(++commandNumber),
      move: command.move,
      input: command.args ? { args: command.args } : undefined,
    }, seat);
    if (!result.success) throw new Error(result.error);
    const after = hideConcealedTargets(engine.getFilteredView('player'));
    if (seat === 'player') peeks = [];
    peeks.push(...recordLegendPeeks(result.state, result.gameEvents, known, legendMemory));
    const winThreshold = after.overtimeActive
      ? Math.floor(seats.reduce((total, seat) => total + zoneCount(after.players[seat], 'gigArea') + zoneCount(after.players[seat], 'fixerArea'), 0) / 2) + 1
      : 7;
    const rolls: GigRoll[] = result.gameEvents.flatMap((event) => {
      if (event.type !== 'gigDieRolled') return [];
      const { dieId, dieType, result, playerId: seat, origin } = event;
      const fixerIndex = zoneCards(before.players[seat], 'fixerArea').findIndex((die) => die.instanceId === dieId);
      // Reaching the winning count warrants a longer hold. The engine checks the actual win at turn start.
      const atWinThreshold = before.players[seat].gigCount < winThreshold && after.players[seat].gigCount >= winThreshold;
      const decisive = atWinThreshold || (after.gameEnded && !before.gameEnded);
      return [{ dieId, dieType, result, seat, origin,
        ...(fixerIndex >= 0 && { fixerIndex }),
        ...(decisive && { decisive: true }),
      }];
    });
    gigRolls.push(...rolls);
    const main = before.gamePhase !== 'setup' && after.gamePhase !== 'setup';
    const defeated = new Set(result.gameEvents.flatMap((event) => event.type === 'cardDefeated' ? [event.cardId] : []));
    recordMove(tally, seat, command, before, after, defeated);
    const tableCues = matchTableCues(result.gameEvents, before, after);
    const described = main || rolls.length || tableCues.length ? describeBeat(seat, command, before, after, defeated) : undefined;
    const resultOfFight = completedFight(before, after, result.gameEvents);
    const beatText = resultOfFight?.text || described?.text || describeRolls(rolls, seat)
      || (tableCues.length ? 'Resolved a table action.' : undefined);
    const actionText = describeAction(seat, command, before, after);
    const text = resultOfFight ? [actionText, resultOfFight.text].filter(Boolean).join(' ')
      : actionText ?? (described?.changes.length || rolls.length ? beatText : undefined);
    if (text) {
      log.push({ id: commandNumber, turn: before.turnNumber, seat, text });
      if (log.length > 80) log.shift();
    }
    if (described && beatText) {
      // Only the viewer's contemporary filtered state enters the transient queue.
      // Even a reroll that lands on the same face must retain its roll receipt.
      const publicCards = visibleCards(after);
      const playedCardIds = [...new Set(result.gameEvents.flatMap((event) => event.type === 'cardPlayed'
        && publicCards.some((card) => card.instanceId === event.cardId && card.definitionId) ? [event.cardId] : []))];
      const resolved = result.gameEvents.find((event) => event.type === 'attackResolved');
      const priorFight = before.attackState?.step === 'fightResult' ? before.attackState : undefined;
      const fight = resolved?.attackKind === 'fight' ? resolved : priorFight;
      const outcome = resolved?.attackKind === 'fight' ? resolved.result : priorFight?.fightResolution?.result;
      const field = seats.flatMap((side) => zoneCards(before.players[side], 'field'));
      const units = new Set(field.filter(card => card.type === 'unit').map(card => card.instanceId));
      const combatKillIds: string[] = [];
      if (fight?.defenderId && units.has(fight.attackerId) && units.has(fight.defenderId)) {
        const { attackerId, defenderId } = fight;
        for (const event of result.gameEvents) {
          if (event.type !== 'cardDefeated') continue;
          const defenderFell = (outcome === 'attackerWins' || outcome === 'mutual') && event.cardId === defenderId && event.defeatedBy === attackerId;
          const attackerFell = (outcome === 'defenderWins' || outcome === 'mutual') && event.cardId === attackerId && event.defeatedBy === defenderId;
          if (defenderFell || attackerFell) combatKillIds.push(event.cardId);
        }
      }
      const beat: MatchBeat = structuredClone({ ...frame(presentationView(after), rolls),
        ...described, ...(resultOfFight && { fight: resultOfFight.fight }), text: beatText, id: commandNumber, seat,
        ...(playedCardIds.length && { playedCardIds }), ...(combatKillIds.length && { combatKillIds }), ...(tableCues.length && { tableCues }) });
      if (seat === 'rival') beats.push(beat);
      else feedback = beat;
    }
  }

  function advance(): MatchSnapshot {
    try {
      for (let actions = 0; actions < 200; actions++) {
        const view = hideConcealedTargets(engine.getFilteredView('player'));
        if (view.gameEnded || view.prompt.status === 'action' || view.prompt.status === 'choice') {
          const snapshot: MatchSnapshot = { matchId, names, ...frame(view, gigRolls),
            ...(beats.length || feedback ? { presentation: { beats, feedback } } : {}),
            ...(view.gameEnded && { report: matchReport(tally, view) }),
          };
          gigRolls = [];
          beats = [];
          feedback = undefined;
          return snapshot;
        }
        const command = botDecision(engine, 'rival', () => botRng.next(), setup.rivalSkill, setup.campaignRivalPlan, {
          legends: new Map([...legendMemory].filter(([id]) => known.get(id)?.has('rival'))), deckTypePrior,
        });
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
    checkpoint: (): EngineCheckpoint => ({
      matchId, state: engine.getState(), botRng: botRng.getState(), known, peeks, legendMemory, log, commandNumber, tally,
    }),
    isCurrent,
    move(stateID: number, move: Move) {
      if (stalled) throw new Error('This match is stalled. Start a rematch to try again.');
      if (!isCurrent(stateID)) throw new Error('That action is from an older turn state.');
      apply('player', move);
      return advance();
    },
  };
}
