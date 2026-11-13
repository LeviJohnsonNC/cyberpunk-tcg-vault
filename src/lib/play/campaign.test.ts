import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BY_SLUG, CARDS, fitsRam, ramLimits, PRINTING_INDEX } from '../data';
import { STARTERS } from '../starters';
import { ENCOUNTERS, campaignDeckIssues, encounterDeck, encounterSkill, generateReward, settleCampaignMatch, newCampaign } from './campaign';
import { campaignPulls } from './campaignPack';
import { matchDeckIssues, prepareMatchDeck } from './matchDeck';
import { createMatchController } from './workerController';
import { aftermathBeats } from './campaignScenes';
import { unlockedCampaignChapters } from './campaignStory';
import { latestPack } from './campaignPresentation';
import { acknowledgeCampaignResult, advanceCampaignScene, finishCampaignPack, chooseReward, claimEnvironment, readCampaign, revealCampaignPack, saveCampaignDeck, startCampaign, updateCampaign } from './campaignStorage';
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

  it('generates deterministic retail pulls and compatible picks across 1,000 reward paths per starter', () => {
    const tier = ['Common', 'Uncommon', 'Rare', 'Epic', 'Secret', 'Iconic Other', 'Iconic Legend', 'Iconic Secret'];
    const hits = { Epic: 0, Secret: 0, Iconic: 0 };
    const iconics = new Set<string>();
    let total = 0;
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
        const pulls = campaignPulls(pack);
        const rarities = pulls.map(pull => pull.printing!.rarity);
        expect(rarities).toEqual([...rarities].sort((a, b) => tier.indexOf(a) - tier.indexOf(b)));
        expect(rarities.slice(0, 5).every(rarity => rarity === 'Common' || rarity === 'Uncommon')).toBe(true);
        expect([3, 4]).toContain(rarities.filter(rarity => rarity === 'Common').length);
        expect(rarities.slice(5).every(rarity => tier.indexOf(rarity) >= 2)).toBe(true);
        for (const { slug, printing } of pulls) {
          expect(printing?.set).toBe('Welcome to Night City — Retail');
          expect(PRINTING_INDEX.get(printing!.id)?.card.slug).toBe(slug);
          if (printing!.rarity.startsWith('Iconic ')) iconics.add(printing!.id);
        }
        total++;
        hits.Epic += Number(rarities.includes('Epic'));
        hits.Secret += Number(rarities.includes('Secret'));
        hits.Iconic += Number(rarities.some(rarity => rarity.startsWith('Iconic ')));
        for (const slug of pack.offers) {
          const card = BY_SLUG.get(slug)!;
          if (!isEngineSupported(slug) || card.legal !== 'legal' || !starter.colors.includes(card.color)
            || (run.inventory[slug] ?? 0) >= (card.type === 'Legend' ? 1 : 3)
            || (card.type !== 'Legend' && !fitsRam(card, ram))) {
            throw new Error(`${starter.key} seed ${seed}, pack ${encounter + 1}: ineligible ${slug}`);
          }
        }
        const option = pack.offers[seed % 3];
        for (const slug of [...pack.cards, option]) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
      }
    }
    expect(Math.abs(hits.Epic / total - 1 / 4)).toBeLessThan(.015);
    expect(Math.abs(hits.Secret / total - 1 / 24)).toBeLessThan(.008);
    expect(Math.abs(hits.Iconic / total - 1 / 18)).toBeLessThan(.008);
    expect(iconics.size).toBe(31);
  }, 60000);

  it.each(STARTERS)('fills a late $name pack when both authored reward pools have hit the copy cap', starter => {
    const run = newCampaign(starter.key, 'saturated', 'saturated');
    run.encounter = 7;
    const saturated = new Set(REWARD_THEMES[starter.key].flatMap(theme => [...theme]));
    for (const slug of saturated) run.inventory[slug] = 3;
    const pack = generateReward(run);
    expect(new Set([...pack.cards, ...pack.offers]).size).toBe(10);
    expect(pack.offers.some(slug => saturated.has(slug))).toBe(false);
  });

  it('can open a win and keep the bonus even after the reserve fills with duplicates', async () => {
    const scope = 'campaign-full-reserve';
    const { run } = await startCampaign(scope, 'the-heist');
    run.encounter = 7;
    run.inventory = Object.fromEntries(CARDS.filter(card => card.type !== 'Legend').map(card => [card.slug, 3]));
    run.phase = 'rewardPending';
    const pack = generateReward(run);
    expect(pack.cards).toHaveLength(7);
    expect(new Set([...pack.cards, ...pack.offers]).size).toBe(10);
    run.rewards[7] = pack;
    run.revealed = 7;
    await updateCampaign(scope, () => ({ run, value: null }));
    const result = await chooseReward(scope, run.revision, pack.offers[0]);
    expect(result.run.encounter).toBe(8);
    expect(result.run.inventory[pack.offers[0]]).toBe(4);
  });

  it('keeps rival snapshots and skill for campaigns started before tuning', () => {
    const legacy = newCampaign('the-heist', 'compat', 'compat');
    delete legacy.balanceVersion;
    legacy.opponents = [];
    legacy.opponents = ENCOUNTERS.map((_, encounter) => encounterDeck({ ...legacy, encounter }));
    const current = newCampaign('the-heist', 'current', 'compat');
    expect(encounterDeck(legacy).cards).toEqual(STARTERS.find(starter => starter.key === 'embracing-power')?.cards);
    const tuned = encounterDeck(current);
    expect(tuned.name).toBe('Moth’s Embracing Power');
    current.opponents[0].name = 'Embracing Power · Practice List';
    expect(encounterDeck(current)).toEqual(tuned);
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

  it('settles a first win exactly once and skips the pack on concession', () => {
    const run = newCampaign('the-heist', 'reward', 'seed');
    const player = prepareMatchDeck(run.deck), rival = prepareMatchDeck(encounterDeck(run));
    const controller = createMatchController();
    const response = controller.respond({ id: 1, action: { type: 'start', setup: { player, rival } } });
    if (!('snapshot' in response)) throw new Error(response.error);
    const match = controller.save(response.snapshot);
    match.summary.ended = true;
    run.phase = 'inMatch'; run.match = match; run.rewards[0] = generateReward(run);
    const profile = { version: 1 as const, completions: { 'the-heist': 0, 'embracing-power': 0 }, environments: [] };
    const first = settleCampaignMatch(run, profile, match, 'player');
    expect(first.run.phase).toBe('rewardPending');
    expect(first.run.inventory).not.toEqual(run.inventory);
    expect(settleCampaignMatch(first.run, first.profile, match, 'player').run).toEqual(first.run);
    const conceded = settleCampaignMatch(run, profile, match, 'rival', true).run;
    expect(conceded.inventory).toEqual(run.inventory);
    expect(conceded.aftermath).toBeUndefined();
    expect(conceded.phase).toBe('preparing');
  });

  it.each(STARTERS)('resumes repeat losses and draws with randomized five-card packs for $name', async starter => {
    const scope = `campaign-house-packs:${starter.key}`;
    const { run: initial } = await startCampaign(scope, starter.key);
    const winPack = generateReward(initial);
    const seen = new Set<string>();
    let lastLine = '';
    for (const winner of ['rival', 'rival', null, 'rival'] as const) {
      const { run: before } = await readCampaign(scope);
      const controller = createMatchController();
      const response = controller.respond({ id: 1, action: { type: 'start', setup: {
        player: prepareMatchDeck(before!.deck), rival: prepareMatchDeck(encounterDeck(before!)),
      } } });
      if (!('snapshot' in response)) throw new Error(response.error);
      const match = controller.save(response.snapshot);
      match.summary.ended = true;
      await updateCampaign(scope, (run, profile) => ({ ...settleCampaignMatch({
        ...run!, phase: 'inMatch', match, rewards: { 0: winPack },
      }, profile, match, winner), value: null }));
      const { run, profile } = await readCampaign(scope);
      const pack = run!.latestRetry!;
      expect(run!.phase).toBe('retryReward');
      expect(unlockedCampaignChapters(run!)).toEqual([]);
      expect(run!.rewards[0]).toEqual(winPack);
      expect(pack.cards).toHaveLength(5);
      expect(pack.offers).toEqual([]);
      expect(new Set(pack.cards).size).toBe(5);
      expect(pack.cards.some(slug => winPack.offers.includes(slug))).toBe(false);
      for (const slug of pack.cards) {
        const card = BY_SLUG.get(slug)!;
        expect(starter.colors).toContain(card.color);
        expect(card.type).not.toBe('Legend');
        expect(run!.inventory[slug]).toBe((before!.inventory[slug] ?? 0) + 1);
      }
      expect(settleCampaignMatch(run!, profile, match, winner).run).toEqual(run);
      seen.add(pack.cards.join(','));
      const line = aftermathBeats(run!)[0].text;
      expect(line).not.toBe(lastLine);
      lastLine = line;
      await expect(revealCampaignPack(scope, run!.revision, 1)).rejects.toThrow();
      expect(run!.resultPending).toBe(true);
      await expect(advanceCampaignScene(scope, run!)).rejects.toThrow();
      const [first, second] = await Promise.allSettled([
        acknowledgeCampaignResult(scope, run!, match.summary.matchId),
        acknowledgeCampaignResult(scope, run!, match.summary.matchId),
      ]);
      expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected']);
      const acknowledged = (await readCampaign(scope)).run!;
      expect(acknowledged.inventory).toEqual(run!.inventory);
      expect(acknowledged.latestRetry).toEqual(pack);
      expect(acknowledged.resultPending).toBeUndefined();
      const [one, two] = await Promise.allSettled([advanceCampaignScene(scope, acknowledged), advanceCampaignScene(scope, acknowledged, true)]);
      expect([one.status, two.status].sort()).toEqual(['fulfilled', 'rejected']);
      const scene = (await readCampaign(scope)).run!;
      expect(scene.aftermath?.sceneSeen).toBe(true);
      await expect(finishCampaignPack(scope, scene)).rejects.toThrow();
      const partial = await revealCampaignPack(scope, scene.revision, 2);
      expect((await readCampaign(scope)).run?.revealed).toBe(2);
      expect(partial.run.latestRetry).toEqual(pack);
      await expect(revealCampaignPack(scope, partial.run.revision, 6)).rejects.toThrow();
      const opened = await revealCampaignPack(scope, partial.run.revision, 5);
      const finished = await finishCampaignPack(scope, opened.run);
      await expect(finishCampaignPack(scope, opened.run)).rejects.toThrow();
      expect(finished.run.encounter).toBe(0);
      expect(finished.run.phase).toBe('preparing');
      expect(latestPack(finished.run).map(pull => pull.slug)).toEqual(pack.cards);
    }
    expect(seen.size).toBe(4);
  });

  it('opens an older sealed reward common-first without changing the awarded cards or offers', async () => {
    const { run } = await startCampaign('legacy-pack-order', 'the-heist');
    run.phase = 'rewardPending';
    const pack = { id: 'compat:0',
      cards: ['towerfall', 'mt0d12-flathead', 'floor-it', 'trauma-team-operatives', 't-bug-amateur-philosopher',
        'dying-night-v-s-pistol', 'rockn-rockerboy'],
      offers: ['augmented-negotiators', 'tetratronic-rippler', 'reboot-optics'] };
    run.rewards[0] = pack;
    await updateCampaign('legacy-pack-order', () => ({ run, value: undefined }));
    const first = await revealCampaignPack('legacy-pack-order', run.revision, 1);
    const opened = first.run.rewards[0];
    expect([...opened.cards].sort()).toEqual([...pack.cards].sort());
    expect(opened.offers).toEqual(pack.offers);
    expect(first.run.inventory).toEqual(run.inventory);
    expect(campaignPulls(opened)[0].printing?.rarity).toBe('Common');
    const saved = await revealCampaignPack('legacy-pack-order', first.run.revision, 3);
    expect(saved.run.rewards[0]).toEqual(opened);
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
    expect(saved.rewards[0].printingIds).toEqual(original.run.rewards[0].printingIds);
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
    const third = await startCampaign(scope, 'the-heist', second.run);
    expect(third.profile.history?.at(-1)?.completed).toBe(false);
    expect(third.profile.history?.at(-1)?.deck).toEqual(second.run.deck);
    await expect(startCampaign(scope, 'embracing-power', second.run)).rejects.toThrow('changed in another tab');
    expect((await readCampaign(scope)).run?.id).toBe(third.run.id);
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
      await updateCampaign(scope, (run, profile) => ({ ...settleCampaignMatch(run!, profile, match, 'player'), value: null }));
      const settled = (await readCampaign(scope)).run!;
      expect(settleCampaignMatch(settled, (await readCampaign(scope)).profile, match, 'player').run).toEqual(settled);
      expect(settled.phase).toBe('rewardPending');
      expect(unlockedCampaignChapters(settled)).toHaveLength(encounter + 1);
      const acknowledged = await acknowledgeCampaignResult(scope, settled, match.summary.matchId);
      expect(acknowledged.run.inventory).toEqual(settled.inventory);
      const nextBeat = await advanceCampaignScene(scope, acknowledged.run);
      expect((await readCampaign(scope)).run?.aftermath).toMatchObject({ beat: 1, sceneSeen: false });
      const skipped = await advanceCampaignScene(scope, nextBeat.run, true);
      if (encounter < 8) {
        expect(settled.rewards[encounter]).toEqual(sealed);
        const firstCard = await revealCampaignPack(scope, skipped.run.revision, 1);
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
      } else {
        expect(settled.rewards[8].cards).toHaveLength(7);
        expect(settled.rewards[8].offers).toEqual([]);
        await expect(claimEnvironment(scope, skipped.run.revision, 'rooftop')).rejects.toThrow();
        const opened = await revealCampaignPack(scope, skipped.run.revision, 7);
        await finishCampaignPack(scope, opened.run);
      }
    }
    const finish = await readCampaign(scope);
    expect(finish.run?.phase).toBe('claimingFinish');
    expect(sawRecruit).toBe(true);
    expect(finish.profile.completions[starter.key]).toBe(1);
    await expect(startCampaign(scope, starter.key, finish.run!)).rejects.toThrow('Choose your earned room');
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
