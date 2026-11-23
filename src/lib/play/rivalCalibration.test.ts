import { describe, expect, it } from 'vitest';
import { LocalEngine, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { combatSetup, giveGig, placeCard, placeEddie, quietRivalFixture, type FixtureState } from '../../dev/combatFixtures';
import { botDecision, createEngineSession, engineCardId } from './engineSession';
import type { Move, RivalSkill, Seat } from './protocol';

function act(engine: LocalEngine, seat: Seat, move: Move) {
  const result = engine.processCommand({ commandID: String(engine.getState().ctx.stateID),
    move: move.move, input: { args: move.args ?? {} } }, seat);
  if (!result.success) throw new Error(result.error);
}

function setGig(state: FixtureState, seat: Seat, dieType: string, value: number) {
  const fixer = state.G.players[seat].fixerArea;
  const index = fixer.findIndex(id => state.G.gigDice[id].dieType === dieType);
  expect(index).toBeGreaterThanOrEqual(0);
  const [id] = fixer.splice(index, 1);
  fixer.unshift(id);
  giveGig(state, seat);
  state.G.gigDice[id].faceValue = value;
  return id;
}

function hanakoPosition(owner: Seat, thirdCopyOfTwo = false) {
  const { state, active, other } = quietRivalFixture('player');
  const attackerId = placeCard(state, active, 'rockn-rockerboy', 'field');
  const hanako = state.G.cardIndex[state.G.players[owner].zones.legendArea[0]];
  hanako.definitionId = engineCardId('hanako-arasaka-daughter-of-the-emperor');
  hanako.meta.faceDown = false;
  const ownGig = state.G.players[active].gigArea[0];
  state.G.gigDice[ownGig].faceValue = owner === active ? 2 : 1;
  const pair = [setGig(state, other, 'd4', 2), setGig(state, other, 'd6', 2)];
  const high = setGig(state, other, 'd8', 5);
  if (thirdCopyOfTwo) setGig(state, other, 'd10', 2);
  const engine = new LocalEngine(state);
  act(engine, active, { move: 'attackRival', args: { attackerId } });
  expect(engine.getFilteredView(active).prompt.choice?.type).toBe('chooseGigsToSteal');
  return { engine, active, other, pair, high };
}

describe('rival difficulty calibration', () => {
  it.each([
    ['standard', 'high', 'high'],
    ['sharp', 'pair', 'high'],
    ['masterful', 'pair', 'pair'],
  ] as const)('%s chooses between immediate Cred, its own draw and denying a public draw', (skill, own, rival) => {
    for (const [owner, objective] of [['player', own], ['rival', rival]] as const) {
      const { engine, active, other, pair, high } = hanakoPosition(owner);
      const move = botDecision(engine, active, () => .3, skill)!;
      expect(move.move).toBe('resolveStealGigs');
      const [id] = move.args!.dieIds as string[];
      expect(objective === 'high' ? [high] : pair).toContain(id);
      act(engine, active, move);
      const state = engine.getState() as FixtureState;
      expect(state.G.players[active].gigArea).toContain(id);
      expect(state.G.players[other].gigArea).not.toContain(id);
    }
  });

  it('takes the higher die when stealing a two would still leave Hanako a pair', () => {
    const { engine, active, high } = hanakoPosition('rival', true);
    const move = botDecision(engine, active, () => .3, 'masterful')!;
    expect(move).toEqual({ move: 'resolveStealGigs', args: { dieIds: [high] } });
    act(engine, active, move);
  });

  it('Masterful cannot deny a pair based on an unrevealed Legend', () => {
    const { engine, active, other } = hanakoPosition('rival');
    const state = structuredClone(engine.getState()) as FixtureState;
    const slot = state.G.players[other].zones.legendArea[0];
    state.G.cardIndex[slot].meta.faceDown = true;
    const choose = (s: FixtureState) => botDecision(new LocalEngine(s), active, () => .3, 'masterful');
    const first = choose(state);
    state.G.cardIndex[slot].definitionId = engineCardId('padre-man-of-the-cross');
    expect(choose(state)).toEqual(first);
    expect(first?.args?.dieIds).toEqual([state.G.players[other].gigArea.at(-1)]);
  });

  it.each(['standard', 'sharp', 'masterful'] as const)('resumes a live match using the selected %s opponent', rivalSkill => {
    const { state, active, other } = quietRivalFixture('rival');
    setGig(state, active, 'd4', 2);
    setGig(state, active, 'd6', 3);
    const attackerId = placeCard(state, active, 'saul-bright-stormrider', 'field');
    const defenderId = placeCard(state, other, 'animals-wrecker', 'field', true);
    // Leave the player a legal reaction so the session pauses at the rival's declaration.
    placeCard(state, other, 'floor-it', 'hand');
    placeEddie(state, other);
    const setup = { ...combatSetup, rivalSkill };
    const saved = { state, matchId: 'calibration', botRng: new SeededRNG('rival').getState(),
      commandNumber: state.ctx.stateID, known: new Map(), peeks: [], log: [] };
    const snapshot = createEngineSession(setup, undefined, saved).start();
    expect(snapshot.view.attackState).toMatchObject({ attackerId, step: 'react' });
    const target = snapshot.view.attackState?.defenderId;
    if (rivalSkill === 'masterful') expect(target).toBe(defenderId);
    else expect(target).toBeFalsy();
  });

  it('Masterful weighs a two-Gig counterattack against taking the seventh Gig', () => {
    const { state, active, other } = quietRivalFixture('player');
    setGig(state, active, 'd6', 3);
    setGig(state, other, 'd8', 4);
    const attackerId = placeCard(state, active, 'saul-bright-stormrider', 'field');
    const defenderId = placeCard(state, other, 'animals-wrecker', 'field', true);
    // Even a single concealed card prevents searching the actual combat response.
    const hidden = placeCard(state, other, 'mantis-blades', 'hand');
    const decide = (skill: RivalSkill) => botDecision(new LocalEngine(state), active, () => .3, skill);
    const steal = { move: 'attackRival', args: { attackerId } };
    const fight = { move: 'attackUnit', args: { attackerId, defenderId } };
    expect(decide('sharp')).toEqual(steal);
    expect(decide('masterful')).toEqual(fight);
    state.G.cardIndex[hidden].definitionId = engineCardId('take-control');
    expect(decide('masterful')).toEqual(fight);
    while (state.G.players[active].gigArea.length < 6) giveGig(state, active);
    expect(decide('masterful')).toEqual(steal);
  });
});
