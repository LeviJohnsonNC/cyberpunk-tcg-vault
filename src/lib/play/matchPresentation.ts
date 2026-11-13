import type { EngineEvent } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { rollDuration } from './diceTiming';
import { beatPace } from './matchMotion';
import { describeAction, visibleCards, zoneCards } from './matchView';
import type { CardView, GigRoll, MatchBeat, MatchChange, MatchTableCue, Move, PlayerView, Seat } from './protocol';

const seats = ['player', 'rival'] as const;
const matZones = ['field', 'legendArea', 'resolvingProgram'];
const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
// Eddie identities stay concealed in presentation, even during a sale reveal.
function publicCard(card: CardView): CardView {
  return card.zone === 'eddieArea' ? { instanceId: card.instanceId, definitionId: '', cardName: null, faceDown: true, spent: card.spent, power: 0, effectivePower: 0, cost: null, zone: 'eddieArea' } : card;
}

export function matchChanges(before: PlayerView, after: PlayerView, defeatedIds: Set<string> = new Set()): MatchChange[] {
  const changes: MatchChange[] = [];
  for (const seat of seats) {
    const oldCards = new Map(Object.values(before.players[seat].zones).flatMap((zone) => Array.isArray(zone) ? zone : []).map((card) => [card.instanceId, card]));
    const nextCards = new Map(Object.values(after.players[seat].zones).flatMap((zone) => Array.isArray(zone) ? zone : []).map((card) => [card.instanceId, card]));
    for (const [id, next] of nextCards) {
      const previous = oldCards.get(id);
      if (next.definitionId && matZones.includes(next.zone ?? '') && next.zone !== previous?.zone) {
        const label = next.attachedToId ? 'Equipped' : previous?.zone === 'legendArea' ? 'Entered Field' : 'Played';
        changes.push({ kind: 'played', seat, label, card: publicCard(next) });
      } else if (next.zone === 'legendArea' && previous?.faceDown && !next.faceDown && next.definitionId) {
        changes.push({ kind: 'called', seat, label: 'Called', card: publicCard(next) });
      }
      if (previous && previous.zone === 'field' && next.zone === 'field' && previous.effectivePower !== next.effectivePower) {
        const amount = next.effectivePower - previous.effectivePower;
        changes.push({ kind: 'power', seat, label: `${signed(amount)} power`, amount, card: publicCard(next) });
      }
      if (previous && matZones.includes(previous.zone ?? '') && !matZones.includes(next.zone ?? '') && previous.zone !== 'resolvingProgram') {
        const defeated = defeatedIds.has(id);
        const destinations: Record<string, string> = { trash: 'To Trash', hand: 'Returned to hand', deck: 'To deck', removedFromGame: 'Removed' };
        changes.push({ kind: defeated ? 'defeated' : 'moved', seat, label: defeated ? 'Defeated' : destinations[next.zone ?? ''] ?? 'Left play',
          card: publicCard(previous.definitionId ? previous : next) });
      }
    }
    for (const [id, previous] of oldCards) {
      if (!nextCards.has(id) && previous.definitionId && matZones.includes(previous.zone ?? '') && previous.zone !== 'resolvingProgram') {
        changes.push({ kind: 'moved', seat, label: 'Left play', card: publicCard(previous) });
      }
    }
    const deltas = [
      ['gigs', after.players[seat].gigCount - before.players[seat].gigCount, 'Gig'],
      ['cred', after.players[seat].streetCred - before.players[seat].streetCred, 'Street Cred'],
      ['eddies', after.players[seat].availableEddies - before.players[seat].availableEddies, '€$ available'],
    ] as const;
    for (const [kind, amount, unit] of deltas) if (amount) changes.push({ kind, seat, amount,
      label: `${signed(amount)} ${unit}${kind === 'gigs' && Math.abs(amount) !== 1 ? 's' : ''}` });
  }
  return changes;
}

/** Sound events carry only public actions and seats, never drawn or sold card identities. */
export function matchTableCues(events: EngineEvent[], before: PlayerView, after: PlayerView): MatchTableCue[] {
  const cues: MatchTableCue[] = [];
  const draws = new Map<Seat, number>();
  function add(cue: MatchTableCue['cue'], seat: Seat) {
    if (!cues.some(item => item.cue === cue && item.seat === seat)) cues.push({ cue, seat });
  }
  // The first turn starts directly after setup and does not emit turnStarted.
  if (!after.gameEnded && before.gamePhase === 'setup' && after.gamePhase !== 'setup') add('turn', after.activePlayerId);
  for (const event of events) {
    switch (event.type) {
      case 'turnStarted': add('turn', event.playerId); break;
      case 'cardsDrawn': draws.set(event.playerId, (draws.get(event.playerId) ?? 0) + event.count); break;
      case 'cardSold': add('eddie', event.playerId); break;
      case 'legendFlipped': add('call', event.playerId); break;
      // The engine can emit both a per-die event and a summary for a single steal.
      case 'gigStolen': if (event.fromPlayerId !== event.toPlayerId) add('gig-steal', event.toPlayerId); break;
    }
  }
  for (const [seat, count] of draws) if (count > 0) add(count > 1 ? 'deal' : 'draw', seat);
  return cues;
}

export function describeBeat(seat: Seat, command: Move, before: PlayerView, after: PlayerView, defeatedIds?: Set<string>) {
  const changes = matchChanges(before, after, defeatedIds);
  const visible = new Map([...visibleCards(before), ...visibleCards(after)].map((card) => [card.instanceId, publicCard(card)]));
  const args = command.args ?? {};
  const rawSource = [args.cardId, args.legendId, args.attackerId, args.blockerId, command.move === 'resolveAttack' ? before.attackState?.attackerId : undefined].find((id) => typeof id === 'string' && visible.has(id));
  const resolving = zoneCards(before.players[seat], 'resolvingProgram')[0];
  const payload = before.prompt.choice?.payload as { source?: { cardId?: string } } | undefined;
  const choiceSource = payload?.source?.cardId ? visible.get(payload.source.cardId) : undefined;
  const knownChoiceSource = choiceSource?.definitionId ? choiceSource : undefined;
  const source = typeof rawSource === 'string' ? visible.get(rawSource) : knownChoiceSource ?? resolving ?? changes.find((change) => change.kind === 'played' || change.kind === 'called')?.card;
  const targets = [args.defenderId, args.attachToId, args.blockerId, args.protectedCardId, args.dieId,
    ...(Array.isArray(args.targetIds) ? args.targetIds : []), ...(Array.isArray(args.dieIds) ? args.dieIds : [])];
  const targetIds = [...new Set(targets.filter((id): id is string => typeof id === 'string' && visible.has(id)))];
  const description = describeAction(seat, command, before, after);
  const entered = changes.find((change) => change.kind === 'played' || change.kind === 'called');
  const combatChanged = after.attackState?.step !== before.attackState?.step && !!after.attackState;
  const combatEnded = !!before.attackState && !after.attackState;
  const headline = description ?? (entered ? `${entered.label === 'Equipped' ? 'Equipped' : entered.kind === 'called' ? 'Called' : 'Played'} ${entered.card?.cardName ?? 'a card'}.`
    : (knownChoiceSource ?? resolving)?.cardName ? `${(knownChoiceSource ?? resolving)!.cardName} · ${knownChoiceSource ? 'choice resolved' : 'effect'}.` : combatEnded ? 'Combat resolved.' : undefined);
  const text = headline ?? (changes.length ? changes.filter((change) => change.kind !== 'cred' || !changes.some((other) => other.kind === 'gigs' && other.seat === change.seat)).slice(0, 2)
    .map((change) => `${change.card?.cardName ? `${change.card.cardName} · ` : ''}${change.label}`).join(' ') : undefined);
  return { text: text ?? (combatChanged ? 'Combat continues.' : undefined), source: source && publicCard(source), targetIds, changes };
}

export function describeRolls(rolls: GigRoll[], actor: Seat) {
  return rolls.map((roll) => {
    const owner = roll.seat === actor ? 'a' : roll.seat === 'player' ? 'your' : 'the rival’s';
    return `${roll.origin === 'reroll' ? 'Rerolled' : 'Rolled'} ${owner} ${roll.dieType} · rolled ${roll.result}.`;
  }).join(' ');
}

export function presentationView(view: PlayerView): PlayerView {
  const seatView = (seat: Seat) => ({ ...view.players[seat], zones: {
    ...view.players[seat].zones, eddieArea: zoneCards(view.players[seat], 'eddieArea').map(publicCard),
  } });
  return { ...view, prompt: { status: 'waiting', availableMoves: [], choice: null },
    players: { player: seatView('player'), rival: seatView('rival') },
  };
}

/** Time on screen for one public move: long enough for its movement on the table to land. */
export function beatDuration(count: number, beat: Pick<MatchBeat, 'gigRolls'> & Partial<Pick<MatchBeat, 'changes' | 'view'>>) {
  if (beat.gigRolls.length) return rollDuration(beat.gigRolls);
  const kinds = new Set(beat.changes?.map((change) => change.kind));
  const base = kinds.has('defeated') ? 1300 : kinds.has('played') || kinds.has('called') ? 1350
    : beat.view?.attackState || kinds.has('gigs') ? 1050 : kinds.has('power') ? 1100 : 700;
  return Math.round(base * beatPace(count));
}

export function combatContext(view: PlayerView) {
  const attack = view.attackState;
  if (!attack) return;
  const currentOwner = seats.find((seat) => Object.values(view.players[seat].zones).some((zone) => Array.isArray(zone) && zone.some((card) => card.instanceId === attack.attackerId))) ?? view.activePlayerId;
  const defendingSeat: Seat = attack.rivalId ?? (currentOwner === 'player' ? 'rival' : 'player');
  const attackerSeat: Seat = defendingSeat === 'player' ? 'rival' : 'player';
  const cards = visibleCards(view);
  const attacker = cards.find((card) => card.instanceId === attack.attackerId);
  const defender = cards.find((card) => card.instanceId === attack.defenderId);
  const responding = defendingSeat === 'player' && attack.step === 'react' && view.prompt.status === 'action' && !view.prompt.choice;
  const offered = new Set(view.prompt.availableMoves.map((move) => move.moveId));
  const options = [offered.has('playCard') && 'play a Quick card', offered.has('callLegend') && 'call a Legend',
    offered.has('activateAbility') && 'use an ability', offered.has('useBlocker') && 'block'].filter(Boolean) as string[];
  return { attacker, defender, attackerSeat, defendingSeat, responding,
    canPass: responding && offered.has('resolveAttack'),
    title: responding ? 'Your response' : view.prompt.choice ? 'Resolve the current choice' : ['fight', 'fightResult', 'steal'].includes(attack.step) ? 'Combat resolution' : `${attackerSeat === 'player' ? 'Your' : 'Rival'} attack`,
    caption: `${attacker?.cardName ?? 'Attacking Unit'} → ${defender?.cardName ?? (defendingSeat === 'player' ? 'Your Gigs' : 'Rival Gigs')}`,
    hint: responding ? options.length ? `You can ${options.join(', ')}.` : 'No available response. Pass to continue.'
      : view.prompt.choice ? 'Complete the choice below to continue combat.' : 'Follow the highlighted attacker and defender.',
  };
}
