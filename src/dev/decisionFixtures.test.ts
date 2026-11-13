import { describe, expect, it } from 'vitest';
import { createDecisionFixture, decisionFixtures } from './decisionFixtures';
import { matchActions } from '../lib/play/matchActions';

describe('engine-backed decision review positions', () => {
  it.each(decisionFixtures)('opens %s with real legal actions', name => {
    const { snapshot } = createDecisionFixture(name);
    if (name === 'Complete') expect(snapshot.view.gameEnded).toBe(true);
    else expect(matchActions(snapshot.view).length).toBeGreaterThan(0);
    const expected: Partial<Record<typeof name, string>> = { 'Turn order': 'chooseFirstPlayer', 'Gig die': 'gainGig', 'Forced payment': 'redirectDefeat', 'Target effect': 'chooseTarget', 'Order effects': 'chooseTrigger', 'Card placement': 'scry' };
    if (expected[name]) expect(snapshot.view.prompt.choice?.type).toBe(expected[name]);
    if (name === 'Reaction') expect(snapshot.view.attackState?.step).toBe('react');
    if (name === 'Overtime') expect(snapshot.view.overtimeActive).toBe(true);
  });
});
