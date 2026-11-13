import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BY_SLUG, CARDS, ramLimits } from '../data';
import { campaignCrew, previewCampaignCrew } from './campaignDeckRules';
import { isEngineSupported } from './engineCards';
import { newCampaign, generateReward, makeStarterDeck } from './campaign';
import { campaignRecap, latestPack, needsActBriefing, previewCampaignEdit } from './campaignPresentation';
import { acknowledgeCampaignAct, readCampaign, saveCampaignDeck, updateCampaign } from './campaignStorage';

function rewarded() {
  const run = newCampaign('the-heist', 'presentation', 'fixed');
  const reward = generateReward(run);
  for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
  reward.choice = reward.offers[0];
  run.inventory[reward.choice] = (run.inventory[reward.choice] ?? 0) + 1;
  run.rewards[0] = reward; run.encounter = 1; run.phase = 'upgrading';
  return run;
}

describe('campaign presentation and edit previews', () => {
  it('previews one-for-one swaps without mutating inventory or the saved draft', async () => {
    const run = rewarded(), original = structuredClone(run);
    const incoming = run.rewards[0].cards[0];
    const outgoing = Object.keys(run.deck.cards).find(slug => slug !== incoming)!;
    const preview = previewCampaignEdit(run, incoming, outgoing);
    expect(preview.issues).toEqual([]);
    expect(run).toEqual(original);
    expect(preview.deck.cards[incoming]).toBe((run.deck.cards[incoming] ?? 0) + 1);
    expect(preview.deck.cards[outgoing] ?? 0).toBe(run.deck.cards[outgoing] - 1);
    await updateCampaign('qa-edit', () => ({ run, value: undefined }));
    const saved = await saveCampaignDeck('qa-edit', run, preview.deck);
    expect(saved.run.deck).toEqual(preview.deck);
    expect(saved.run.inventory).toEqual(original.inventory);
  });
  it('rejects missing inventory, copy caps, bad removals and additions past 50', () => {
    const run = rewarded();
    const unknown = CARDS.find(card => !run.inventory[card.slug])!.slug;
    expect(previewCampaignEdit(run, unknown).issues.length).toBeGreaterThan(0);
    const incoming = run.rewards[0].cards[0];
    expect(previewCampaignEdit(run, incoming, 'not-in-deck').issues.length).toBeGreaterThan(0);
    expect(previewCampaignEdit(run, incoming, incoming).issues.length).toBeGreaterThan(0);
    run.deck.cards[incoming] = 3; run.inventory[incoming] = 3;
    expect(previewCampaignEdit(run, incoming).issues.length).toBeGreaterThan(0);
    const overfull = rewarded();
    for (const slug of Object.keys(overfull.deck.cards)) { overfull.deck.cards[slug] = 3; overfull.inventory[slug] = 3; }
    expect(previewCampaignEdit(overfull, incoming).issues.length).toBeGreaterThan(0);
  });
  it('checks unique Legend names and previews RAM for same-colour replacements', () => {
    const run = rewarded(); run.encounter = 2;
    const recruit = generateReward(run).offers.find(slug => BY_SLUG.get(slug)?.type === 'Legend')!;
    run.inventory[recruit] = 1;
    const prior = run.deck.legends.find(slug => BY_SLUG.get(slug)?.color === BY_SLUG.get(recruit)?.color)!;
    const other = run.deck.legends.find(slug => BY_SLUG.get(slug)?.color !== BY_SLUG.get(recruit)?.color)!;
    const toCrew = (slot: string, incoming: string) => run.deck.legends.map(slug => slug === slot ? incoming : slug);
    expect(previewCampaignCrew(run, toCrew(other, recruit)).deck.legends).toContain(recruit);
    const preview = previewCampaignCrew(run, toCrew(prior, recruit));
    expect(preview.issue).toBeUndefined();
    expect(ramLimits(preview.deck.legends)).toEqual(ramLimits(run.deck.legends));
    const duplicate = run.deck.legends.find(slug => slug !== prior && BY_SLUG.get(slug)?.color === BY_SLUG.get(prior)?.color);
    if (duplicate) expect(previewCampaignCrew(run, toCrew(prior, duplicate)).issue).toMatch(/different Legends/);
  });
  it('recaps actual acquired copies and changes, including an unchanged starter', () => {
    const run = rewarded();
    expect(campaignRecap(run)).toMatchObject({ packs: 1, earnedCopies: 8, clears: 1, changedCopies: 0, recruits: [] });
    const incoming = run.rewards[0].cards[0];
    run.deck = previewCampaignEdit(run, incoming).deck;
    run.phase = 'completed'; run.encounter = 8;
    expect(campaignRecap(run)).toMatchObject({ earnedCopies: 8, clears: 9, changedCopies: 1, additions: [{ slug: incoming, count: 1 }] });
    expect(makeStarterDeck(run.starter).cards).not.toEqual(run.deck.cards);
  });
  it('shows the pack being opened or the last claimed pack, never unchosen offers', () => {
    const run = rewarded();
    expect(latestPack(run)).toHaveLength(8);
    expect(latestPack(run).map(pull => pull.slug)).not.toContain(run.rewards[0].offers[1]);
    expect(latestPack(run)[0].printing?.id).toBe(run.rewards[0].printingIds?.[0]);
    run.phase = 'rewardPending'; run.encounter = 0; delete run.rewards[0].choice;
    expect(latestPack(run)).toHaveLength(7);
  });
  it('acknowledges an act durably without changing cards and rejects stale acknowledgements', async () => {
    const run = rewarded(); run.encounter = 3;
    expect(needsActBriefing(run)).toBe(true);
    await updateCampaign('qa-act', () => ({ run, value: undefined }));
    await acknowledgeCampaignAct('qa-act', run.revision);
    const restored = (await readCampaign('qa-act')).run!;
    expect(needsActBriefing(restored)).toBe(false);
    expect(restored.inventory).toEqual(run.inventory);
    expect(restored.deck).toEqual(run.deck);
    await expect(acknowledgeCampaignAct('qa-act', run.revision)).rejects.toThrow('another tab');
    expect(needsActBriefing({ ...restored, encounter: 6 })).toBe(true);
    expect(needsActBriefing({ ...restored, phase: 'inMatch', encounter: 6 })).toBe(false);
  });
});

it('commits a three-Legend colour pivot and reserve removals as one undoable edit', async () => {
  const scope = 'qa-cross-colour';
  const run = rewarded();
  const red = ['adam-smasher-ender-of-legends', 'dexter-deshawn-off-the-grid', 'johnny-silverhand-rocking-renegade'];
  for (const slug of red) run.inventory[slug] = 1;
  const crew = campaignCrew(red);
  expect(crew).toEqual({ colours: ['Red'], ram: { Red: 6 } });
  const before = structuredClone(run);
  const swap = previewCampaignCrew(run, red);
  expect(swap.issue).toBeUndefined();
  expect(swap.removed.reduce((sum, card) => sum + card.copies, 0)).toBe(40);
  expect(swap.deck.cards).toEqual({});
  expect(run).toEqual(before);
  await updateCampaign(scope, () => ({ run, value: undefined }));
  await expect(saveCampaignDeck(scope, run, { ...run.deck, legends: red })).rejects.toThrow('Needs a');
  await expect(saveCampaignDeck(scope, run, { ...swap.deck, legends: [red[0], red[0], red[1]] })).rejects.toThrow('different Legends');
  const { run: changed, issues } = await saveCampaignDeck(scope, run, swap.deck);
  expect(issues).toEqual(['Main deck must be 40 to 50 cards (has 0)']);
  expect((await readCampaign(scope)).run?.inventory).toEqual(before.inventory);
  await expect(saveCampaignDeck(scope, { ...changed, id: 'another-run' }, 'undo')).rejects.toThrow('another tab');
  const { run: restored } = await saveCampaignDeck(scope, changed, 'restore');
  expect(restored.deck).toEqual(before.deck);
  const { run: draftAgain } = await saveCampaignDeck(scope, restored, 'undo');
  expect(draftAgain.deck).toEqual(swap.deck);
  expect(draftAgain.lastLegal).toEqual(before.deck);

  const { run: short } = await saveCampaignDeck(scope, draftAgain, { ...swap.deck, cards: {} });
  const blocked = CARDS.find(card => card.type !== 'Legend' && card.color === 'Blue' && run.inventory[card.slug] > 0)!;
  await expect(saveCampaignDeck(scope, short, { ...short.deck, cards: { [blocked.slug]: 1 } })).rejects.toThrow('Needs a Blue Legend');
});

it('moves high-RAM cards to reserve when a three-colour crew reduces the Blue budget', () => {
  const run = rewarded();
  const incoming = 'adam-smasher-ender-of-legends';
  run.inventory[incoming] = 1;
  const legends = [...run.deck.legends];
  const index = legends.findIndex(slug => BY_SLUG.get(slug)?.color === 'Blue');
  legends[index] = incoming;
  const card = CARDS.find(card => card.color === 'Blue' && card.type !== 'Legend' && card.legal === 'legal'
    && (card.ram ?? 0) > 2 && (card.ram ?? 0) <= 4 && isEngineSupported(card.slug))!;
  run.deck.cards[card.slug] = 2;
  run.inventory[card.slug] = 2;
  const proposal = previewCampaignCrew(run, legends);
  expect(proposal.after.ram).toMatchObject({ Blue: 2, Red: 2, Yellow: 2 });
  expect(proposal.removed).toContainEqual({ slug: card.slug, copies: 2, reason: `Needs ${card.ram} Blue RAM · crew provides 2` });
  expect(proposal.deck.cards[card.slug]).toBeUndefined();
});
