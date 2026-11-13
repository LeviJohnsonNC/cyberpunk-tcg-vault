import { describe, expect, it } from 'vitest';
import { createDecisionFixture, decisionFixtures } from './decisionFixtures';
import { matchActions } from '../lib/play/matchActions';
import { updatePick } from '../lib/play/matchInteraction';
import { gigAdjustmentTarget } from '../lib/play/tacticalInfo';

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

describe('Gig adjustment positions', () => {
  it('previews the rival total with multiple Gigs and applies the same delta without changing the count', () => {
    const { session, snapshot } = createDecisionFixture('Increase a Gig');
    const [action] = matchActions(snapshot.view);
    const dieField = action.fields({})[0];
    const rival = dieField.options.find(option => option.label === 'd12 · 4')!;
    const picks = { die: [rival.id], value: ['8'] };
    const [, valueField] = action.fields(picks);
    expect(valueField.options.map(option => option.id)).toEqual(['4', '5', '6', '7', '8']);
    expect(gigAdjustmentTarget(snapshot.view, rival.cardId)).toMatchObject({ seat: 'rival', die: { power: 4 }, streetCred: 9 });
    const yourDie = dieField.options.find(option => option.label === 'd4 · 3')!;
    expect(updatePick(action, picks, 'die', yourDie.id)).toEqual({ die: [yourDie.id] });
    const next = session.move(snapshot.view.stateID, action.move(picks));
    expect(next.view.players.rival).toMatchObject({ streetCred: 13, gigCount: 2 });
    expect(() => session.move(snapshot.view.stateID, action.move(picks))).toThrow();
  });

  it.each(['Keep', 'Decline'])('preserves the distinct %s command on a single eligible Gig', choice => {
    const { session, snapshot } = createDecisionFixture('Single Gig adjustment');
    const [adjust, decline] = matchActions(snapshot.view);
    expect(adjust.fields({}).map(field => field.id)).toEqual(['value']);
    const move = choice === 'Keep' ? adjust.move({ value: ['3'] }) : decline.move({});
    expect(move.args?.kind).toBe(choice === 'Keep' ? 'adjust' : 'noAdjustment');
    const next = session.move(snapshot.view.stateID, move);
    expect(next.view.players.player).toMatchObject({ streetCred: 3, gigCount: 1 });
    expect(next.view.prompt.choice).toBeNull();
  });
});
