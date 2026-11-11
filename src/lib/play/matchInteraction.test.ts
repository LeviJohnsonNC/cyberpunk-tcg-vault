import { describe, expect, it } from 'vitest';
import { matchActions, isReady } from './matchActions';
import { activeStep, cardIntents, dropIntents, reorderPick, intentLabel, suggestPayment, updatePick } from './matchInteraction';
import type { CardView, PlayerView } from './protocol';

const card = (id: string, type = 'unit'): CardView => ({ instanceId: id, definitionId: id, cardName: id, type, zone: 'hand', faceDown: false, spent: false, power: 1, effectivePower: 1, cost: 1 });
function view(): PlayerView {
  return { players: { player: { zones: { hand: [card('unit'), card('gear', 'gear'), card('program', 'program')], field: [card('host')] }, firstPlayer: true, eddies: 2, availableEddies: 3, gigCount: 0, streetCred: 0 }, rival: { zones: {}, firstPlayer: false, eddies: 0, availableEddies: 0, gigCount: 0, streetCred: 0 } },
    gamePhase: 'main', turnNumber: 1, activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 1,
    prompt: { status: 'action', choice: null, availableMoves: [
      { moveId: 'playCard', inputSpec: { type: 'playCard', candidates: [{ cardId: 'unit' }, { cardId: 'program' }, { cardId: 'gear', attachTargets: ['host'] }] } },
      { moveId: 'sellCard', inputSpec: { type: 'sellCard', candidates: ['unit'] } },
    ], payment: { eddieIds: ['eddie-a', 'eddie-b'], eddies: 2, legendIds: ['legend'], effectGearHosts: {}, costs: { playCard: { unit: { amount: 2 }, gear: { amount: 1 }, program: { amount: 1 } } } } } };
}
describe('direct table intents', () => {
  it('suggests a payment of Eddies before Legends and never overrides the player', () => {
    const actions = matchActions(view());
    const [play] = dropIntents(actions, card('unit'), { key: 'field:player' });
    const action = actions[play.action];
    const legends = [{ ...card('legend'), zone: 'legendArea', faceDown: true }];
    const suggested = suggestPayment(action, play.picks, legends);
    expect(suggested.payment).toEqual(['eddie-a', 'eddie-b']);
    expect(isReady(action.fields(suggested), suggested)).toBe(true);
    expect(suggestPayment(action, { ...play.picks, payment: [] }, legends).payment).toEqual([]);
    expect(suggestPayment(action, { ...play.picks, payment: ['legend'] }, legends).payment).toEqual(['legend']);
    // Nothing is suggested before the card that sets the cost is chosen.
    expect(suggestPayment(action, {}, legends)).toEqual({});
  });
  it('spends face-down Legends before face-up ones when Eddies run short', () => {
    const state = view();
    state.prompt.payment = { ...state.prompt.payment!, eddieIds: ['eddie-a'], eddies: 1, legendIds: ['shown', 'hidden'], costs: { playCard: { unit: { amount: 2 } } } };
    const actions = matchActions(state);
    const [play] = dropIntents(actions, card('unit'), { key: 'field:player' });
    const legends = [{ ...card('shown'), zone: 'legendArea' }, { ...card('hidden'), zone: 'legendArea', faceDown: true }];
    expect(suggestPayment(actions[play.action], play.picks, legends).payment).toEqual(['eddie-a', 'hidden']);
  });
  it('maps distinct destinations onto the existing legal commands and keeps payment uncommitted', () => {
    const actions = matchActions(view());
    const [play] = dropIntents(actions, card('unit'), { key: 'field:player' });
    expect(actions[play.action].id).toBe('playCard');
    expect(isReady(actions[play.action].fields(play.picks), play.picks)).toBe(false);
    const picks = { ...play.picks, payment: ['eddie-a', 'legend'] };
    expect(actions[play.action].move(picks)).toEqual({ move: 'playCard', args: { cardId: 'unit', attachToId: undefined, paymentSourceIds: ['eddie-a', 'legend'] } });
    const [sell] = dropIntents(actions, card('unit'), { key: 'eddies:player' });
    expect(actions[sell.action].move(sell.picks)).toEqual({ move: 'sellCard', args: { cardId: 'unit' } });
    expect(dropIntents(actions, card('unit'), { key: 'field:rival' })).toEqual([]);
    expect(dropIntents(actions, card('illegal'), { key: 'field:player' })).toEqual([]);
    expect(dropIntents(actions, card('program', 'program'), { key: 'field:player' })).toEqual([]);
    expect(dropIntents(actions, card('program', 'program'), { key: 'program' })).toHaveLength(1);
  });
  it('binds Gear to the selected legal host and rejects empty or opposing destinations', () => {
    const actions = matchActions(view());
    expect(dropIntents(actions, card('gear', 'gear'), { key: 'field:player' })).toEqual([]);
    expect(dropIntents(actions, card('gear', 'gear'), { key: 'card', cardId: 'other' })).toEqual([]);
    const [attach] = dropIntents(actions, card('gear', 'gear'), { key: 'card', cardId: 'host' });
    expect(attach.picks).toEqual({ card: ['gear'], host: ['host'] });
    expect(activeStep(actions[attach.action].fields(attach.picks), attach.picks)?.id).toBe('payment');
  });
  it('retains both legal Legend entries and multiple abilities instead of choosing by gesture', () => {
    const v = view();
    v.prompt.availableMoves.push({ moveId: 'goSolo', inputSpec: { type: 'goSolo', candidates: ['unit'] } });
    const actions = matchActions(v);
    const legend = { ...card('unit'), zone: 'legendArea' };
    const entries = dropIntents(actions, legend, { key: 'field:player' });
    expect(entries.map((intent) => actions[intent.action].id)).toEqual(['playCard', 'goSolo']);
    expect(intentLabel(actions[entries[0].action], entries[0].picks, legend)).toBe('Play normally · 2 €$');
    v.prompt.availableMoves = [{ moveId: 'activateAbility', inputSpec: { type: 'activateAbility', candidates: [
      { cardId: 'unit', abilityIndex: 0, eddieCost: 0, spendsCard: true }, { cardId: 'unit', abilityIndex: 1, eddieCost: 1, spendsCard: false },
    ] } }];
    expect(cardIntents(matchActions(v), 'unit').map((intent) => intent.picks)).toEqual([{ ability: ['0'] }, { ability: ['1'] }]);
  });
  it('changes only the active step when a Legend is both the subject and a payment candidate', () => {
    const v = view();
    v.prompt.availableMoves = [{ moveId: 'callLegend', inputSpec: { type: 'callLegend', candidates: ['legend'] } }];
    v.prompt.payment!.costs = { callLegend: { action: { amount: 1 } } };
    const [call] = matchActions(v);
    const picks = updatePick(call, {}, 'card', 'legend')!;
    const step = activeStep(call.fields(picks), picks)!;
    expect(step.id).toBe('payment');
    const paid = updatePick(call, picks, step.id, 'legend')!;
    expect(paid).toEqual({ card: ['legend'], payment: ['legend'] });
    expect(activeStep(call.fields(paid), paid, 'card')?.id).toBe('card');
    expect(updatePick(call, paid, 'card', 'legend')).toEqual({ card: [] });
  });
  it('uses the adapter’s per-attacker legal targets and only exposes blocking in the offered window', () => {
    const v = view();
    v.players.rival.zones.field = [{ ...card('spent'), spent: true }, card('ready')];
    v.prompt.availableMoves = [{ moveId: 'attackUnit', inputSpec: { type: 'attackUnit', fromCandidates: ['host'], toCandidates: ['spent', 'ready'] } },
      { moveId: 'attackRival', inputSpec: { type: 'attackRival', candidates: ['host'] } }];
    const actions = matchActions(v);
    expect(dropIntents(actions, card('host'), { key: 'card', cardId: 'ready' })).toEqual([]);
    const [attack] = dropIntents(actions, card('host'), { key: 'card', cardId: 'spent' });
    expect(actions[attack.action].move(attack.picks).args).toEqual({ attackerId: 'host', defenderId: 'spent' });
    expect(dropIntents(actions, card('host'), { key: 'gigs:rival' })).toHaveLength(1);
    expect(dropIntents(actions, card('host'), { key: 'attacker' })).toEqual([]);
    v.prompt.availableMoves = [{ moveId: 'useBlocker', inputSpec: { type: 'useBlocker', candidates: ['host'] } }];
    const [block] = dropIntents(matchActions(v), card('host'), { key: 'attacker' });
    expect(matchActions(v)[block.action].move(block.picks).args).toEqual({ blockerId: 'host' });
  });
});

describe('ordered and optional table decisions', () => {
  function scry() {
    const v = view();
    v.prompt = { status: 'choice', availableMoves: [{ moveId: 'resolveScry', inputSpec: { type: 'none' } }], choice: { type: 'scry', payload: {
      revealedCards: [card('one'), card('two'), card('three')], destinations: [
        { zone: 'hand', max: 1, eligibleCardIds: ['one', 'two', 'three'] },
        { zone: 'deckTop', max: 2, eligibleCardIds: ['one', 'two', 'three'] },
        { zone: 'deckBottom', remainder: true, eligibleCardIds: ['one', 'two', 'three'] },
      ],
    } } };
    return matchActions(v)[0];
  }
  it('starts optional destinations at the first step and keeps each revealed card in one place', () => {
    const action = scry();
    expect(activeStep(action.fields({}), {})?.id).toBe('0');
    let picks = updatePick(action, {}, '0', 'one')!;
    expect(updatePick(action, picks, '1', 'one')).toBeUndefined();
    picks = updatePick(action, picks, '1', 'two')!;
    picks = updatePick(action, picks, '1', 'three')!;
    expect(action.move(picks).args).toEqual({ destinations: [{ zone: 'hand', cardIds: ['one'] }, { zone: 'deckTop', cardIds: ['three', 'two'] }] });
    expect(updatePick(action, picks, '1', 'unknown')).toBeUndefined();
  });
  it('reorders only the existing ordered selection and preserves engine top-of-deck semantics', () => {
    const action = scry(), picks = { '0': ['one'], '1': ['two', 'three'] };
    const next = reorderPick(action, picks, '1', ['three', 'two'])!;
    expect(action.move(next).args).toEqual({ destinations: [{ zone: 'hand', cardIds: ['one'] }, { zone: 'deckTop', cardIds: ['two', 'three'] }] });
    expect(reorderPick(action, picks, '1', ['two', 'two'])).toBeUndefined();
    expect(reorderPick(action, picks, '1', ['one', 'two'])).toBeUndefined();
    expect(reorderPick(action, picks, '0', ['one'])).toBeUndefined();
    expect(picks).toEqual({ '0': ['one'], '1': ['two', 'three'] });
  });
});
