import { describe, expect, it } from 'vitest';
import { createDecisionFixture, decisionFixtures, decisionSetup } from '../../dev/decisionFixtures';
import { giveGig, type FixtureState } from '../../dev/combatFixtures';
import { plannerPosition } from '../../dev/plannerPositions';
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
    const plan = planTurn(position('Main turn'));
    expect(plan.steps.length).toBeGreaterThan(2);
    expect(plan.steps.at(-1)?.title).toBe('End your turn');
    expect(plan.alternative?.title).not.toEqual(plan.steps[0].title);
  });
  it('compares buying a second Gear at the actual fork in the Ripper line', () => {
    const plan = planTurn(plannerPosition('Ripper before equipment'));
    const fork = planTurn(plannerPosition('Ripper after Radioport'));
    expect(plan.alternative).toMatchObject({ afterStep: 1, title: 'Equip Zetatech Faceplate before attacking' });
    expect(fork.alternative).toEqual({ ...plan.alternative, afterStep: 0 });
    expect(plan.steps[1].why).toContain('only Gig (d4 showing 2)');
    expect(plan.alternative?.why).toMatch(/1 Gig.*4 power.*2 €\$ available.*0 €\$.*before the steal/s);
    expect(plan.alternative?.why).toMatch(/Rockn' Rockerboy later.*8 to 10 power/s);
    const rest = plan.continuation.join(' ');
    expect(rest).toMatch(/Sketchy Ripper triggers on attack.*top 3.*Radioport triggers.*face-down Legend/s);
    expect(rest).toContain('3 €$ available and 6 cards in hand');
    expect(rest).not.toMatch(/Smasher|Take Control|Viktor/);
  });

  it('explains when the same second purchase earns a draw before the steal', () => {
    const position = plannerPosition('Ripper after Radioport');
    const state = position.checkpoint.state as FixtureState;
    giveGig(state, 'player');
    state.G.gigDice[state.G.players.player.gigArea.at(-1)!].faceValue = 3;
    const plan = planTurn(position);
    expect(plan.steps[0].title).toContain('Equip Zetatech Faceplate');
    expect(plan.steps[0].why).toContain('3 different friendly Gig values');
    expect(plan.alternative).toMatchObject({ afterStep: 0, title: 'Attack before equipping Zetatech Faceplate' });
  });

  it('explains the opposite choice at the 10-power threshold and the game-ending overtime steal', () => {
    const maxTac = planTurn(plannerPosition('Equip for two Gigs'));
    expect(maxTac.steps[0].why).toContain('from 8 to 10 power');
    expect(maxTac.alternative?.why).toMatch(/8 power.*1 Gig.*10 power.*2 Gigs/);
    const overtime = planTurn(plannerPosition('Win in overtime'));
    expect(overtime.steps[0].why).toMatch(/majority in overtime.*win immediately/);
    expect(overtime.continuation.at(-1)).toMatch(/If a response stops the steal/);
  });

  it('compares passing on a reaction with spending the card and saving a larger die with rolling it now', () => {
    const defense = planTurn(plannerPosition('Block a Gig attack'));
    expect(defense.alternative).toMatchObject({ title: 'Pass the combat response' });
    expect(defense.alternative?.why).toContain('keeps Floor It in hand and leaves 5 €$');
    expect(planTurn(plannerPosition('Gig die')).alternative?.why).toContain('saves the d12');
  });

  it('closes coaching when the match is finished', () =>
    expect(() => planTurn(position('Complete'))).toThrow(/decision/));
});
