import { describe, expect, it } from 'vitest';
import { beatDuration, combatContext, describeBeat, describeRolls, matchChanges, matchTableCues, presentationView } from './matchPresentation';
import type { CardView, PlayerView } from './protocol';

const card = (id: string, zone: string, extra: Partial<CardView> = {}): CardView => ({ instanceId: id, definitionId: id, cardName: id, zone, type: 'unit', faceDown: false, spent: false, power: 3, effectivePower: 3, cost: 2, ...extra });
const fresh = (): PlayerView => ({ players: {
  player: { zones: { field: [card('defender', 'field')], deck: 30, hand: [card('my-hand', 'hand')], legendArea: [], eddieArea: [] }, firstPlayer: true, eddies: 2, availableEddies: 5, gigCount: 1, streetCred: 3 },
  rival: { zones: { field: [card('attacker', 'field')], deck: 31, hand: 5, legendArea: [], eddieArea: [] }, firstPlayer: false, eddies: 3, availableEddies: 4, gigCount: 2, streetCred: 5 },
}, gamePhase: 'main', turnNumber: 4, activePlayerId: 'rival', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 20,
  prompt: { status: 'waiting', choice: null, availableMoves: [] }, attackState: null });

describe('public move presentation', () => {
  it('sounds both seats’ turns, distinguishes single and multiple draws, and does not repeat a Gig steal', () => {
    const before = fresh(), after = structuredClone(before);
    const steal = { type: 'gigStolen', fromPlayerId: 'player', toPlayerId: 'rival' } as const;
    expect(matchTableCues([
      { type: 'turnStarted', playerId: 'rival' },
      { type: 'cardsDrawn', playerId: 'rival', count: 1 },
      { type: 'cardsDrawn', playerId: 'rival', count: 1 },
      { type: 'cardsDrawn', playerId: 'player', count: 1 },
      { type: 'cardSold', playerId: 'rival' },
      { type: 'legendFlipped', playerId: 'player' },
      steal, steal,
      { type: 'gigDieRolled', dieId: 'ordinary', dieType: 'd6', playerId: 'rival', origin: 'gainGig', result: 3 },
    ], before, after)).toEqual([
      { cue: 'turn', seat: 'rival' }, { cue: 'eddie', seat: 'rival' }, { cue: 'call', seat: 'player' },
      { cue: 'gig-steal', seat: 'rival' }, { cue: 'deal', seat: 'rival' }, { cue: 'draw', seat: 'player' },
    ]);
    before.gamePhase = 'setup';
    after.activePlayerId = 'player';
    expect(matchTableCues([], before, after)).toEqual([{ cue: 'turn', seat: 'player' }]);
    expect(matchTableCues([], after, after)).toEqual([]);
  });

  it('names a visible ability source during chained choices without exposing a concealed source', () => {
    const before = fresh(), after = structuredClone(before);
    before.prompt = { status: 'choice', choice: { type: 'chooseTarget', payload: { source: { cardId: 'attacker' } } }, availableMoves: [] };
    const command = { move: 'resolveEffectTarget', args: { targetIds: ['defender'] } };
    expect(describeBeat('rival', command, before, after)).toMatchObject({ source: { instanceId: 'attacker' }, text: 'attacker · choice resolved.', targetIds: ['defender'] });
    before.players.rival.zones.field = [card('attacker', 'field', { definitionId: '', cardName: null, faceDown: true })];
    after.players.rival.zones.field = before.players.rival.zones.field;
    expect(describeBeat('rival', command, before, after).source).toBeUndefined();
  });
  it('describes plays, equipment, power changes and defeats from actual public transitions', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.rival.zones.field = [card('attacker', 'field', { effectivePower: 5 }), card('gear', 'field', { type: 'gear', attachedToId: 'attacker' })];
    after.players.player.zones.field = [];
    after.players.player.zones.trash = [card('defender', 'trash')];
    const changes = matchChanges(before, after, new Set(['defender']));
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'played', label: 'Equipped', card: expect.objectContaining({ instanceId: 'gear' }) }));
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'power', amount: 2, label: '+2 power' }));
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'defeated', label: 'Defeated', seat: 'player' }));
    expect(matchChanges(before, after).find((change) => change.card?.instanceId === 'defender')?.label).toBe('To Trash');
  });
  it('describes playing a Program from Trash as a play rather than completed resolution', () => {
    const before = fresh(), after = structuredClone(before);
    before.players.rival.zones.trash = [card('program', 'trash', { type: 'program' })];
    after.players.rival.zones.resolvingProgram = [card('program', 'resolvingProgram', { type: 'program' })];
    const beat = describeBeat('rival', { move: 'resolveCardToPlay', args: { cardId: 'program' } }, before, after);
    expect(beat.text).toBe('Played program.');
    expect(beat.source?.instanceId).toBe('program');
    expect(beat.changes).toContainEqual(expect.objectContaining({ kind: 'played' }));
  });
  it('separates Gig count, Street Cred and total available currency', () => {
    const before = fresh(), after = structuredClone(before);
    after.players.player.gigCount++; after.players.rival.gigCount--;
    after.players.player.streetCred += 4; after.players.rival.streetCred -= 4;
    after.players.player.availableEddies -= 2;
    const changes = matchChanges(before, after);
    expect(changes).toContainEqual({ kind: 'gigs', seat: 'player', label: '+1 Gig', amount: 1 });
    expect(changes).toContainEqual({ kind: 'gigs', seat: 'rival', label: '-1 Gig', amount: -1 });
    expect(changes).toContainEqual({ kind: 'cred', seat: 'player', label: '+4 Street Cred', amount: 4 });
    expect(changes).toContainEqual({ kind: 'eddies', seat: 'player', label: '-2 €$ available', amount: -2 });
  });
  it('does not serialize private command IDs or expose Eddie identities in presentation', () => {
    const view = fresh();
    view.players.rival.zones.eddieArea = [card('sold', 'eddieArea', { cardName: 'Sold identity', definitionId: 'secret-definition' })];
    const beat = describeBeat('rival', { move: 'activateAbility', args: { cardId: 'private-source', targetIds: ['defender', 'private-target'] } }, view, view);
    expect(beat.source).toBeUndefined();
    expect(beat.targetIds).toEqual(['defender']);
    expect(JSON.stringify(beat)).not.toContain('private-');
    view.prompt = { status: 'choice', choice: { type: 'private-choice' }, availableMoves: [{ moveId: 'private-move', inputSpec: { type: 'none' } }] };
    const shown = presentationView(view);
    expect(shown.prompt).toEqual({ status: 'waiting', choice: null, availableMoves: [] });
    expect(JSON.stringify(shown)).not.toContain('Sold identity');
    expect(JSON.stringify(shown)).not.toContain('secret-definition');
    expect(view.prompt.choice?.type).toBe('private-choice');
  });
  it('retains reroll narration even when no public counter changes', () => {
    expect(describeRolls([{ dieId: 'die', dieType: 'd6', result: 3, seat: 'rival', origin: 'reroll' }], 'rival')).toBe('Rerolled a d6 · rolled 3.');
    const before = fresh(), after = structuredClone(before);
    after.players.rival.streetCred++;
    expect(describeBeat('rival', { move: 'resolveAdjustGig', args: {} }, before, after).text).toBe('+1 Street Cred');
  });
  it('paces each move by what it shows and speeds up long sequences without rushing them', () => {
    const played = { gigRolls: [], changes: [{ kind: 'played' as const, seat: 'rival' as const, label: 'Played' }] };
    expect(beatDuration(1, { gigRolls: [] })).toBe(700);
    expect(beatDuration(1, played)).toBeGreaterThan(beatDuration(1, { gigRolls: [] }));
    expect(beatDuration(1, { gigRolls: [], changes: [{ kind: 'defeated', seat: 'player', label: 'Defeated' }] })).toBeGreaterThanOrEqual(1200);
    expect(beatDuration(30, played)).toBeLessThan(beatDuration(1, played));
    expect(beatDuration(30, { gigRolls: [] })).toBeGreaterThanOrEqual(350);
    const roll = { dieId: 'die', dieType: 'd6', result: 3, seat: 'rival', origin: 'gainGig' } as const;
    const ordinary = beatDuration(10, { gigRolls: [roll] });
    expect(ordinary).toBeGreaterThan(1000);
    expect(ordinary).toBeLessThan(1400);
    expect(beatDuration(10, { gigRolls: [{ ...roll, decisive: true }] })).toBeGreaterThan(ordinary + 300);
  });
});

describe('combat presentation', () => {
  it('identifies the defender during the rival turn and offers only available responses', () => {
    const view = fresh();
    view.attackState = { attackerId: 'attacker', defenderId: 'defender', step: 'react' };
    view.prompt = { status: 'action', choice: null, availableMoves: [
      { moveId: 'useBlocker', inputSpec: { type: 'selectCard' } }, { moveId: 'resolveAttack', inputSpec: { type: 'none' } },
    ] };
    expect(combatContext(view)).toMatchObject({ attackerSeat: 'rival', defendingSeat: 'player', responding: true, canPass: true, title: 'Your response', caption: 'attacker → defender' });
    expect(combatContext(view)?.hint).toBe('You can block.');
    view.prompt.availableMoves = [{ moveId: 'resolveAttack', inputSpec: { type: 'none' } }];
    expect(combatContext(view)?.hint).toBe('No available response. Pass to continue.');
  });
  it('keeps the declared defending seat when the attacker leaves the field', () => {
    const view = fresh();
    view.players.rival.zones.field = [];
    view.activePlayerId = 'player';
    view.attackState = { attackerId: 'attacker', rivalId: 'player', step: 'fightResult' };
    expect(combatContext(view)).toMatchObject({ attackerSeat: 'rival', defendingSeat: 'player', caption: 'Attacking Unit → Your Gigs' });
  });
  it('does not offer Pass while a mandatory effect is unresolved and labels Gig attacks correctly', () => {
    const view = fresh();
    view.attackState = { attackerId: 'attacker', step: 'react' };
    view.prompt = { status: 'choice', choice: { type: 'chooseTarget' }, availableMoves: [] };
    expect(combatContext(view)).toMatchObject({ responding: false, canPass: false, title: 'Resolve the current choice', caption: 'attacker → Your Gigs' });
    expect(combatContext(presentationView(view))?.responding).toBe(false);
    view.attackState.step = 'fightResult';
    view.prompt = { status: 'action', choice: null, availableMoves: [] };
    expect(combatContext(view)?.title).toBe('Combat resolution');
    view.attackState = null;
    expect(combatContext(view)).toBeUndefined();
  });
});
