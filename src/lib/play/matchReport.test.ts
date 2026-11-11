import { describe, expect, it } from 'vitest';
import { emptyTally, matchReport, recordMove } from './matchReport';
import type { CardView, PlayerView } from './protocol';

const card = (id: string, zone: string, definitionId = id): CardView => ({ instanceId: id, definitionId, cardName: definitionId, zone, type: 'unit', faceDown: false, spent: false, power: 3, effectivePower: 3, cost: 2 });
const table = (turn: number, hand: CardView[], gigs: [number, number] = [0, 0]): PlayerView => ({ players: {
  player: { zones: { field: [card('guard', 'field')], deck: 30, hand, legendArea: [] }, firstPlayer: true, eddies: 0, availableEddies: 0, gigCount: gigs[0], streetCred: 0 },
  rival: { zones: { field: [card('raider', 'field')], deck: 30, hand: 5, legendArea: [] }, firstPlayer: false, eddies: 0, availableEddies: 0, gigCount: gigs[1], streetCred: 0 },
}, gamePhase: 'main', turnNumber: turn, activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: turn,
  prompt: { status: 'action', choice: null, availableMoves: [] }, attackState: null });

describe('match report', () => {
  it('keeps one Gig point per turn, at the value the turn ended on', () => {
    const tally = emptyTally();
    recordMove(tally, 'player', { move: 'gainGig' }, table(1, []), table(1, [], [1, 0]));
    recordMove(tally, 'player', { move: 'passPhase' }, table(1, [], [1, 0]), table(2, [], [1, 1]));
    recordMove(tally, 'rival', { move: 'attackRival' }, table(2, [], [1, 1]), table(2, [], [0, 2]));
    expect(tally.gigs).toEqual([{ turn: 1, player: 1, rival: 0 }, { turn: 2, player: 0, rival: 2 }]);
  });

  it('counts the player\u2019s plays and sales, and Units lost on each side', () => {
    const tally = emptyTally();
    recordMove(tally, 'player', { move: 'playCard' }, table(1, []), table(1, []));
    recordMove(tally, 'rival', { move: 'playCard' }, table(1, []), table(1, []));
    recordMove(tally, 'player', { move: 'sellCard' }, table(1, []), table(1, []));
    recordMove(tally, 'rival', { move: 'resolveAttack' }, table(1, []), table(1, []), ['guard', 'raider', 'unknown']);
    expect(tally).toMatchObject({ played: 1, sold: 1, lost: { player: 1, rival: 1 } });
  });

  it('reports only cards that sat in hand for several turns, grouped by card', () => {
    const tally = emptyTally();
    const early = [card('a1', 'hand', 'minotaur'), card('a2', 'hand', 'minotaur')];
    recordMove(tally, 'player', { move: 'keepHand' }, table(1, early), table(1, early));
    const late = [...early, card('b1', 'hand', 'satori')];
    recordMove(tally, 'player', { move: 'passPhase' }, table(5, early), table(6, late));
    const report = matchReport(tally, table(7, late, [2, 7]));
    expect(report.turns).toBe(7);
    expect(report.stuck).toEqual([{ card: early[0], copies: 2, turns: 6 }]);
  });

  it('forgets a card once it leaves the hand', () => {
    const tally = emptyTally();
    const hand = [card('a1', 'hand')];
    recordMove(tally, 'player', { move: 'keepHand' }, table(1, hand), table(1, hand));
    recordMove(tally, 'player', { move: 'playCard' }, table(2, hand), table(2, []));
    expect(tally.held).toEqual({});
  });
});
