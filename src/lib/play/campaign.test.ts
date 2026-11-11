import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BY_SLUG, fitsRam, ramLimits } from '../data';
import { STARTERS } from '../starters';
import { ENCOUNTERS, campaignDeckIssues, encounterDeck, encounterSkill, generateReward, grantVictory, newCampaign } from './campaign';
import { matchDeckIssues, prepareMatchDeck } from './matchDeck';
import { createMatchController } from './workerController';
import { chooseReward, claimEnvironment, readCampaign, revealCampaignPack, saveCampaignDeck, startCampaign, updateCampaign } from './campaignStorage';
import { readCircuitProgress, equipTableFinish, openDatabase, readMatchSummary } from './matchStorage';
import { REWARD_THEMES } from './campaignBalance';
import { isEngineSupported } from './engineCards';

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
      const ram = ramLimits(run.deck.legends);
      for (let encounter = 0; encounter < 8; encounter++) {
        run.encounter = encounter;
        const pack = generateReward(run);
        expect(pack).toEqual(generateReward(run));
        expect(pack.cards).toHaveLength(7);
        expect(pack.offers).toHaveLength(3);
        expect(new Set([...pack.cards, ...pack.offers]).size).toBe(10);
        const legends = pack.offers.filter(slug => BY_SLUG.get(slug)?.type === 'Legend');
        expect(legends).toHaveLength([2, 5].includes(encounter) ? 2 : 0);
        for (const slug of [...pack.cards, ...pack.offers]) {
          const card = BY_SLUG.get(slug)!;
          if (!isEngineSupported(slug) || card.legal !== 'legal' || !starter.colors.includes(card.color)
            || (run.inventory[slug] ?? 0) >= (card.type === 'Legend' ? 1 : 3)
            || (card.type !== 'Legend' && !fitsRam(card, ram))) {
            throw new Error(`${starter.key} seed ${seed}, pack ${encounter + 1}: ineligible ${slug}`);
          }
        }
        if (encounter < 3) expect(pack.cards.some(slug => {
          const card = BY_SLUG.get(slug)!;
          return (card.cost ?? 9) <= 3 && (card.sellable || card.type === 'Unit');
        })).toBe(true);
        const option = pack.offers[seed % 3];
        for (const slug of [...pack.cards, option]) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
      }
    }
  }, 60000);

  it.each(STARTERS)('fills a late $name pack when both authored reward pools have hit the copy cap', starter => {
    const run = newCampaign(starter.key, 'saturated', 'saturated');
    run.encounter = 7;
    const saturated = new Set(REWARD_THEMES[starter.key].flatMap(theme => [...theme]));
    for (const slug of saturated) run.inventory[slug] = 3;
    const pack = generateReward(run);
    expect(new Set([...pack.cards, ...pack.offers]).size).toBe(10);
    expect([...pack.cards, ...pack.offers].some(slug => saturated.has(slug))).toBe(false);
  });

  it('keeps the original rewards, rival snapshots, and skill schedule for campaigns started before tuning', () => {
    const legacy = newCampaign('the-heist', 'compat', 'compat');
    delete legacy.balanceVersion;
    legacy.opponents = [];
    expect(generateReward(legacy)).toEqual({ id: 'compat:0',
      cards: ['dying-night-v-s-pistol', 'towerfall', 'viktor-vektor-drop-your-illusions', 'mt0d12-flathead',
        'rockn-rockerboy', 'trauma-team-operatives', 't-bug-amateur-philosopher'],
      offers: ['augmented-negotiators', 'tetratronic-rippler', 'reboot-optics'],
    });
    legacy.opponents = ENCOUNTERS.map((_, encounter) => encounterDeck({ ...legacy, encounter }));
    const current = newCampaign('the-heist', 'current', 'compat');
    expect(encounterDeck(legacy).cards).toEqual(STARTERS.find(starter => starter.key === 'embracing-power')?.cards);
    expect(encounterDeck(current).name).toContain('Practice List');
    expect(encounterSkill({ ...legacy, encounter: 3 })).toBe('standard');
    expect(encounterSkill({ ...current, encounter: 3 })).toBe('sharp');
    expect(encounterDeck({ ...legacy, encounter: 8 }).legends).toContain('yorinobu-arasaka-embracing-destruction');
    expect(encounterDeck({ ...current, encounter: 8 }).legends).toContain('goro-takemura-hands-unclean');
  });

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

  it.each(STARTERS)('persists all nine tables and workshop transitions for $name without touching Free Play', async starter => {
    const scope = `campaign-complete-path:${starter.key}`;
    const db = await openDatabase();
    const freeSummary = { matchId: `free:${starter.key}`, ended: false };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('summaries', 'readwrite');
      tx.objectStore('summaries').put(freeSummary, scope);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    await startCampaign(scope, starter.key);
    let sawRecruit = false;
    for (let encounter = 0; encounter < 9; encounter++) {
      const before = (await readCampaign(scope)).run!;
      expect(before.encounter).toBe(encounter);
      expect(['preparing', 'upgrading']).toContain(before.phase);
      expect(campaignDeckIssues(before, before.deck)).toEqual([]);
      const controller = createMatchController();
      const response = controller.respond({ id: 1, action: { type: 'start', setup: { player: prepareMatchDeck(before.deck), rival: prepareMatchDeck(encounterDeck(before)) } } });
      if (!('snapshot' in response)) throw new Error(response.error);
      const match = controller.save(response.snapshot);
      match.summary.ended = true;
      const sealed = encounter < 8 ? generateReward(before) : undefined;
      await updateCampaign(scope, () => ({ run: { ...before, phase: 'inMatch', match,
        rewards: sealed ? { ...before.rewards, [encounter]: sealed } : before.rewards }, value: null }));
      const live = (await readCampaign(scope)).run!;
      expect(live.phase).toBe('inMatch');
      expect(live.match?.summary.matchId).toBe(match.summary.matchId);
      await updateCampaign(scope, (run, profile) => ({ ...grantVictory(run!, profile, match, 'player'), value: null }));
      const settled = (await readCampaign(scope)).run!;
      expect(grantVictory(settled, (await readCampaign(scope)).profile, match, 'player').run).toEqual(settled);
      if (encounter < 8) {
        expect(settled.phase).toBe('rewardPending');
        expect(settled.rewards[encounter]).toEqual(sealed);
        const firstCard = await revealCampaignPack(scope, settled.revision, 1);
        expect((await readCampaign(scope)).run?.revealed).toBe(1);
        await expect(revealCampaignPack(scope, settled.revision, 7)).rejects.toThrow();
        const revealed = await revealCampaignPack(scope, firstCard.run.revision, 7);
        expect((await readCampaign(scope)).run?.revealed).toBe(7);
        const offer = [2, 5].includes(encounter) ? revealed.run.rewards[encounter].offers[0]
          : revealed.run.rewards[encounter].offers[encounter % 3];
        const chosen = await chooseReward(scope, revealed.run.revision, offer);
        await expect(chooseReward(scope, revealed.run.revision, offer)).rejects.toThrow();
        expect(chosen.run.phase).toBe('upgrading');
        expect(chosen.run.encounter).toBe(encounter + 1);
        expect(chosen.run.rewards[encounter].choice).toBe(offer);
        expect((await readCampaign(scope)).run?.inventory[offer]).toBe(chosen.run.inventory[offer]);
        if (encounter === 0) {
          const [remove] = Object.entries(chosen.run.deck.cards).find(([, qty]) => qty > 0)!;
          const short = structuredClone(chosen.run.deck);
          short.cards[remove]--; if (!short.cards[remove]) delete short.cards[remove];
          const saved = await saveCampaignDeck(scope, chosen.run.revision, short);
          expect((await readCampaign(scope)).run?.deck).toEqual(short);
          expect(saved.run.lastLegal).toEqual(chosen.run.deck);
          expect(campaignDeckIssues(saved.run, saved.run.deck).length).toBeGreaterThan(0);
          await expect(saveCampaignDeck(scope, chosen.run.revision, chosen.run.deck)).rejects.toThrow();
          await saveCampaignDeck(scope, saved.run.revision, saved.run.lastLegal);
        }
        if ([2, 5].includes(encounter)) {
          const current = (await readCampaign(scope)).run!;
          const offered = BY_SLUG.get(offer)!;
          const prior = current.deck.legends.find(slug => BY_SLUG.get(slug)?.color === offered.color
            && (BY_SLUG.get(slug)?.ram ?? 0) <= (offered.ram ?? 0))!;
          const swapped = { ...current.deck, legends: current.deck.legends.map(slug => slug === prior ? offer : slug) };
          const updated = await saveCampaignDeck(scope, current.revision, swapped);
          expect(campaignDeckIssues(updated.run, updated.run.deck)).toEqual([]);
          sawRecruit = true;
        } else {
          const current = (await readCampaign(scope)).run!;
          const available = sealed!.cards.find(slug => !current.deck.cards[slug]);
          if (available) {
            const [remove] = Object.entries(current.deck.cards).find(([, qty]) => qty > 0)!;
            const updated = structuredClone(current.deck);
            updated.cards[remove]--; if (!updated.cards[remove]) delete updated.cards[remove];
            updated.cards[available] = 1;
            const saved = await saveCampaignDeck(scope, current.revision, updated);
            expect(campaignDeckIssues(saved.run, saved.run.deck)).toEqual([]);
          }
        }
        expect((await readCampaign(scope)).run?.phase).toBe('upgrading');
        expect(await readMatchSummary(scope)).toEqual(freeSummary);
      }
    }
    const finish = await readCampaign(scope);
    expect(finish.run?.phase).toBe('claimingFinish');
    expect(sawRecruit).toBe(true);
    expect(finish.profile.completions[starter.key]).toBe(1);
    await expect(startCampaign(scope, starter.key, true)).rejects.toThrow('Choose your earned room');
    const room = await claimEnvironment(scope, finish.run!.revision, 'rooftop');
    expect(room.run.phase).toBe('completed');
    expect((await readCampaign(scope)).profile.equipped).toBe('rooftop');
    expect(await readMatchSummary(scope)).toEqual(freeSummary);
  }, 30000);

  it('leaves the previous campaign intact if a transaction cannot store a change', async () => {
    const scope = 'campaign-failed-write';
    const started = await startCampaign(scope, 'the-heist');
    await expect(updateCampaign(scope, run => ({ run: { ...run!, deck: {
      ...run!.deck, notes: (() => 'cannot clone') as unknown as string,
    } }, value: null }))).rejects.toThrow();
    expect((await readCampaign(scope)).run).toEqual(started.run);
    const edited = await saveCampaignDeck(scope, started.run.revision, started.run.deck);
    expect(edited.run.revision).toBe(started.run.revision + 1);
  });
});
