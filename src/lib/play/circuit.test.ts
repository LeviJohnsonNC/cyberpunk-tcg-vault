import { describe, expect, it } from 'vitest';
import { CIRCUIT_CONTRACTS, circuitMarks, contractUnlocked, emptyCircuit, finishUnlocked, rankIndex, settleCircuit } from './circuit';
import { validateCircuitSetup } from './circuitMatch';
import { curatedOpponents } from './opponents';
import { prepareMatchDeck } from './matchDeck';
import type { MatchSetup, MatchSnapshot } from './protocol';

export function circuitFixture(id = 'match-1') {
  const deck = prepareMatchDeck(curatedOpponents.find(item => item.key === 'curated:heist-reloaded')!.deck);
  const setup: MatchSetup = { player: deck, rival: deck, rivalSkill: 'standard', circuit: { version: 1, contractId: 'first-call', rivalKey: 'curated:heist-reloaded' } };
  const seat = { firstPlayer: true, zones: {}, eddies: 2, availableEddies: 3, gigCount: 7, streetCred: 30 };
  const snapshot: MatchSnapshot = { matchId: id, names: { player: 'My deck', rival: deck.name }, peeks: [], log: [], gigRolls: [], knownLegends: [], report: {
    turns: 12, gigs: [{ turn: 10, player: 5, rival: 2 }, { turn: 12, player: 7, rival: 0 }], played: 6, sold: 4, lost: { player: 2, rival: 3 }, stuck: [],
  }, view: { players: { player: seat, rival: { ...seat, gigCount: 0 } }, gamePhase: 'main', turnNumber: 12, activePlayerId: 'player', overtimeActive: false, gameEnded: true, winnerId: 'player', winReason: 'gig_victory', stateID: 40, prompt: { status: 'idle', choice: null, availableMoves: [] } } };
  return { setup, snapshot };
}

describe('Afterlife Circuit settlements', () => {
  it('awards a win, first clear, bonus, promotion and cosmetic with a readable receipt', () => {
    const { setup, snapshot } = circuitFixture();
    const before = emptyCircuit(), result = settleCircuit(before, snapshot, setup, 1000)!;
    expect(result.receipt).toMatchObject({ earned: 225, baseRep: 75, contractRep: 100, markRep: 50, rankBefore: 0, rankAfter: 1, marks: ['clear', 'bonus'], unlocks: ['ghost'] });
    expect(result.progress).toMatchObject({ rep: 225, matches: 1, wins: 1, streak: 1 });
    expect(contractUnlocked(result.progress, 'chrome-debt')).toBe(true);
    expect(contractUnlocked(before, 'chrome-debt')).toBe(false);
    expect(before).toEqual(emptyCircuit());
  });
  it('does not reward the same match twice; replay wins earn only genuinely new marks', () => {
    const { setup, snapshot } = circuitFixture();
    const first = settleCircuit(emptyCircuit(), snapshot, setup)!;
    expect(settleCircuit(first.progress, snapshot, setup)).toEqual(first);
    const replay = settleCircuit(first.progress, { ...snapshot, matchId: 'replay' }, { ...setup, rivalSkill: 'masterful' })!;
    expect(replay.receipt).toMatchObject({ earned: 200, baseRep: 125, contractRep: 0, markRep: 75, marks: ['masterful'], unlocks: ['netrunner'] });
    expect(replay.progress.contracts['first-call']).toEqual(['clear', 'bonus', 'masterful']);
    expect(replay.progress.streak).toBe(2);
  });
  it.each(['concede', 'concession'])('records %s as a loss without reputation or marks', reason => {
    const { setup, snapshot } = circuitFixture();
    snapshot.view.winnerId = 'rival'; snapshot.view.winReason = reason;
    const result = settleCircuit({ ...emptyCircuit(), rep: 200, streak: 3, bestStreak: 3 }, snapshot, setup)!;
    expect(result.receipt.earned).toBe(0); expect(result.receipt.marks).toEqual([]);
    expect(result.progress).toMatchObject({ rep: 200, losses: 1, streak: 0, bestStreak: 3 });
    expect(result.progress.history[0].conceded).toBe(true);
  });
  it.each(['rival', null] as const)('awards a finished loss or draw without clearing the contract (%s)', winnerId => {
    const { setup, snapshot } = circuitFixture(); snapshot.view.winnerId = winnerId;
    const result = settleCircuit(emptyCircuit(), snapshot, setup)!;
    expect(result.receipt).toMatchObject({ earned: 25, marks: [] });
    expect(result.progress.contracts).toEqual({});
    expect(result.progress.history[0].outcome).toBe(winnerId ? 'loss' : 'draw');
  });
  it('leaves unfinished and pre-Circuit saves alone', () => {
    const { setup, snapshot } = circuitFixture();
    expect(settleCircuit(emptyCircuit(), { ...snapshot, view: { ...snapshot.view, gameEnded: false } }, setup)).toBeUndefined();
    expect(settleCircuit(emptyCircuit(), snapshot, { ...setup, circuit: undefined })).toBeUndefined();
  });
  it('does not unlock a later contract out of order or on too low a skill', () => {
    const { setup, snapshot } = circuitFixture(); setup.circuit!.contractId = 'dead-air';
    const result = settleCircuit(emptyCircuit(), snapshot, setup)!;
    expect(result.receipt.marks).toEqual([]);
    expect(contractUnlocked(emptyCircuit(), 'missing')).toBe(false);
  });
  it('awards practice REP without contract marks and retains lifetime totals beyond history', () => {
    const { setup, snapshot } = circuitFixture(); delete setup.circuit!.contractId;
    let progress = emptyCircuit();
    for (let i = 0; i < 55; i++) progress = settleCircuit(progress, { ...snapshot, matchId: `practice-${i}` }, setup)!.progress;
    expect(progress).toMatchObject({ rep: 55 * 75, matches: 55, wins: 55, bestStreak: 55, contracts: {} });
    expect(progress.history).toHaveLength(50);
  });
  it('requires the actual bonus condition and preserves earned marks on a later failure', () => {
    const { setup, snapshot } = circuitFixture(); snapshot.report!.played = 5;
    const first = settleCircuit(emptyCircuit(), snapshot, setup)!;
    expect(first.receipt.marks).toEqual(['clear']);
    snapshot.report!.played = 6;
    const second = settleCircuit(first.progress, { ...snapshot, matchId: 'bonus' }, setup)!;
    expect(second.receipt).toMatchObject({ marks: ['bonus'], contractRep: 0, markRep: 50 });
  });
  it('checks each bonus from public match facts and unlocks collection finishes', () => {
    const { setup, snapshot } = circuitFixture();
    let progress = emptyCircuit();
    for (const contract of CIRCUIT_CONTRACTS) {
      setup.circuit!.contractId = contract.id; setup.rivalSkill = 'masterful';
      progress = settleCircuit(progress, { ...snapshot, matchId: contract.id }, setup)!.progress;
    }
    expect(circuitMarks(progress)).toBe(18);
    expect(finishUnlocked(progress, 'gold')).toBe(true);
    expect(finishUnlocked(progress, 'chrome')).toBe(true);
    expect(finishUnlocked(emptyCircuit(), 'gold')).toBe(false);
    expect(rankIndex(2400)).toBe(5);
  });
  it('does not grant the low-loss bonus when an old result has no report', () => {
    const { setup, snapshot } = circuitFixture();
    const progress = emptyCircuit(); for (const c of CIRCUIT_CONTRACTS.slice(0, 4)) progress.contracts[c.id] = ['clear'];
    setup.circuit!.contractId = 'red-line'; setup.rivalSkill = 'sharp'; delete snapshot.report;
    expect(settleCircuit(progress, snapshot, setup)!.receipt.marks).toEqual(['clear']);
  });
});

describe('Circuit matchup integrity', () => {
  it('accepts every real contract list at its advertised skill after earlier clears', () => {
    const { setup } = circuitFixture(), progress = emptyCircuit();
    for (const contract of CIRCUIT_CONTRACTS) {
      setup.circuit!.contractId = contract.id; setup.rivalSkill = contract.skill;
      setup.rival = prepareMatchDeck(curatedOpponents.find(item => item.key === `curated:${contract.rival}`)!.deck);
      expect(() => validateCircuitSetup(setup, progress)).not.toThrow();
      progress.contracts[contract.id] = ['clear'];
    }
  });
  it('rejects locked contracts, mismatched lists and insufficient skill', () => {
    const { setup } = circuitFixture(); setup.circuit!.contractId = 'last-call';
    expect(() => validateCircuitSetup(setup, emptyCircuit())).toThrow('previous contract');
    setup.circuit!.contractId = 'first-call'; setup.rival.mainDeck.pop();
    expect(() => validateCircuitSetup(setup, emptyCircuit())).toThrow('does not match');
    setup.circuit!.contractId = 'dead-air';
    const progress = emptyCircuit(); progress.contracts['chrome-debt'] = ['clear'];
    expect(() => validateCircuitSetup(setup, progress)).toThrow('higher rival skill');
  });
});
