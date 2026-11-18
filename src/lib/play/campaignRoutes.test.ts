import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BY_SLUG } from '../data';
import { STARTERS } from '../starters';
import { ENCOUNTERS, campaignEncounter, encounterDeck, generateReward, newCampaign, prepareCampaignReward } from './campaign';
import { matchDeckIssues } from './matchDeck';
import { aftermathBeats, victoryBeats } from './campaignScenes';
import { callRoutes, evidenceRoutes, pendingStoryDecision, routeEnding, type CallChoice, type EvidenceChoice } from './campaignRoutes';
import { acknowledgeCampaignAct, readCampaign, updateCampaign } from './campaignStorage';
import { campaignCardFit, campaignCrew } from './campaignDeckRules';

const calls: CallChoice[] = ['answer', 'moth', 'silence'];
const evidence: EvidenceChoice[] = ['broadcast', 'seal'];

for (const { key } of STARTERS) {
  it.each(calls)(key + ' takes the %s call through both final tables', call => {
    const run = newCampaign(key, 'route-test', 'fixed');
    const original = generateReward({ ...run, encounter: 4 });
    run.encounter = 4;
    run.route = { call };
    const contract = callRoutes[call];
    expect(campaignEncounter(run)).toMatchObject({ id: contract.rival, title: contract.title });
    expect(encounterDeck(run)).toEqual(run.opponents[ENCOUNTERS.findIndex(item => item.id === contract.rival)]);
    expect(matchDeckIssues(encounterDeck(run))).toEqual([]);
    expect(victoryBeats(run)[0].text).toBe(contract.win);
    run.aftermath = { outcome: 'loss', beat: 0 };
    expect(aftermathBeats(run)[0].text).toBe(contract.loss);
    const pack = generateReward(run);
    expect(pack.printingIds).toEqual(original.printingIds);
    expect(new Set(pack.offers).size).toBe(3);
    const options = pack.offers.map(slug => BY_SLUG.get(slug)!);
    expect(options.some(card => card.type === 'Legend')).toBe(call === 'moth');
    for (const card of options.filter(card => card.type !== 'Legend'))
      expect(campaignCardFit(card, campaignCrew(run.deck.legends))).toBeUndefined();
    if (call === 'answer') expect(options[0].type).toBe('Gear');
    run.rewards[4] = pack;
    expect(prepareCampaignReward({ ...run, attempts: 3 })).toEqual(pack);
    for (const choice of evidence) {
      run.route = { call, evidence: choice };
      run.encounter = 7;
      expect(campaignEncounter(run).id).toBe(evidenceRoutes[choice].rival);
      expect(matchDeckIssues(encounterDeck(run))).toEqual([]);
      expect(victoryBeats(run)[0].text).toBe(evidenceRoutes[choice].win);
      run.encounter = 8;
      expect(campaignEncounter(run).id).toBe('last-call');
      expect(encounterDeck(run)).toEqual(run.opponents[8]);
    }
  });
}

it('persists each decision once and rejects skipped, wrong, stale and cross-run choices', async () => {
  const scope = 'story-commit';
  const run = newCampaign('the-heist', scope, scope);
  run.encounter = 3; run.phase = 'upgrading';
  await updateCampaign(scope, () => ({ run, value: undefined }));
  await expect(acknowledgeCampaignAct(scope, run)).rejects.toThrow('available story path');
  await expect(acknowledgeCampaignAct(scope, run, 'broadcast')).rejects.toThrow('available story path');
  await expect(acknowledgeCampaignAct(scope, { ...run, id: 'old' }, 'moth')).rejects.toThrow('another tab');
  const results = await Promise.allSettled(['moth', 'answer'].map(choice => acknowledgeCampaignAct(scope, run, choice as CallChoice)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const restored = (await readCampaign(scope)).run!;
  expect(restored.route?.call).toBe('moth');
  expect(pendingStoryDecision(restored)).toBeUndefined();
  const lift = { ...restored, encounter: 6 };
  await updateCampaign(scope, () => ({ run: lift, value: undefined }));
  expect(pendingStoryDecision(lift)).toBe('evidence');
  await expect(acknowledgeCampaignAct(scope, lift, 'silence')).rejects.toThrow('available story path');
  await acknowledgeCampaignAct(scope, lift, 'seal');
  const saved = (await readCampaign(scope)).run!;
  expect(saved.route).toEqual({ call: 'moth', evidence: 'seal' });
  await expect(acknowledgeCampaignAct(scope, saved, 'broadcast')).rejects.toThrow('another tab');
});

it('keeps legacy saves beyond the phone on their original decks and ending', () => {
  const run = newCampaign('the-heist', 'old', 'old');
  run.phase = 'upgrading'; run.encounter = 3; run.briefedAct = 1;
  expect(pendingStoryDecision(run)).toBeUndefined();
  run.encounter = 6;
  expect(pendingStoryDecision(run)).toBeUndefined();
  run.encounter = 7;
  expect(encounterDeck(run)).toEqual(run.opponents[7]);
  expect(campaignEncounter(run)).toEqual(ENCOUNTERS[7]);
  expect(victoryBeats(run, 8).at(-1)?.title).toBe('Leave a chair empty');
  expect(new Set(calls.flatMap(call => evidence.map(choice => routeEnding({ call, evidence: choice }).text))).size).toBe(6);
});
