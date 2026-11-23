import { describe, expect, it } from 'vitest';
import { LocalEngine } from '../../vendor/cyberpunk-engine/engine.mjs';
import { botDecision } from '../lib/play/engineSession';
import { zoneCards } from '../lib/play/matchView';
import type { Move, Seat } from '../lib/play/protocol';
import { plannerPosition } from './plannerPositions';

function submit(engine: LocalEngine, seat: Seat, move: Move) {
  const result = engine.processCommand({ commandID: String(engine.getState().ctx.stateID),
    move: move.move, input: { args: move.args ?? {} } }, seat);
  if (!result.success) throw new Error(result.error);
  return result.gameEvents;
}

describe('planner baseline positions', () => {
  it('reconstructs the public turn and matches the two payment sources in the reported line', () => {
    const before = new LocalEngine(plannerPosition('Ripper before equipment').checkpoint.state).getFilteredView('player');
    expect(before).toMatchObject({ turnNumber: 3, activePlayerId: 'player', gamePhase: 'main', players: {
      player: { availableEddies: 4, streetCred: 9, zones: { trash: [], deck: 32 } },
      rival: { availableEddies: 3, streetCred: 2, zones: { trash: [], deck: 33, hand: 6, field: [] } },
    } });
    const { player, rival } = before.players;
    expect(zoneCards(player, 'hand').map(c => c.cardName)).toEqual([
      'Johnny Silverhand', 'Secondhand Bombus', "Rockn' Rockerboy", 'Zetatech Faceplate', 'Arasaka Emergency Radioport', 'Secondhand Bombus',
    ]);
    expect(zoneCards(player, 'field')).toMatchObject([{ cardName: 'Sketchy Ripper', effectivePower: 0, hasLag: false, spent: false }]);
    expect(zoneCards(player, 'gigArea').map(c => [c.definitionId, c.power])).toEqual([['d12', 8], ['d10', 1]]);
    expect(zoneCards(rival, 'gigArea')).toMatchObject([{ definitionId: 'd4', power: 2 }]);
    expect(zoneCards(player, 'legendArea').every(c => c.faceDown && !c.spent)).toBe(true);
    const after = new LocalEngine(plannerPosition('Ripper after Radioport').checkpoint.state).getFilteredView('player').players.player;
    expect(after.availableEddies).toBe(2);
    expect(zoneCards(after, 'eddieArea')).toMatchObject([{ spent: true }]);
    expect(zoneCards(after, 'legendArea').map(c => c.spent)).toEqual([true, false, false]);
  });

  it.each([false, true])('verifies the unopposed steal and remaining cash with Faceplate equipped = %s', (doubleEquip) => {
    const engine = new LocalEngine(plannerPosition('Ripper after Radioport').checkpoint.state);
    const player = () => engine.getFilteredView('player').players.player;
    const host = zoneCards(player(), 'field').find(c => c.cardName === 'Sketchy Ripper')!;
    if (doubleEquip) {
      const gear = zoneCards(player(), 'hand').find(c => c.cardName === 'Zetatech Faceplate')!;
      submit(engine, 'player', { move: 'playCard', args: { cardId: gear.instanceId, attachToId: host.instanceId } });
    }
    expect(zoneCards(player(), 'field').find(c => c.instanceId === host.instanceId)?.effectivePower).toBe(doubleEquip ? 4 : 2);
    const events = submit(engine, 'player', { move: 'attackRival', args: { attackerId: host.instanceId } });
    for (let i = 0; i < 20 && engine.getFilteredView('player').attackState; i++) {
      if (engine.getPrompt('player').status === 'choice') {
        const choice = botDecision(engine, 'player', () => 0.3)!;
        events.push(...submit(engine, 'player', choice));
      } else {
        events.push(...submit(engine, 'rival', { move: 'resolveAttack', args: { pass: true } }));
      }
    }
    expect(engine.getFilteredView('player').attackState).toBeNull();
    expect(events.some(e => e.type === 'cardsDrawn')).toBe(false);
    expect(events.filter(e => e.type === 'gigStolen')).toHaveLength(1);
    expect(player()).toMatchObject({ availableEddies: doubleEquip ? 0 : 2, gigCount: 3 });
  });

  it('presents a winning attack in overtime and verifies the victory check', () => {
    const engine = new LocalEngine(plannerPosition('Win in overtime').checkpoint.state);
    const view = () => engine.getFilteredView('player');
    expect(view()).toMatchObject({ overtimeActive: true, players: { player: { gigCount: 6 }, rival: { gigCount: 6 } } });
    const attackerId = zoneCards(view().players.player, 'field')[0].instanceId;
    submit(engine, 'player', { move: 'attackRival', args: { attackerId } });
    submit(engine, 'player', { move: 'resolveStealGigs', args: { dieIds: [zoneCards(view().players.rival, 'gigArea')[0].instanceId] } });
    expect(view()).toMatchObject({ gameEnded: true, winnerId: 'player', winReason: 'overtime_majority' });
  });
});
