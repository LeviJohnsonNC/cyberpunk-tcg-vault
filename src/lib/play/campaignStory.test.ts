import { describe, expect, it } from 'vitest';
import { ENCOUNTERS, newCampaign, type CampaignPhase } from './campaign';
import { campaignChapters, unlockedCampaignChapters } from './campaignStory';
import { advanceRivalDialogue, dialogueCooldown, rivalReaction, rivalResult } from './rivalDialogue';
import type { MatchBeat, MatchChange, PlayerView } from './protocol';

const seat = (gigCount: number) => ({
  zones: {}, firstPlayer: false, eddies: 0, availableEddies: 0, gigCount, streetCred: 0,
});
function beat(id: number, player: number, rival: number, changes: MatchChange[] = [], gigRolls: MatchBeat['gigRolls'] = []): MatchBeat {
  const view: PlayerView = {
    players: { player: seat(player), rival: seat(rival) }, gamePhase: 'main', turnNumber: 3,
    activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null,
    winReason: null, stateID: id, prompt: { status: 'idle', choice: null, availableMoves: [] },
  };
  return { id, view, seat: 'player', text: '', targetIds: [], changes, gigRolls, knownLegends: [], peeks: [], log: [] };
}
const gig = (side: 'player' | 'rival', amount: number): MatchChange => ({ kind: 'gigs', seat: side, label: 'Gig', amount });
const lines = campaignChapters['first-call'].lines;

describe('Last Call story and rival dialogue', () => {
  it('has a distinct rival with 25 lines for every campaign contract', () => {
    const cast = ENCOUNTERS.map(encounter => campaignChapters[encounter.id]);
    expect(new Set(cast.map(chapter => chapter.rival)).size).toBe(9);
    for (const chapter of cast) {
      const quotes = Object.values(chapter.lines).flat();
      expect(quotes).toHaveLength(25);
      expect(new Set(quotes).size).toBe(25);
    }
  });

  it('unlocks only won chapters, including while a pack or the final room choice is pending', () => {
    const run = newCampaign('the-heist', 'story-test', 'fixed');
    const cases: [CampaignPhase, number, number][] = [
      ['preparing', 0, 0], ['inMatch', 0, 0], ['rewardPending', 0, 1],
      ['upgrading', 1, 1], ['preparing', 3, 3], ['rewardPending', 7, 8],
      ['inMatch', 8, 8], ['claimingFinish', 8, 9], ['completed', 8, 9],
    ];
    for (const [phase, encounter, count] of cases) {
      expect(unlockedCampaignChapters({ ...run, phase, encounter })).toEqual(ENCOUNTERS.slice(0, count));
    }
  });

  it('responds to public lead changes, both seats’ Gigs, and the rival’s die extremes', () => {
    const roll = { dieId: 'die', dieType: 'd6', result: 6, seat: 'rival', origin: 'gainGig' } as const;
    expect(rivalReaction(beat(1, 1, 0, [gig('player', 1)]))).toBe('playerGig');
    expect(rivalReaction(beat(2, 0, 1, [gig('rival', 1)]))).toBe('rivalGig');
    expect(rivalReaction(beat(3, 3, 2, [gig('player', 1), gig('rival', -1)]))).toBe('playerLead');
    expect(rivalReaction(beat(4, 2, 3, [gig('rival', 1), gig('player', -1)]))).toBe('rivalLead');
    expect(rivalReaction(beat(5, 0, 1, [gig('rival', 1)], [roll]))).toBe('highRoll');
    expect(rivalReaction(beat(6, 0, 1, [gig('rival', 1)], [{ ...roll, result: 1 }]))).toBe('lowRoll');
    expect(rivalReaction(beat(7, 0, 0, [], [{ ...roll, seat: 'player' }]))).toBeUndefined();
    const unit = { instanceId: 'unit', definitionId: 'unit', cardName: 'Unit', type: 'unit',
      faceDown: false, spent: false, power: 2, effectivePower: 2, cost: 2 };
    expect(rivalReaction(beat(8, 0, 0, [{ kind: 'defeated', seat: 'player', label: 'Defeated', card: unit }]))).toBe('playerUnitLost');
    expect(rivalReaction(beat(9, 0, 0, [{ kind: 'defeated', seat: 'rival', label: 'Defeated', card: unit }]))).toBe('rivalUnitLost');
  });

  it('deduplicates skipped or replayed beats, cycles lines, and lets the result interrupt the cooldown', () => {
    const event = beat(3, 1, 0, [gig('player', 1)]);
    const frame = { matchId: 'fresh-match', batch: 1, beats: [], now: 0 };
    const opened = advanceRivalDialogue(undefined, { ...frame, opening: 'retry' }, lines);
    expect(opened.line?.moment).toBe('retry');
    const tooEarly = advanceRivalDialogue(opened, { ...frame, beats: [event], now: 1000 }, lines);
    expect(tooEarly.line).toBe(opened.line);
    expect(advanceRivalDialogue(tooEarly, { ...frame, beats: [event], now: 5000 }, lines)).toBe(tooEarly);
    const first = advanceRivalDialogue(tooEarly, { ...frame, batch: 2, beats: [beat(4, 1, 0, [gig('player', 1)])], now: 5000 }, lines);
    const second = advanceRivalDialogue(first, { ...frame, batch: 3, beats: [beat(5, 2, 1, [gig('player', 1)])], now: 5000 + dialogueCooldown }, lines);
    expect(first.line?.moment).toBe('playerGig');
    expect(second.line?.moment).toBe('playerGig');
    expect(second.line?.text).not.toBe(first.line?.text);
    const result = advanceRivalDialogue(second, { ...frame, batch: 4, now: 10000, result: 'playerWon' }, lines);
    expect(result.line?.moment).toBe('playerWon');
    expect(advanceRivalDialogue(result, { ...frame, batch: 4, now: 20000, result: 'playerWon' }, lines)).toBe(result);
    expect(rivalResult({ gameEnded: true, winnerId: null })).toBe('draw');
    expect(advanceRivalDialogue(undefined, frame, lines).line).toBeUndefined();
  });
});
