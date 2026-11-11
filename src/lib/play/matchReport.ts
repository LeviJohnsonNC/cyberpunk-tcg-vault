import { zoneCards } from './matchView';
import type { CardView, MatchReport, MatchTally, Move, PlayerView, Seat } from './protocol';

const seats = ['player', 'rival'] as const;
/** A card held this many turns by the end of the match counts as stuck. */
export const STUCK_TURNS = 3;

export function emptyTally(): MatchTally {
  return { gigs: [], held: {}, played: 0, sold: 0, lost: { player: 0, rival: 0 } };
}

function ownerOf(view: PlayerView, id: string): Seat | undefined {
  return seats.find((seat) => ['field', 'legendArea'].some((zone) => zoneCards(view.players[seat], zone).some((card) => card.instanceId === id)));
}

/** Folds one resolved command into the tally. Reads only the player's filtered views. */
export function recordMove(tally: MatchTally, seat: Seat, command: Move, before: PlayerView, after: PlayerView, defeated: Iterable<string> = []) {
  if (seat === 'player' && command.move === 'playCard') tally.played++;
  if (seat === 'player' && command.move === 'sellCard') tally.sold++;
  for (const id of defeated) {
    const owner = ownerOf(before, id);
    if (owner) tally.lost[owner]++;
  }
  const hand = zoneCards(after.players.player, 'hand');
  const held: Record<string, number> = {};
  for (const card of hand) held[card.instanceId] = tally.held[card.instanceId] ?? after.turnNumber;
  tally.held = held;
  if (after.gamePhase === 'setup') return;
  const point = { turn: after.turnNumber, player: after.players.player.gigCount, rival: after.players.rival.gigCount };
  if (tally.gigs.at(-1)?.turn === point.turn) tally.gigs[tally.gigs.length - 1] = point;
  else tally.gigs.push(point);
}

export function matchReport(tally: MatchTally, view: PlayerView): MatchReport {
  const stuck = new Map<string, { card: CardView; copies: number; turns: number }>();
  for (const card of zoneCards(view.players.player, 'hand')) {
    const turns = view.turnNumber - (tally.held[card.instanceId] ?? view.turnNumber);
    if (turns < STUCK_TURNS) continue;
    const entry = stuck.get(card.definitionId);
    if (entry) { entry.copies++; entry.turns = Math.max(entry.turns, turns); }
    else stuck.set(card.definitionId, { card, copies: 1, turns });
  }
  return {
    turns: view.turnNumber, gigs: tally.gigs, played: tally.played, sold: tally.sold, lost: tally.lost,
    stuck: [...stuck.values()].sort((a, b) => b.turns - a.turns || b.copies - a.copies).slice(0, 4),
  };
}
