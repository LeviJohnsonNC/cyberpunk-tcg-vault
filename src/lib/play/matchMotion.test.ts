import { describe, expect, it } from 'vitest';
import { beatPace, planMotion, tableAccents } from './matchMotion';
import type { CardView, PlayerView } from './protocol';

const card = (id: string, zone: string, extra: Partial<CardView> = {}): CardView => ({ instanceId: id, definitionId: id, cardName: id, zone, type: 'unit', faceDown: false, spent: false, power: 3, effectivePower: 3, cost: 2, ...extra });
const fresh = (): PlayerView => ({ players: {
  player: { zones: { field: [card('guard', 'field')], deck: 30, hand: [card('my-hand', 'hand')], legendArea: [], eddieArea: [], gigArea: [card('my-gig', 'gigArea')], trash: [] }, firstPlayer: true, eddies: 2, availableEddies: 5, gigCount: 1, streetCred: 3 },
  rival: { zones: { field: [card('raider', 'field')], deck: 31, hand: 5, legendArea: [], eddieArea: [], gigArea: [], trash: [] }, firstPlayer: false, eddies: 3, availableEddies: 4, gigCount: 0, streetCred: 0 },
}, gamePhase: 'main', turnNumber: 4, activePlayerId: 'rival', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 20,
  prompt: { status: 'waiting', choice: null, availableMoves: [] }, attackState: null });

describe('table motion plan', () => {
  it('stays still without an earlier frame', () => {
    expect(planMotion(undefined, fresh())).toEqual({ defeated: [], showcase: [], destinations: {} });
  });

  it('sends cards that leave the table to the pile they went to', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.player.zones.field = [];
    after.players.player.zones.trash = [card('guard', 'trash')];
    after.players.player.zones.hand = [];
    after.players.rival.zones.field = [];
    const plan = planMotion(before, after, { seat: 'rival', changes: [{ kind: 'defeated', seat: 'player', label: 'Defeated', card: card('guard', 'field') }] });
    expect(plan.destinations).toEqual({ guard: 'trash:player', 'my-hand': 'deck:player', raider: 'hand:rival' });
    expect(plan.defeated).toEqual(['guard']);
  });

  it('follows a stolen Gig to the other side instead of sending it to a pile', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.player.zones.gigArea = [];
    after.players.rival.zones.gigArea = [card('my-gig', 'gigArea')];
    expect(planMotion(before, after).destinations).toEqual({});
  });

  it('presents only rival cards that arrive from a hidden zone', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.rival.zones.field = [card('raider', 'field'), card('fresh', 'field')];
    const changes = [
      { kind: 'played' as const, seat: 'rival' as const, label: 'Played', card: card('fresh', 'field') },
      { kind: 'played' as const, seat: 'rival' as const, label: 'Entered Field', card: card('raider', 'field') },
    ];
    expect(planMotion(before, after, { seat: 'rival', changes }).showcase).toEqual(['fresh']);
    expect(planMotion(before, after, { seat: 'player', changes }).showcase).toEqual([]);
  });

  it('lands the hit on the Gigs once, when the attack gets through', () => {
    const before = fresh(), reached = structuredClone(before), stolen = structuredClone(before);
    reached.attackState = { attackerId: 'raider', step: 'steal' };
    expect(planMotion(before, reached).strike).toEqual({ attackerId: 'raider', targetZone: 'gigs:player' });
    stolen.players.player.gigCount = 0;
    expect(planMotion(reached, stolen).strike).toBeUndefined();
  });

  it('lands the hit on the defender or the blocker when a fight resolves', () => {
    const before = fresh(), after = structuredClone(before);
    before.attackState = { attackerId: 'raider', defenderId: 'guard', step: 'react' };
    expect(planMotion(before, after).strike).toEqual({ attackerId: 'raider', targetId: 'guard' });
    before.attackState = { attackerId: 'raider', step: 'react' };
    expect(planMotion(before, after, { seat: 'player', changes: [], source: card('guard', 'field') }).strike).toEqual({ attackerId: 'raider', targetId: 'guard' });
  });

  it('shows no hit when an attack on the Gigs ends without reaching them', () => {
    const before = fresh(), after = structuredClone(before);
    before.attackState = { attackerId: 'raider', step: 'react' };
    expect(planMotion(before, after).strike).toBeUndefined();
  });

  it('keeps long sequences readable', () => {
    expect(beatPace(1)).toBe(1);
    expect(beatPace(100)).toBe(0.55);
  });
});

describe('table accents', () => {
  it('rewards plays, called Legends and sales on both sides without revealing an Eddie identity', () => {
    const before = fresh(), after = structuredClone(before);
    before.players.rival.zones.legendArea = [card('legend', 'legendArea', { faceDown: true, definitionId: '', cardName: null })];
    after.players.rival.zones.legendArea = [card('legend', 'legendArea', { type: 'legend' })];
    after.players.player.zones.hand = [];
    after.players.player.zones.field = [card('guard', 'field'), card('my-hand', 'field')];
    after.players.rival.zones.eddieArea = [card('cash', 'eddieArea', { faceDown: true, definitionId: '', cardName: null })];
    expect(tableAccents(before, after)).toEqual([
      { kind: 'legend', cardId: 'legend', seat: 'rival' },
      { kind: 'land', cardId: 'my-hand', seat: 'player' },
      { kind: 'cash', cardId: 'cash', seat: 'rival' },
    ]);
    expect(tableAccents(after, after)).toEqual([]);
  });

  it('does not celebrate restore, setup, ending, readying, or revealing a still-concealed card', () => {
    const before = fresh(), after = structuredClone(before);
    before.players.player.zones.eddieArea = [card('cash', 'eddieArea', { spent: true })];
    after.players.player.zones.eddieArea = [card('cash', 'eddieArea')];
    after.players.player.zones.field = [card('guard', 'field', { spent: true }), card('hidden', 'field', { faceDown: true })];
    expect(tableAccents(before, after)).toEqual([]);
    expect(tableAccents(undefined, after)).toEqual([]);
    after.players.player.zones.field = [card('new', 'field')];
    expect(tableAccents({ ...before, gamePhase: 'setup' }, after)).toEqual([]);
    expect(tableAccents(before, { ...after, gameEnded: true })).toEqual([]);
  });

  it('keeps mass changes quiet and never cash-stamps a spent Eddie becoming ready', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.player.zones.eddieArea = Array.from({ length: 7 }, (_, i) => card(`cash-${i}`, 'eddieArea'));
    after.players.rival.zones.field = Array.from({ length: 12 }, (_, i) => card(`unit-${i}`, 'field'));
    const accents = tableAccents(before, after);
    expect(accents).toHaveLength(4);
    expect(accents.filter((accent) => accent.kind === 'cash')).toHaveLength(1);
    after.players.player.availableEddies += 3;
    expect(tableAccents(before, { ...before, players: { ...before.players, player: { ...before.players.player, availableEddies: 10 } } })).toEqual([]);
  });
});
