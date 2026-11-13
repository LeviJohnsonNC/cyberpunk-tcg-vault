import { describe, expect, it } from 'vitest';
import { commandPresentation } from './commandPresentation';
import { matchActions, type PickField } from './matchActions';
import type { PlayerView } from './protocol';

function view(): PlayerView {
  const seat = { firstPlayer: true, zones: {}, eddies: 0, availableEddies: 3, gigCount: 0, streetCred: 0 };
  return { players: { player: seat, rival: { ...seat, firstPlayer: false } }, gamePhase: 'main', turnNumber: 1,
    activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 1,
    prompt: { status: 'action', availableMoves: [{ moveId: 'passPhase', inputSpec: { type: 'none' } }], choice: null } };
}
const present = (state: PlayerView) => commandPresentation({ view: state, actions: matchActions(state) });

describe('contextual decision presentation', () => {
  it('uses prompt identity, not translated action labels, and preserves both turn-order moves', () => {
    const state = view(); state.gamePhase = 'setup';
    state.prompt = { status: 'choice', choice: { type: 'chooseFirstPlayer', payload: {} }, availableMoves: [{ moveId: 'resolveFirstPlayer', inputSpec: { type: 'none' } }] };
    const actions = matchActions(state).map(action => ({ ...action, label: 'Translated label' }));
    expect(commandPresentation({ view: state, actions })).toMatchObject({ variant: 'turn-order', attention: 'mandatory', title: 'Choose turn order' });
    expect(actions.map(action => action.move({}).args)).toEqual([{ goFirst: true }, { goFirst: false }]);
  });
  it.each([
    ['chooseCardType', 'resolveCardTypeChoice', { cardTypes: ['unit', 'gear', 'program'] }, 'Choose a card type'],
    ['revealDestination', 'resolveRevealDestination', { destinations: ['hand', 'trash'] }, 'Place the revealed card'],
  ] as const)('names the decision rather than its first option for %s', (type, moveId, payload, title) => {
    const state = view();
    state.prompt = { status: 'choice', choice: { type, payload }, availableMoves: [{ moveId, inputSpec: { type: 'none' } }] };
    expect(present(state)).toMatchObject({ title, attention: 'mandatory' });
    expect(matchActions(state).map(action => action.move({}).move)).toEqual(Array(type === 'chooseCardType' ? 3 : 2).fill(moveId));
  });
  it('keeps the opening-hand decision after the mulligan is consumed', () => {
    const state = view(); state.gamePhase = 'setup';
    state.prompt.availableMoves = [{ moveId: 'keepHand', inputSpec: { type: 'none' } }];
    expect(present(state)).toMatchObject({ variant: 'opening-hand', title: 'Keep this hand?', attention: 'mandatory' });
  });
  it('does not turn a voluntary payment selection into a forced game prompt', () => {
    const state = view();
    state.prompt.availableMoves.push({ moveId: 'callLegend', inputSpec: { type: 'callLegend', candidates: ['legend'] } });
    const selected = matchActions(state).find(action => action.id === 'callLegend')!;
    const active: PickField = { id: 'payment', label: 'Pay 2 €$', min: 2, max: 2, options: [] };
    const result = commandPresentation({ view: state, actions: matchActions(state), selected, active });
    expect(result).toMatchObject({ variant: 'payment', attention: 'selection' });
    state.prompt.choice = { type: 'redirectDefeat', payload: {} };
    expect(commandPresentation({ view: state, actions: [selected], selected, active }).attention).toBe('mandatory');
  });
  it('emphasizes a reaction on the rival turn and retains its pass action', () => {
    const state = view(); state.activePlayerId = 'rival';
    state.attackState = { attackerId: 'rival-unit', step: 'react', rivalId: 'player' };
    state.prompt.availableMoves = [{ moveId: 'resolveAttack', inputSpec: { type: 'none' } }];
    expect(present(state)).toMatchObject({ variant: 'combat', attention: 'mandatory', title: 'Respond to the attack' });
    expect(matchActions(state)[0].move({})).toEqual({ move: 'resolveAttack', args: { pass: true } });
    expect(commandPresentation({ view: state, actions: matchActions(state), playback: true }).attention).toBe('waiting');
  });
  it('gives resolution precedence over a stale choice, while completion wins over playback', () => {
    const state = view();
    state.prompt = { status: 'waiting', availableMoves: [], choice: { type: 'chooseTarget', payload: {} } };
    expect(present(state).attention).toBe('waiting');
    expect(commandPresentation({ view: state, actions: [], rolling: true }).title).toBe('Rolling Gigs');
    state.gameEnded = true; state.winnerId = 'player';
    expect(commandPresentation({ view: state, actions: [], playback: true })).toMatchObject({ variant: 'complete', title: 'You win' });
  });
  it('preserves optional forced effects and does not change the entrance key during local selection', () => {
    const state = view();
    state.prompt = { status: 'choice', availableMoves: [{ moveId: 'resolveEffectTarget', inputSpec: { type: 'none' } }], choice: {
      type: 'chooseTarget', payload: { eligibleIds: ['a', 'b'], min: 0, max: 2, canDecline: true },
    } };
    const actions = matchActions(state), selected = actions[0];
    const before = commandPresentation({ view: state, actions, selected, active: selected.fields({})[0] });
    const after = commandPresentation({ view: state, actions, selected, active: selected.fields({ targets: ['a'] })[0] });
    expect(before.cueKey).toBe(after.cueKey);
    expect(actions[1].move({})).toEqual({ move: 'resolveEffectTarget', args: { pass: true } });
    expect(before.attention).toBe('mandatory');
  });
  it('keeps normal overtime play quiet and identifies the active attack step', () => {
    const state = view(); state.overtimeActive = true;
    expect(present(state)).toMatchObject({ variant: 'normal-turn', attention: 'normal' });
    const selected = { id: 'attackUnit', label: 'Attack', fields: () => [], move: () => ({ move: 'attackUnit' }) };
    const args = { view: state, actions: [selected], selected };
    expect(commandPresentation(args).title).toBe('Choose an attacker');
    expect(commandPresentation({ ...args, active: { id: 'defender', label: 'Defender', min: 1, max: 1, options: [] } }).title).toBe('Choose an attack target');
  });
});
