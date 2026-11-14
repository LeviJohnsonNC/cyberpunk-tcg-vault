import { describe, expect, it } from 'vitest';
import { isReady, matchActions } from './matchActions';
import { describeAction, hideConcealedTargets } from './matchView';
import type { CardView, PlayerView } from './protocol';

const card = (instanceId: string, fields: Partial<CardView> = {}): CardView => ({
  instanceId, definitionId: instanceId, cardName: instanceId, faceDown: false, spent: false, power: 2, effectivePower: 2, cost: 1, ...fields,
});

const freshView = (): PlayerView => ({
  players: {
    player: { firstPlayer: true, zones: {}, eddies: 0, availableEddies: 3, gigCount: 0, streetCred: 0 },
    rival: { firstPlayer: false, zones: {}, eddies: 0, availableEddies: 3, gigCount: 0, streetCred: 0 },
  },
  gamePhase: 'main', turnNumber: 1, activePlayerId: 'player', overtimeActive: false, gameEnded: false,
  winnerId: null, winReason: null, stateID: 1, prompt: { status: 'action', availableMoves: [], choice: null },
});

describe('desktop match prompts', () => {
  it('requires a legal host for Gear and keeps ordinary card plays simple', () => {
    const view = freshView();
    view.players.player.zones.hand = [card('gear'), card('program')];
    view.players.player.zones.field = [card('host')];
    view.prompt.availableMoves = [{ moveId: 'playCard', inputSpec: { type: 'playCard', candidates: [
      { cardId: 'gear', attachTargets: ['host'] }, { cardId: 'program' }, { cardId: 'unattachable', attachTargets: [] },
    ] } }];
    const [action] = matchActions(view);
    expect(action.fields({})[0].options.map(({ id }) => id)).toEqual(['gear', 'program']);
    expect(isReady(action.fields({ card: ['gear'] }), { card: ['gear'] })).toBe(false);
    const picks = { card: ['gear'], host: ['host'] };
    expect(isReady(action.fields(picks), picks)).toBe(true);
    expect(action.move(picks)).toEqual({ move: 'playCard', args: { cardId: 'gear', attachToId: 'host' } });
    expect(action.fields({ card: ['program'] })).toHaveLength(1);
  });

  it('links Eddie payment choices to the mat without exposing pool markers to the engine', () => {
    const view = freshView();
    view.players.player.zones.eddieArea = [card('spent-card', { zone: 'eddieArea', spent: true }), card('sold-card', { zone: 'eddieArea' })];
    view.prompt.availableMoves = [{ moveId: 'callLegend', inputSpec: { type: 'callLegend', candidates: ['calling'] } }];
    view.prompt.payment = {
      eddieIds: ['sold-card'], eddies: 2, legendIds: ['reserved', 'ready-legend'], effectGearHosts: {},
      costs: { callLegend: { action: { amount: 2, reservedLegendIds: ['reserved'] } } },
    };
    const [action] = matchActions(view);
    const fields = action.fields({ card: ['calling'] });
    expect(fields[1].options.slice(0, 2).map(({ label }) => label)).toEqual(['Eddie 2', 'Pooled Eddie 1']);
    expect(fields[1].options.map(({ id, cardId }) => ({ id, cardId }))).toEqual([
      { id: 'sold-card', cardId: 'sold-card' }, { id: 'pool:0', cardId: 'pool:0' },
      { id: 'ready-legend', cardId: 'ready-legend' },
    ]);
    const picks = { card: ['calling'], payment: ['sold-card', 'pool:0'] };
    expect(isReady(fields, picks)).toBe(true);
    expect(action.move(picks)).toEqual({ move: 'callLegend', args: { legendId: 'calling', paymentSourceIds: ['sold-card'] } });
  });

  it('limits atomic Gig adjustments to legal faces and keeps decline available', () => {
    const view = freshView();
    view.players.player.zones.gigArea = [card('gig', { definitionId: 'd6', zone: 'gigArea', power: 5 })];
    view.prompt = { status: 'choice', availableMoves: [{ moveId: 'resolveAdjustGig', inputSpec: { type: 'none' } }], choice: {
      type: 'chooseTarget', payload: { type: 'effectTarget', eligibleIds: ['gig'], adjustGig: { direction: 'increase', maxAmount: 3, chooseUpTo: true } },
    } };
    const [adjust, keep] = matchActions(view);
    expect(adjust.fields({})[0].options.map(({ id }) => id)).toEqual(['5', '6']);
    expect(adjust.move({ value: ['6'] }).args).toEqual({ kind: 'adjust', dieId: 'gig', value: 6 });
    expect(keep.move({}).args).toEqual({ kind: 'noAdjustment' });
  });

  it('keeps top-deck ordering and prevents assigning one revealed card twice', () => {
    const view = freshView();
    view.prompt = { status: 'choice', availableMoves: [{ moveId: 'resolveScry', inputSpec: { type: 'none' } }], choice: {
      type: 'scry', payload: { revealedCards: [card('one'), card('two'), card('three')], destinations: [
        { zone: 'hand', max: 1, eligibleCardIds: ['one', 'two', 'three'] },
        { zone: 'deckTop', max: 2, eligibleCardIds: ['one', 'two', 'three'] },
        { zone: 'deckBottom', remainder: true, eligibleCardIds: ['one', 'two', 'three'] },
      ] },
    } };
    const [action] = matchActions(view);
    const picks = { '0': ['one'], '1': ['two', 'three'] };
    expect(action.fields(picks)[1].options.map(({ id }) => id)).toEqual(['two', 'three']);
    expect(action.move(picks).args).toEqual({ destinations: [
      { zone: 'hand', cardIds: ['one'] }, { zone: 'deckTop', cardIds: ['three', 'two'] },
    ] });
  });

  it('keeps concealed targets masked until the player receives an authorized peek', () => {
    const view = freshView();
    const slot = card('slot', { definitionId: '', cardName: null, faceDown: true, zone: 'legendArea' });
    view.players.player.zones.legendArea = [slot];
    view.prompt = { status: 'choice', availableMoves: [{ moveId: 'resolveEffectTarget', inputSpec: { type: 'none' } }], choice: {
      type: 'chooseTarget', payload: { eligibleIds: ['slot'], cards: [card('slot', { cardName: 'Secret Legend' })],
        source: { cardId: 'slot', displayName: 'Secret Legend' } },
    } };
    const filtered = hideConcealedTargets(view);
    expect(JSON.stringify(filtered)).not.toContain('Secret Legend');
    const [choose] = matchActions(filtered);
    expect(choose.fields({})[0].options[0].label).toBe('Legend slot 1');
    expect(choose.move({ targets: ['slot'] }).args).toEqual({ targetIds: ['slot'] });
  });

  it('never looks up a private rival card when creating a public action log', () => {
    const view = freshView();
    view.players.rival.zones.hand = 6;
    expect(describeAction('rival', { move: 'sellCard', args: { cardId: 'private' } }, view, view)).toBe('Sold a card for an Eddie.');
    expect(describeAction('rival', { move: 'playCard', args: { cardId: 'private' } }, view, view)).toBe('Played a card.');
  });
});
