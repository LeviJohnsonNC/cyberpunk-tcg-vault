import {
  chooseMove,
  LocalEngine,
  SeededRNG,
  type EngineCardView,
  type EngineHandle,
} from '../../../vendor/cyberpunk-engine/engine.mjs';
import { botDeckTypePrior, botView, createEngineSession } from './engineSession';
import { isReady, matchActions, type MatchActionForm, type Picks } from './matchActions';
import { suggestPayment } from './matchInteraction';
import { visibleCards, zoneCards } from './matchView';
import { canAttackGigs, compareEquipment } from './coachCombat';
import { coachFacts, continuation, explainMove } from './coachTeaching';
import type { CoachPlan, CoachPosition } from './coachTypes';
import type { Move, PlayerView, Prompt, Seat } from './protocol';

const idle: Prompt = { status: 'waiting', choice: null, availableMoves: [] };
const actionable = (view: PlayerView) => view.prompt.status === 'choice' || view.prompt.status === 'action';

// A speculative branch can see only the original player's information. Stop before
// reading a new hand, Gig face, Legend identity, or the rival's decision.
function cursor(engine: LocalEngine, memory: Map<string, EngineCardView>, initial?: PlayerView, stop = '') {
  let current = initial ?? botView(engine, 'player', memory);
  let boundary = stop;
  const handle: EngineHandle = {
    getPrompt: (seat) => (seat === 'player' && !boundary ? current.prompt : idle),
    getFilteredView: (seat) => (seat === 'player' && !boundary ? current : { ...current, prompt: idle }),
    fork: () => cursor(new LocalEngine(structuredClone(engine.getState())), memory, current, boundary).handle,
    processCommand(command, seat: Seat) {
      if (seat !== 'player' || boundary) return { success: false };
      const move = command.move;
      const result = engine.processCommand(command, seat);
      if (!result.success) return { success: false };
      if (move === 'passPhase') boundary = 'Your turn ends here.';
      else if (move === 'gainGig') boundary = 'Use the actual die face for the rest of this plan.';
      else if (move === 'mulligan') boundary = 'Look at the new six before deciding what to develop.';
      else if (move === 'callLegend')
        boundary = 'Read the called Legend and resolve its ability before choosing your next play.';
      else if (move === 'attackRival' || move === 'attackUnit' || move === 'useBlocker')
        boundary =
          'Resolve the combat window. If the target or the power changes, compare the new fight before committing another attacker.';
      else if (
        result.gameEvents.some((e) =>
          ['cardsDrawn', 'cardsRevealed', 'gigDieRolled', 'legendsShuffled', 'legendFlipped'].includes(e.type)
        )
      )
        boundary = 'Check the newly revealed information before committing to the next action.';
      else {
        const next = botView(engine, 'player', memory);
        const knownIds = new Set(
          visibleCards(current)
            .filter((c) => c.definitionId)
            .map((c) => c.instanceId)
        );
        if (
          ['scry', 'revealDestination'].includes(String(next.prompt.choice?.type)) ||
          visibleCards(next).some((c) => c.definitionId && !knownIds.has(c.instanceId))
        )
          boundary = 'Inspect the revealed cards, then choose the next action with that information.';
        else if (current.turnNumber !== next.turnNumber || next.activePlayerId !== current.activePlayerId)
          boundary = 'The turn changes hands. Check who acts next.';
        else if (!actionable(next))
          boundary = 'Wait for the rival’s response before following the rest of the plan.';
        else current = next;
      }
      return { success: true };
    },
  };
  return {
    handle,
    get view() {
      return current;
    },
    get boundary() {
      return boundary;
    },
  };
}

const command = (move: Move) => ({ commandID: 'coach', move: move.move, input: { args: move.args ?? {} } });

// The same forms drive the real UI. This path also covers optional payments
// and unusual nested choices for which the rival policy has no command.
function* formMoves(form: MatchActionForm, view: PlayerView): Generator<Move> {
  const cards = visibleCards(view);
  const first = form.fields({})[0];
  const starters: Picks[] =
    first && first.min === 1 ? first.options.map((o) => ({ [first.id]: [o.id] })) : [{}];
  for (let picks of starters) {
    for (let i = 0; i < 20; i++) {
      picks = suggestPayment(form, picks, cards);
      const fields = form.fields(picks);
      const missing = fields.find((f) => !(f.id in picks));
      if (!missing) {
        if (isReady(fields, picks)) yield form.move(picks);
        break;
      }
      picks = { ...picks, [missing.id]: missing.options.slice(0, missing.min).map((o) => o.id) };
    }
  }
}

function withPayment(move: Move, view: PlayerView): Move {
  const a = move.args ?? {};
  const payment = view.prompt.payment;
  const key = move.move === 'activateAbility' ? `${a.cardId}:${a.abilityIndex}` : String(a.cardId ?? 'action');
  const cost = payment?.costs[move.move]?.[key];
  if (!payment || !cost?.amount || a.pass || a.paymentSourceIds) return move;
  const eddies = payment.eddieIds.slice(0, cost.amount);
  const legends = payment.legendIds.filter((id) => !cost.reservedLegendIds?.includes(id));
  const cards = visibleCards(view);
  const faceDown = (id: string) => Number(!!cards.find((c) => c.instanceId === id)?.faceDown);
  legends.sort((a, b) => faceDown(b) - faceDown(a));
  return {
    ...move,
    args: {
      ...a,
      paymentSourceIds: [...eddies, ...legends.slice(0, Math.max(0, cost.amount - payment.eddies))],
    },
  };
}

function competingPrompt(view: PlayerView, move: Move): Prompt {
  const prompt = view.prompt;
  const a = move.args ?? {};
  if (prompt.choice) {
    const payload = prompt.choice.payload as Record<string, unknown>;
    let choice;
    if (move.move === 'gainGig') {
      const remaining = (payload.allowedDieIds as string[]).filter(id => id !== a.dieId);
      if (remaining.length) choice = { ...payload, allowedDieIds: remaining };
    }
    if (move.move === 'resolveStealGigs') {
      const selected = a.dieIds as string[];
      const dice = (payload.eligibleDice as { dieId: string }[]).filter(d => d.dieId !== selected[0]);
      if (dice.length >= Number(payload.count)) choice = { ...payload, eligibleDice: dice };
    }
    return { ...prompt, choice: { ...prompt.choice, payload: choice ?? payload },
      availableMoves: choice ? prompt.availableMoves : [] };
  }
  return {
    ...prompt,
    availableMoves: prompt.availableMoves.flatMap((offered) => {
      if (offered.moveId !== move.move) return [offered];
      const spec = offered.inputSpec;
      if (!Array.isArray(spec.candidates)) return [];
      const candidates = spec.candidates.filter((candidate) => {
        if (typeof candidate === 'string')
          return ![a.cardId, a.attackerId, a.legendId, a.blockerId].includes(candidate);
        return (
          candidate.cardId !== a.cardId ||
          (candidate.abilityIndex !== undefined && candidate.abilityIndex !== a.abilityIndex)
        );
      });
      return candidates.length ? [{ ...offered, inputSpec: { ...spec, candidates } }] : [];
    }),
  };
}

export function planTurn({ setup, checkpoint }: CoachPosition): CoachPlan {
  // Initializes the engine catalog and hydrates legally remembered slots on older saves.
  const saved = createEngineSession(setup, undefined, checkpoint).checkpoint();
  const memory = new Map([...(saved.legendMemory ?? [])].filter(([id]) => saved.known.get(id)?.has('player')));
  const analysisState = structuredClone(saved.state);
  analysisState.ctx.rngState = new SeededRNG('coach-public-search').getState();
  const line = cursor(new LocalEngine(analysisState), memory);
  const root = line.view;
  if (root.gameEnded || !actionable(root))
    throw new Error('Ask Coach when the table is waiting for your decision.');
  const prior = botDeckTypePrior(setup.player.mainDeck);
  const steps: CoachPlan['steps'] = [];
  let focus: CoachPlan['focus'] = { move: '', cards: [] };
  let alternative: CoachPlan['alternative'];
  const rootHandle = line.handle.fork();
  let first: Move | undefined;
  let last: Move | undefined;
  let lastView = root;
  function pick(view: PlayerView, handle = line.handle) {
    const usable = (move: Move | undefined): move is Move =>
      !!move &&
      move.move !== 'concede' &&
      view.prompt.availableMoves.some((m) => m.moveId === move.move) &&
      handle.fork().processCommand(command(move), 'player').success;
    const proposed = chooseMove(view, () => 0.5, 'player', {
      strategy: 'tactical-ability-aware',
      deckTypePrior: prior,
      engine: handle,
    });
    const candidate = proposed && withPayment(proposed, view);
    if (usable(candidate)) return candidate;
    for (const form of matchActions(view))
      for (const move of formMoves(form, view)) if (usable(move)) return move;
  }
  function compareAttack(view: PlayerView, attack: Move, index: number): CoachPlan['alternative'] {
    const hostId = attack.args?.attackerId;
    if (typeof hostId !== 'string') return;
    // Ask the same policy which legal Gear it would buy for this attacker.
    // Evaluate the payment on a fork and stop if that purchase opens a reveal.
    const offered = view.prompt.availableMoves.find(m => m.moveId === 'playCard');
    const gear = zoneCards(view.players.player, 'hand').filter(c => c.type === 'gear');
    const candidates = (offered?.inputSpec.candidates as { cardId: string; attachTargets?: string[] }[] | undefined)
      ?.filter(c => c.attachTargets?.includes(hostId) && gear.some(g => g.instanceId === c.cardId))
      .map(c => ({ ...c, attachTargets: [hostId] }));
    if (offered && candidates?.length) {
      const prompt = { ...view.prompt, availableMoves: [{ ...offered, inputSpec: { ...offered.inputSpec, candidates } }] };
      const purchase = pick({ ...view, prompt });
      const card = gear.find(c => c.instanceId === purchase?.args?.cardId);
      const branch = line.handle.fork();
      if (card && purchase?.args?.attachToId === hostId && branch.processCommand(command(purchase), 'player').success) {
        const equipped = branch.getFilteredView('player');
        if (canAttackGigs(equipped, hostId)) return {
          afterStep: index,
          title: `Equip ${card.cardName} before attacking`,
          why: compareEquipment(view, equipped, hostId, card, false),
        };
      }
    }
    // If the recommendation just bought Gear, compare with attacking from the
    // last shared position without buying it (e.g. an 8-to-10 power threshold).
    if (last?.move === 'playCard' && last.args?.attachToId === hostId && canAttackGigs(lastView, hostId)) {
      const card = zoneCards(lastView.players.player, 'hand').find(c => c.instanceId === last?.args?.cardId);
      if (card) return {
        afterStep: index - 1,
        title: `Attack before equipping ${card.cardName}`,
        why: compareEquipment(lastView, view, hostId, card, true),
      };
    }
  }
  for (let index = 0; index < 12; index++) {
    const view = line.view;
    const move = pick(view);
    if (!move) break;
    if (!first) {
      first = move;
      const publicIds = new Set(visibleCards(view).map((card) => card.instanceId));
      focus = {
        move: move.move,
        cards: Object.values(move.args ?? {}).flat().filter((id): id is string => typeof id === 'string' && publicIds.has(id)),
      };
    }
    if (move.move === 'attackRival') alternative = compareAttack(view, move, index);
    if (!line.handle.processCommand(command(move), 'player').success) break;
    steps.push(explainMove(view, move, false, line.boundary ? undefined : line.view));
    lastView = view;
    last = move;
    if (line.boundary || line.view.gameEnded) break;
  }
  if (!first || !last) throw new Error('The table has no coachable legal action at this position.');
  const forms = matchActions(root);
  if (!alternative) {
    const prompt = competingPrompt(root, first);
    const response = root.attackState?.step === 'react' && root.activePlayerId === 'rival';
    const pass = response && first.move !== 'resolveAttack' && prompt.availableMoves.find(m => m.moveId === 'resolveAttack');
    if (pass) prompt.availableMoves = [pass];
    const other = prompt.availableMoves.length ? pick({ ...root, prompt }, rootHandle) : undefined;
    if (other) {
      const option = explainMove(root, other, true);
      if (first.move === 'gainGig' && other.move === 'gainGig') {
        const die = zoneCards(root.players.player, 'fixerArea').find(c => c.instanceId === first.args?.dieId);
        if (die) option.why += ` This saves the ${die.definitionId} for a later Gig step.`;
      }
      if (other.move === 'attackUnit' && first.move === 'attackRival' && first.args?.attackerId === other.args?.attackerId)
        option.why += ' Spending this attacker on the fight gives up its chance to steal a Gig this turn unless it readies again.';
      if (pass && other.move === 'resolveAttack')
        option.why = first.move === 'playCard'
          ? `Passing keeps ${explainMove(root, first).title.replace(/^Play /, '')} in hand and leaves ${root.players.player.availableEddies} €$ available. The attack can advance at its current power.`
          : 'Passing lets combat advance at its current power while you keep your remaining resources.';
      if (option.title !== steps[0].title) alternative = option;
    }
    // Two-way choices such as starting seat or keeping revealed cards have a
    // single counterfactual even when they share one engine command name.
    if (!alternative && root.prompt.choice && forms.length === 2 && forms.every(f => !f.fields({}).length)) {
      for (const form of forms) {
        const move = form.move({});
        const option = explainMove(root, move, true);
        if (option.title !== steps[0].title && rootHandle.fork().processCommand(command(move), 'player').success)
          alternative = option;
      }
    }
  }
  const forced = !alternative && forms.length === 1 &&
    forms[0].fields({}).every((f) => f.min === f.max && f.options.length === f.min);
  // At a live Gig prompt, show two illustrations using independent rolls. Never
  // simulate from the saved RNG or carry a sampled draw/reveal into the lesson.
  function rollExamples(move: Move) {
    const die = visibleCards(root).find((c) => c.instanceId === move.args?.dieId);
    if (!die || !/^d(4|6|8|10|12|20)$/.test(die.definitionId)) return [];
    const examples: string[] = [];
    for (const face of [1, Number(die.definitionId.slice(1))]) {
      let rngState;
      for (let n = 0; n < 512; n++) {
        const rng = new SeededRNG('coach-example-' + n);
        const before = rng.getState();
        if (rng.rollDie(die.definitionId) === face) {
          rngState = before;
          break;
        }
      }
      if (!rngState) continue;
      const state = structuredClone(saved.state);
      state.ctx.rngState = rngState;
      const engine = new LocalEngine(state);
      const trial = engine.processCommand(command(move), 'player');
      if (
        !trial.success ||
        !trial.gameEvents.some((e) => e.type === 'gigDieRolled' && e.result === face) ||
        trial.gameEvents.some((e) =>
          ['cardsDrawn', 'cardsRevealed', 'legendFlipped', 'legendsShuffled'].includes(e.type)
        )
      )
        continue;
      const branch = cursor(engine, memory);
      if (
        !actionable(branch.view) ||
        ['scry', 'revealDestination'].includes(String(branch.view.prompt.choice?.type))
      )
        continue;
      const route: string[] = [];
      for (let n = 0; n < 6 && !branch.boundary && actionable(branch.view) && !branch.view.gameEnded; n++) {
        const next = pick(branch.view, branch.handle);
        if (!next) break;
        const title = explainMove(branch.view, next).title;
        if (!branch.handle.processCommand(command(next), 'player').success) break;
        route.push(title);
      }
      if (route.length)
        examples.push(
          `If you roll ${face} (${root.players.player.streetCred + face} Street Cred), you could play ${route.join(' → ')}.`
        );
    }
    return examples;
  }
  return {
    steps,
    focus,
    alternative,
    forced: forced && steps.length === 1,
    facts: coachFacts(root),
    continuation: line.view.gameEnded
      ? []
      : [
          ...(root.prompt.choice?.type === 'gainGig' && last.move === 'gainGig' ? rollExamples(last) : []),
          ...continuation(
            lastView,
            last,
            line.boundary || 'Recheck the table after this sequence before spending anything else.'
          ),
        ],
  };
}
