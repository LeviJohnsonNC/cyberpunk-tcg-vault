import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BY_SLUG } from '../data';
import { STARTERS } from '../starters';
import { ENCOUNTERS, campaignDeckIssues, encounterDeck, generateReward, grantVictory, newCampaign } from './campaign';
import { matchDeckIssues, prepareMatchDeck } from './matchDeck';
import { createMatchController } from './workerController';
import { chooseReward, claimEnvironment, readCampaign, revealCampaignPack, saveCampaignDeck, startCampaign, updateCampaign } from './campaignStorage';
import { readCircuitProgress, equipTableFinish } from './matchStorage';

describe('starter campaign', () => {
  it('uses the exact official legal starter and legal rival lists in all nine encounters', () => {
    for (const starter of STARTERS) {
      const run = newCampaign(starter.key, 'exact', 'seed');
      expect(campaignDeckIssues(run, run.deck)).toEqual([]);
      expect(run.deck.cards).toEqual(starter.cards);
      for (let i = 0; i < ENCOUNTERS.length; i++) {
        run.encounter = i;
        expect(matchDeckIssues(encounterDeck(run)), `${starter.name} ${ENCOUNTERS[i].title}`).toEqual([]);
      }
    }
  });

  it('generates complete packs for 1,000 reward paths for each starter without dead copies or rerolls', () => {
    for (const starter of STARTERS) for (let seed = 0; seed < 1000; seed++) {
      const run = newCampaign(starter.key, `run-${seed}`, `seed-${seed}`);
      for (let encounter = 0; encounter < 8; encounter++) {
        run.encounter = encounter;
        const pack = generateReward(run);
        expect(pack).toEqual(generateReward(run));
        expect(pack.cards).toHaveLength(7);
        expect(pack.offers).toHaveLength(3);
        expect(new Set([...pack.cards, ...pack.offers]).size).toBe(10);
        for (const slug of pack.cards) {
          expect(run.inventory[slug] ?? 0).toBeLessThan(3);
          expect(starter.colors).toContain(BY_SLUG.get(slug)?.color);
          run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
        }
        const option = pack.offers[seed % 3];
        expect(run.inventory[option] ?? 0).toBeLessThan(BY_SLUG.get(option)?.type === 'Legend' ? 1 : 3);
        run.inventory[option] = (run.inventory[option] ?? 0) + 1;
      }
    }
  }, 60000);

  it('rejects cards from the physical Vault and decks with unsupported colour changes', () => {
    const run = newCampaign('the-heist', 'locked', 'seed');
    const extra = 'adam-smasher-ender-of-legends';
    expect(campaignDeckIssues(run, { ...run.deck, cards: { ...run.deck.cards, [extra]: 1 } }).join(' ')).toContain('outside the starter colours');
    expect(campaignDeckIssues(run, { ...run.deck, cards: { ...run.deck.cards, 'westbrook-netrunner': 3 } }).length).toBeGreaterThan(0);
  });

  it('settles a first win exactly once and never grants a pack for a loss', () => {
    const run = newCampaign('the-heist', 'reward', 'seed');
    const player = prepareMatchDeck(run.deck), rival = prepareMatchDeck(encounterDeck(run));
    const controller = createMatchController();
    const response = controller.respond({ id: 1, action: { type: 'start', setup: { player, rival } } });
    if (!('snapshot' in response)) throw new Error(response.error);
    const match = controller.save(response.snapshot);
    match.summary.ended = true;
    run.phase = 'inMatch'; run.rewards[0] = generateReward(run);
    const profile = { version: 1 as const, completions: { 'the-heist': 0, 'embracing-power': 0 }, environments: [] };
    const first = grantVictory(run, profile, match, 'player');
    expect(first.run.phase).toBe('rewardPending');
    expect(first.run.inventory).not.toEqual(run.inventory);
    expect(grantVictory(first.run, first.profile, match, 'player').run).toEqual(first.run);
    expect(grantVictory(run, profile, match, 'rival').run.inventory).toEqual(run.inventory);
  });

  it('serializes reveal and choice across tabs, and preserves all awarded cards on a reload', async () => {
    const scope = 'campaign-tabs';
    const original = await startCampaign(scope, 'the-heist');
    original.run.rewards[0] = generateReward(original.run);
    original.run.phase = 'rewardPending';
    for (const slug of original.run.rewards[0].cards) original.run.inventory[slug] = (original.run.inventory[slug] ?? 0) + 1;
    await updateCampaign(scope, () => ({ run: original.run, value: null }));
    const [one, two] = await Promise.allSettled([
      revealCampaignPack(scope, original.run.revision, 7),
      revealCampaignPack(scope, original.run.revision, 1),
    ]);
    expect([one.status, two.status].sort()).toEqual(['fulfilled', 'rejected']);
    const saved = (await readCampaign(scope)).run!;
    expect([1, 7]).toContain(saved.revealed);
    const offer = saved.rewards[0].offers[0];
    const chosen = await chooseReward(scope, saved.revision, offer);
    await expect(chooseReward(scope, saved.revision, offer)).rejects.toThrow();
    expect((await readCampaign(scope)).run!.inventory[offer]).toBe(chosen.run.inventory[offer]);
    const bad = { ...chosen.run.deck, cards: { ...chosen.run.deck.cards, [offer]: 4 } };
    await expect(saveCampaignDeck(scope, chosen.run.revision, bad)).rejects.toThrow();
  });

  it('keeps active campaigns in separate scopes and awards the final environment once', async () => {
    const a = await startCampaign('alice-campaign', 'embracing-power');
    expect((await readCampaign('bob-campaign')).run).toBeUndefined();
    await updateCampaign('alice-campaign', () => ({ run: { ...a.run, phase: 'claimingFinish' }, value: null }));
    const claimed = await claimEnvironment('alice-campaign', a.run.revision, 'booth');
    expect(claimed.profile.environments).toEqual(['booth']);
    await expect(claimEnvironment('alice-campaign', a.run.revision, 'booth')).rejects.toThrow();
    expect((await readCampaign('alice-campaign')).profile.environments).toEqual(['booth']);
  });

  it('keeps existing seals and grants House Gold on a campaign clear, Black Chrome after both starters', async () => {
    const scope = 'campaign-finishes';
    await startCampaign(scope, 'the-heist');
    await updateCampaign(scope, (run, profile) => ({ value: null, run,
      profile: { ...profile, completions: { ...profile.completions, 'the-heist': 1 } } }));
    expect((await readCircuitProgress(scope)).campaignFinishes).toEqual(['gold']);
    await equipTableFinish(scope, 'gold');
    await updateCampaign(scope, (run, profile) => ({ value: null, run,
      profile: { ...profile, completions: { ...profile.completions, 'embracing-power': 1 } } }));
    const progress = await readCircuitProgress(scope);
    expect(progress.finish).toBe('gold');
    expect(progress.campaignFinishes).toEqual(['gold', 'chrome']);
    await equipTableFinish(scope, 'chrome');
  });

  it('archives completed decks without match checkpoints and keeps earned rooms when a new run starts', async () => {
    const scope = 'campaign-archive';
    const first = await startCampaign(scope, 'the-heist');
    const oldDeck = structuredClone(first.run.deck);
    await updateCampaign(scope, (run, profile) => ({ run: { ...run!, phase: 'completed', completedAt: 12345 },
      profile: { ...profile, environments: ['booth' as const], equipped: 'booth' as const }, value: null }));
    const second = await startCampaign(scope, 'embracing-power');
    expect(second.run.starter).toBe('embracing-power');
    expect(second.profile.equipped).toBe('booth');
    expect(second.profile.history).toEqual([{ id: first.run.id, starter: 'the-heist', cleared: 9, completed: true, endedAt: 12345, deck: oldDeck }]);
    await expect(startCampaign(scope, 'the-heist')).rejects.toThrow('Finish or abandon');
    const third = await startCampaign(scope, 'the-heist', true);
    expect(third.profile.history?.at(-1)?.completed).toBe(false);
    expect(third.profile.history?.at(-1)?.deck).toEqual(second.run.deck);
  });
});
