import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BY_SLUG, CARDS, ramLimits } from '../data';
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
    const saved = await saveCampaignDeck('qa-edit', run.revision, preview.deck);
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
  it('requires same-colour Legend replacement, checks unique names and preserves RAM', () => {
    const run = rewarded(); run.encounter = 2;
    const recruit = generateReward(run).offers.find(slug => BY_SLUG.get(slug)?.type === 'Legend')!;
    run.inventory[recruit] = 1;
    const prior = run.deck.legends.find(slug => BY_SLUG.get(slug)?.color === BY_SLUG.get(recruit)?.color)!;
    const other = run.deck.legends.find(slug => BY_SLUG.get(slug)?.color !== BY_SLUG.get(recruit)?.color)!;
    expect(previewCampaignEdit(run, recruit).issues.length).toBeGreaterThan(0);
    expect(previewCampaignEdit(run, recruit, other).issues.length).toBeGreaterThan(0);
    const preview = previewCampaignEdit(run, recruit, prior);
    expect(preview.issues).toEqual([]);
    expect(ramLimits(preview.deck.legends)).toEqual(ramLimits(run.deck.legends));
    const duplicate = run.deck.legends.find(slug => slug !== prior && BY_SLUG.get(slug)?.color === BY_SLUG.get(prior)?.color);
    if (duplicate) expect(previewCampaignEdit(run, duplicate, prior).issues.length).toBeGreaterThan(0);
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
    expect(latestPack(run)).not.toContain(run.rewards[0].offers[1]);
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
