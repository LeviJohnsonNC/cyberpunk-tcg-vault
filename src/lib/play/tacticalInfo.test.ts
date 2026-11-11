import { describe, expect, it } from 'vitest';
import { matchActions } from './matchActions';
import { decisionSource, paymentPreview, powerExplanation, previewPosition } from './tacticalInfo';
import type { CardEffectView, CardView, PlayerView } from './protocol';

const card = (id: string, extra: Partial<CardView> = {}): CardView => ({ instanceId: id, definitionId: id, cardName: id, zone: 'field', type: 'unit', faceDown: false, spent: false, power: 4, effectivePower: 4, cost: 2, ...extra });
const effect = (extra: Partial<CardEffectView> = {}): CardEffectView => ({ id: 'buff', sourceName: 'Boost', label: '+2 PWR', detail: 'Boost: +2 power this turn.', effectKind: 'powerModifier', modifierLabel: '+2', tone: 'buff', durationLabel: 'this turn', defeatsAtEndOfTurn: false, ...extra });
function view(): PlayerView {
  const seat = { zones: {}, firstPlayer: false, eddies: 2, availableEddies: 3, gigCount: 0, streetCred: 0 };
  return { players: { player: { ...seat, zones: { hand: [card('unit', { zone: 'hand' })], legendArea: [card('legend', { type: 'legend', zone: 'legendArea' })] } }, rival: seat },
    gamePhase: 'main', turnNumber: 1, activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 1,
    prompt: { status: 'action', choice: null, availableMoves: [{ moveId: 'playCard', inputSpec: { type: 'playCard', candidates: [{ cardId: 'unit' }] } }],
      payment: { eddieIds: ['e1', 'e2'], eddies: 2, legendIds: ['legend'], effectGearHosts: {}, costs: { playCard: { unit: { amount: 2 } } } } } };
}

describe('visible power explanations', () => {
  it('explains attached Gear and modifiers in engine order, keeping damage separate', () => {
    const unit = card('unit', { effectivePower: 18, damage: 3, activeEffects: [effect(), effect({ id: 'double', effectKind: 'powerMultiplier', modifierLabel: 'x2' })] });
    const gear = card('gun', { type: 'gear', power: 3, attachedToId: 'unit' });
    expect(powerExplanation(unit, [unit, gear])).toMatchObject({ exact: true, text: '(Base 4 + 3 Gear + 2 Boost) × 2 = 18', gear: [gear] });
  });
  it('does not invent arithmetic or source attribution for unprojected modifiers', () => {
    const unit = card('unit', { effectivePower: 9 });
    expect(powerExplanation(unit, [])).toMatchObject({ exact: false, text: 'Base 4 · Current 9' });
    expect(powerExplanation(card('secret', { definitionId: '', cardName: null }), [])).toBeUndefined();
    expect(powerExplanation(card('gun', { type: 'gear' }), [])).toBeUndefined();
  });
  it('ignores detached or concealed Gear and shows the zero floor', () => {
    const unit = card('unit', { effectivePower: 0, activeEffects: [effect({ modifierLabel: '-6' })] });
    const irrelevant = [card('trash', { power: 5, zone: 'trash', attachedToId: 'unit' }), card('hidden', { definitionId: '', power: 9, attachedToId: 'unit' })];
    expect(powerExplanation(unit, irrelevant)).toMatchObject({ exact: true, text: 'Base 4 − 6 Boost (minimum 0) = 0', gear: [] });
  });
});

describe('payment consequences', () => {
  it('shows the actual engine cost and selected sources without changing a command', () => {
    const state = view(), action = matchActions(state)[0];
    const picks = { card: ['unit'], payment: ['e1', 'legend'] };
    const before = action.move(picks);
    expect(paymentPreview(state, action, picks)).toMatchObject({ amount: 2, ready: true, afterPayment: 1, sources: [{ id: 'e1', legend: false }, { id: 'legend', legend: true }] });
    expect(action.move(picks)).toEqual(before);
    expect(paymentPreview(state, action, { card: ['unit'], payment: [] })).toMatchObject({ ready: false });
    expect(paymentPreview(state, action, {})).toBeUndefined();
  });
  it('accounts separately for reserved Legends and handles a zero-Eddie ability', () => {
    const state = view();
    state.prompt.availableMoves = [{ moveId: 'activateAbility', inputSpec: { type: 'selectAbility', candidates: [{ cardId: 'legend', abilityIndex: 0, eddieCost: 0, spendsCard: true }] } }];
    state.prompt.payment!.costs = { activateAbility: { 'legend:0': { amount: 0, reservedLegendIds: ['legend'] } } };
    const action = matchActions(state)[0];
    expect(paymentPreview(state, action, {})).toBeUndefined();
    expect(paymentPreview(state, action, { ability: ['0'] })).toMatchObject({ amount: 0, ready: true, afterPayment: 3, afterCosts: 2, reserved: ['legend'] });
  });
  it('supports pool Eddies and forced paid plays whose first field is payment', () => {
    const state = view();
    state.prompt.payment!.eddieIds = [];
    state.prompt.payment!.costs = { resolveCardToPlay: { unit: { amount: 2 } } };
    state.prompt.status = 'choice';
    state.prompt.availableMoves = [{ moveId: 'resolveCardToPlay', inputSpec: { type: 'none' } }];
    state.prompt.choice = { type: 'chooseCardToPlay', payload: { cardIds: ['unit'], source: { cardId: 'legend' } } };
    const action = matchActions(state)[0];
    expect(action.fields({})[0].id).toBe('payment');
    expect(paymentPreview(state, action, { payment: ['pool:0', 'pool:1'] })).toMatchObject({ ready: true, amount: 2, afterPayment: 1 });
    expect(decisionSource(state, action, {}, [card('legend')])?.instanceId).toBe('legend');
    expect(decisionSource(state, action, {}, [card('legend', { definitionId: '' })])).toBeUndefined();
  });
});

describe('preview placement', () => {
  it('keeps the close-up off the hand and decision controls', () => {
    const anchor = { left: 550, top: 620, width: 100, height: 140 };
    const blocked = [{ left: 300, top: 600, width: 700, height: 180 }, { left: 20, top: 420, width: 1240, height: 60 }];
    // A shorter, wider close-up fits above the command bar on a laptop.
    expect(previewPosition(anchor, { width: 1280, height: 800 }, blocked)).toEqual({ x: 828, y: 12, landscape: true });
    const roomy = previewPosition(anchor, { width: 1800, height: 1000 }, [{ left: 300, top: 600, width: 700, height: 180 }]);
    expect(roomy).toEqual({ x: 1502, y: 12, landscape: false });
  });
  it('yields when eligible targets or a short viewport leave no room', () => {
    const anchor = { left: 500, top: 200, width: 100, height: 140 };
    expect(previewPosition(anchor, { width: 1280, height: 360 }, [])).toBeUndefined();
    expect(previewPosition(anchor, { width: 1280, height: 800 }, [{ left: 0, top: 0, width: 1280, height: 800 }])).toBeUndefined();
  });
});
