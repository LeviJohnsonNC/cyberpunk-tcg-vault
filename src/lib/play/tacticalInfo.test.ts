import { describe, expect, it } from 'vitest';
import { matchActions } from './matchActions';
import { cardPreviewPosition, cardPreviewStatus, decisionSource, powerExplanation } from './tacticalInfo';
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

describe('decision source', () => {
  it('finds the visible source of a forced paid play', () => {
    const state = view();
    state.prompt.payment!.eddieIds = [];
    state.prompt.payment!.costs = { resolveCardToPlay: { unit: { amount: 2 } } };
    state.prompt.status = 'choice';
    state.prompt.availableMoves = [{ moveId: 'resolveCardToPlay', inputSpec: { type: 'none' } }];
    state.prompt.choice = { type: 'chooseCardToPlay', payload: { cardIds: ['unit'], source: { cardId: 'legend' } } };
    const action = matchActions(state)[0];
    expect(action.fields({})[0].id).toBe('payment');
    expect(decisionSource(state, action, {}, [card('legend')])?.instanceId).toBe('legend');
    expect(decisionSource(state, action, {}, [card('legend', { definitionId: '' })])).toBeUndefined();
  });
});

describe('card art previews', () => {
  const lane = { left: 200, top: 500, width: 800, height: 300 };
  const slot = { left: 205, top: 620, width: 100, height: 140 };

  it('rises from the hand baseline, fits below the command and stays inside the hand lane', () => {
    const preview = cardPreviewPosition(slot, lane, 300, true, 0, [], [])!;
    expect(preview.x).toBe(lane.left);
    expect(preview.y).toBeGreaterThanOrEqual(lane.top);
    expect(preview.y + preview.height).toBe(slot.top + slot.height);
    expect(preview.width / preview.height).toBeCloseTo(5 / 7);
    const roomy = { left: 0, top: 0, width: 1800, height: 1000 };
    expect(cardPreviewPosition(slot, roomy, 340, true, 1, [], [])).toMatchObject({ width: 340, height: 496 });
  });

  it('uses the empty side of a field card and gives protected controls priority', () => {
    const area = { left: 0, top: 0, width: 1400, height: 800 };
    const anchor = { left: 600, top: 300, width: 100, height: 140 };
    const unit = { left: 720, top: 290, width: 110, height: 154 };
    const left = cardPreviewPosition(anchor, area, 300, false, 0, [], [unit])!;
    expect(left.x + left.width).toBeLessThan(anchor.left);
    expect(left.width).toBe(300);
    expect(cardPreviewPosition(anchor, area, 300, false, 0, [area], [])).toBeUndefined();
    expect(cardPreviewPosition(slot, lane, 300, true, 0, [slot], [])).toBeUndefined();
    expect(cardPreviewPosition(slot, { ...lane, top: 610 }, 300, true, 0, [], [])).toBeUndefined();
  });

  it('only adds live changes to visible card art', () => {
    const changed = card('v', { type: 'unit', cost: 2, effectiveCost: 1, power: 3, effectivePower: 5, hasLag: true });
    expect(cardPreviewStatus(changed)).toEqual(['Cost 1 €$', 'Power 5', 'Lag']);
    expect(cardPreviewStatus({ ...changed, definitionId: '' })).toEqual([]);
    expect(cardPreviewStatus({ ...changed, effectiveCost: 2, effectivePower: 3, hasLag: false })).toEqual([]);
  });
});
