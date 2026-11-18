import { describe, expect, it } from 'vitest';
import { createDecisionFixture, decisionFixtures, decisionSetup } from './decisionFixtures';
import { createEngineSession } from '../lib/play/engineSession';
import { isReady, matchActions } from '../lib/play/matchActions';
import { updatePick } from '../lib/play/matchInteraction';
import { triggerPreviewCard } from '../lib/play/cardDisplay';
import { visibleCards } from '../lib/play/matchView';
import { gigAdjustmentTarget } from '../lib/play/tacticalInfo';

describe('engine-backed decision review positions', () => {
  it.each(decisionFixtures)('opens %s with real legal actions', name => {
    const { snapshot } = createDecisionFixture(name);
    if (name === 'Complete') expect(snapshot.view.gameEnded).toBe(true);
    else expect(matchActions(snapshot.view).length).toBeGreaterThan(0);
    const expected: Partial<Record<typeof name, string>> = { 'Turn order': 'chooseFirstPlayer', 'Gig die': 'gainGig', 'Forced payment': 'redirectDefeat', 'Target effect': 'chooseTarget', 'Order effects': 'chooseTrigger', 'Card placement': 'scry', 'Add to hand': 'scry' };
    if (expected[name]) expect(snapshot.view.prompt.choice?.type).toBe(expected[name]);
    if (name === 'Reaction') expect(snapshot.view.attackState?.step).toBe('react');
    if (name === 'Overtime') expect(snapshot.view.overtimeActive).toBe(true);
  });
});

it('offers the three sources in the reported attack prompt and preserves concealed card backs', () => {
  const { snapshot } = createDecisionFixture('Attack effects');
  const action = matchActions(snapshot.view).find(move => move.id === 'resolveTrigger')!;
  const options = action.fields({})[0].options;
  expect(options.map(option => option.label).sort()).toEqual(["Dying Night: V's Pistol", 'Evelyn Parker: Scheming Siren', 'Zetatech Faceplate']);
  for (const { sourceCardId, label } of options) {
    const source = visibleCards(snapshot.view).find(card => card.instanceId === sourceCardId)!;
    expect(triggerPreviewCard(source, sourceCardId!, label)).toBe(source);
    expect(triggerPreviewCard(undefined, sourceCardId!, label)?.cardName).toBe(label);
    expect(triggerPreviewCard({ ...source, definitionId: '', cardName: null, faceDown: true }, sourceCardId!, label)).toBeUndefined();
  }
});

it('offers up to two Gear and puts the remaining cards on the bottom of the deck', () => {
  const { session, snapshot } = createDecisionFixture('Add to hand');
  const placement = matchActions(snapshot.view)[0];
  const [field] = placement.fields({});
  expect(field).toMatchObject({ min: 0, max: 2, destination: 'hand' });
  expect(isReady([field], {})).toBe(true);
  expect(field.options.map(option => option.label)).toEqual(['Arasaka Emergency Radioport', 'Adrenaline Converter', 'Kiroshi Optics']);
  const first = updatePick(placement, {}, field.id, field.options[0].id)!;
  const two = updatePick(placement, first, field.id, field.options[1].id)!;
  expect(updatePick(placement, two, field.id, field.options[2].id)).toBeUndefined();
  const final = session.move(snapshot.view.stateID, placement.move(two));
  expect(final.view.players.player.zones.hand).toEqual(expect.arrayContaining(two[field.id].map(instanceId => expect.objectContaining({ instanceId }))));
  const payload = snapshot.view.prompt.choice?.payload as { revealedCards: { instanceId: string }[] };
  const remainder = payload.revealedCards.map(card => card.instanceId).filter(id => !two[field.id].includes(id));
  expect(placement.remainderZone).toBe('deckBottom');
  expect(session.checkpoint().state.G.players.player.zones.deck.slice(-3)).toEqual(expect.arrayContaining(remainder));
});

describe('rival combat presentation', () => {
  it('keeps a blocked attack open and records the comparison and both Trash destinations once after resume', () => {
    const { session, snapshot } = createDecisionFixture('Block a Gig attack');
    const blocker = matchActions(snapshot.view).find(action => action.id === 'useBlocker')!;
    const field = blocker.fields({})[0];
    const id = field.options[0].id;
    const blocked = session.move(snapshot.view.stateID, blocker.move({ [field.id]: [id] }));
    expect(blocked.view.attackState).toMatchObject({ step: 'react', defenderId: id });
    expect(blocked.presentation?.feedback?.fight).toBeUndefined();
    const resumed = createEngineSession(decisionSetup, undefined, structuredClone(session.checkpoint()));
    const response = resumed.start();
    const pass = matchActions(response.view).find(action => action.id === 'resolveAttack')!;
    const final = resumed.move(response.view.stateID, pass.move({}));
    const receipt = final.presentation?.feedback;
    expect(receipt?.fight).toEqual({ attacker: { id: snapshot.view.attackState?.attackerId, power: 2 }, defender: { id, power: 2 } });
    expect(receipt?.text).toBe('Field Operator (2) vs Corpo Security (2). Both went to Trash. You hold 1 Gig after the block.');
    expect(resumed.checkpoint().log.filter(entry => entry.text === receipt?.text)).toHaveLength(1);
  });

  it('waits for defeat replacement and reports only the participants that actually reached Trash', () => {
    const { session, snapshot } = createDecisionFixture('Forced payment');
    expect(snapshot.view.attackState?.step).toBe('fightResult');
    expect(snapshot.log.some(entry => entry.text.includes(' vs '))).toBe(false);
    const choice = snapshot.view.prompt.choice?.payload as { protectedCardId: string };
    const after = session.move(snapshot.view.stateID, { move: 'resolveRedirectDefeat', args: { protectedCardId: choice.protectedCardId } });
    expect(after.presentation?.feedback?.fight?.defender.power).toBe(2);
    expect(after.presentation?.feedback?.text).toBe('Field Operator (2) vs Corpo Security (2). Field Operator went to Trash.');
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
