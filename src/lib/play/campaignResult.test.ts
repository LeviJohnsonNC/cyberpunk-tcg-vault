import { describe, expect, it } from 'vitest';
import { campaignGigChart, campaignResult } from './campaignResult';
import type { PlayerView } from './protocol';

describe('campaign result', () => {
  it.each([
    ['player', 'gig_victory', false, 'You win', 'Gig control victory', true],
    ['rival', 'gig_victory', false, 'You lose', 'Gig control defeat', true],
    ['rival', 'concede', false, 'You lose', 'Concession', false],
    ['player', 'deck_out_victory', false, 'You win', 'Deck-out', false],
    ['rival', 'overtime_majority', true, 'You lose', 'Overtime majority', false],
    [null, 'overtime_majority', true, 'Draw', 'Overtime ended level', false],
    [null, null, false, 'Draw', 'Match ended in a draw', false],
  ] as const)('labels %s / %s from match state', (winnerId: PlayerView['winnerId'], winReason, overtimeActive, title, description, showThreshold) => {
    expect(campaignResult({ winnerId, winReason, overtimeActive })).toMatchObject({ title, description, showThreshold });
  });

  it('charts recorded turns at their actual spacing and scales past seven Gigs', () => {
    const chart = campaignGigChart([{ turn: 2, player: 0, rival: 2 }, { turn: 6, player: 4, rival: 5 },
      { turn: 15, player: 11, rival: 3 }], true)!;
    expect(chart.first).toBe(2);
    expect(chart.last.turn).toBe(15);
    expect(chart.top).toBeGreaterThanOrEqual(11);
    expect(chart.lines(turn => turn, count => count)).toEqual([
      { seat: 'player', path: 'M2 0 H6V4 H15V11' },
      { seat: 'rival', path: 'M2 2 H6V5 H15V3' },
    ]);
    expect(campaignGigChart([], false)).toBeUndefined();
    expect(campaignGigChart([{ turn: 3, player: 0, rival: 0 }], false)?.turns).toEqual([3]);
  });
});
