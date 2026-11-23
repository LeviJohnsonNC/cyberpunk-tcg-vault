import { describe, expect, it } from 'vitest';
import { createDecisionFixture, decisionFixtures, decisionSetup } from '../../dev/decisionFixtures';
import { planTurn } from './coachPlanner';

function position(name: Parameters<typeof createDecisionFixture>[0]) {
  const { session } = createDecisionFixture(name);
  return { setup: decisionSetup, checkpoint: session.checkpoint() };
}
describe('turn coach', () => {
  it.each(decisionFixtures.filter((name) => name !== 'Complete'))(
    'teaches the player at %s without changing the saved match',
    (name) => {
      const saved = position(name);
      const before = structuredClone(saved.checkpoint);
      const plan = planTurn(saved);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].why.length).toBeGreaterThan(15);
      expect(saved.checkpoint).toEqual(before);
      expect(JSON.stringify(plan)).not.toMatch(/undefined|NaN|\[object Object\]/);
      if (name === 'Opening hand') {
        expect(plan.steps[0].title).toMatch(/mulligan|keep/i);
        expect(plan.continuation.join(' ')).not.toMatch(/offers d20/i);
      }
      if (name === 'Gig die') expect(plan.steps[0].title).toMatch(/Roll the d\d+/);
    }
  );
  it('gives identical advice after a concealed hand and deck swap', () => {
    const saved = position('Main turn'),
      copy = structuredClone(saved);
    const { rival } = copy.checkpoint.state.G.players;
    if (!rival.zones.hand.length) {
      // This fixture empties the rival hand. Give both positions the same concealed slot.
      for (const cp of [saved.checkpoint, copy.checkpoint]) {
        const zones = cp.state.G.players.rival.zones;
        zones.hand.push(zones.deck.pop()!);
      }
    }
    const cards = copy.checkpoint.state.G.cardIndex;
    const a = cards[rival.zones.hand[0]],
      b = cards[rival.zones.deck.find((id) => cards[id].definitionId !== a.definitionId)!];
    [a.definitionId, b.definitionId] = [b.definitionId, a.definitionId];
    copy.checkpoint.state.G.players.player.zones.deck.reverse();
    expect(planTurn(copy)).toEqual(planTurn(saved));
  });
  it('updates a real turn after the chosen die lands', () => {
    const { session, snapshot } = createDecisionFixture('Gig die');
    const opening = planTurn({ setup: decisionSetup, checkpoint: session.checkpoint() });
    const dieId = opening.focus.cards[0];
    expect(dieId).toBeTruthy();
    expect(opening.continuation.filter(s=>s.startsWith('If you roll'))).toHaveLength(2);
    const after = session.move(snapshot.view.stateID, { move: 'gainGig', args: { dieId } });
    const later = planTurn({ setup: decisionSetup, checkpoint: session.checkpoint() });
    expect(after.view.stateID).not.toBe(snapshot.view.stateID);
    expect(later.focus.move).not.toBe('gainGig');
    expect(later.facts).toContainEqual(
      expect.stringContaining(`showing ${after.gigRolls.find((d) => d.dieId === dieId)!.result}.`)
    );
  });
  it('plans multiple commitments through the end of the turn', () => {
    const plan = planTurn(position('Equip Satori'));
    expect(plan.steps.length).toBeGreaterThan(2);
    expect(plan.steps.at(-1)?.title).toBe('End your turn');
    expect(plan.alternative?.title).not.toEqual(plan.steps[0].title);
  });
  it('closes coaching when the match is finished', () =>
    expect(() => planTurn(position('Complete'))).toThrow(/decision/));
});
