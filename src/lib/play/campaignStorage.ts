import type { Deck } from '../store';
import { BY_SLUG } from '../data';
import { sortLegacyPack } from './campaignPack';
import { openDatabase } from './matchStorage';
import { emptyCircuit, finishUnlocked, type CircuitProgress, type TableFinish } from './circuit';
import { CAMPAIGN_VERSION, ENCOUNTERS, ENVIRONMENTS, campaignClearedCount, campaignDeckIssues, emptyProfile, newCampaign, pendingCampaignPack,
  type CampaignProfile, type CampaignRun, type Environment } from './campaign';
import { aftermathBeats } from './campaignScenes';
import type { StarterKey } from '../starters';

const STORE = 'campaigns';
const profileKey = (scope: string) => `profile:${scope}`;
const runKey = (scope: string) => `run:${scope}`;

export async function readCampaign(scope: string): Promise<{ run?: CampaignRun; profile: CampaignProfile }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const store = tx.objectStore(STORE);
    const run = store.get(runKey(scope)), profile = store.get(profileKey(scope));
    tx.oncomplete = () => resolve({ run: run.result, profile: profile.result ?? emptyProfile() });
    tx.onerror = () => reject(tx.error);
  });
}

/** Serializes all campaign changes, including worker checkpoints, in the same object-store transaction. */
export async function updateCampaign<T>(scope: string, change: (run: CampaignRun | undefined, profile: CampaignProfile) => {
  run?: CampaignRun; profile?: CampaignProfile; value: T;
}): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([STORE, 'circuits'], 'readwrite', { durability: 'strict' });
    const store = tx.objectStore(STORE), runRead = store.get(runKey(scope));
    const circuit = tx.objectStore('circuits'), circuitRead = circuit.get(scope);
    // The callback reads all three results; enqueue the profile request last.
    const profileRead = store.get(profileKey(scope));
    let value: T;
    profileRead.onsuccess = () => {
      try {
        const previous = runRead.result as CampaignRun | undefined;
        if (previous && previous.version !== CAMPAIGN_VERSION) throw new Error('This campaign needs a newer Vault version.');
        const changed = change(previous, (profileRead.result as CampaignProfile | undefined) ?? emptyProfile());
        value = changed.value;
        if (changed.run) store.put(changed.run, runKey(scope));
        if (changed.profile) store.put(changed.profile, profileKey(scope));
        if (changed.profile && changed.profile.completions !== (profileRead.result as CampaignProfile | undefined)?.completions) {
          const progress = (circuitRead.result as CircuitProgress | undefined) ?? emptyCircuit();
          const unlocked: TableFinish[] = [...(progress.campaignFinishes ?? [])];
          const completions = changed.profile.completions;
          if (completions['the-heist'] + completions['embracing-power'] > 0 && !unlocked.includes('gold')) unlocked.push('gold');
          if (completions['the-heist'] > 0 && completions['embracing-power'] > 0 && !unlocked.includes('chrome')) unlocked.push('chrome');
          circuit.put({ ...progress, campaignFinishes: unlocked }, scope);
        }
      } catch (cause) { tx.abort(); reject(cause); }
    };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error ?? new Error('Campaign changes were not saved.'));
  });
}

export async function resetCampaign(scope: string, expected: Pick<CampaignRun, 'id' | 'revision'>) {
  const db = await openDatabase();
  return new Promise<CampaignProfile>((resolve, reject) => {
    const tx = db.transaction([STORE, 'circuits'], 'readwrite', { durability: 'strict' });
    const store = tx.objectStore(STORE), runRead = store.get(runKey(scope));
    const circuits = tx.objectStore('circuits'), circuitRead = circuits.get(scope);
    circuitRead.onsuccess = () => {
      try {
        const run = runRead.result as CampaignRun | undefined;
        if (run?.id !== expected.id || run.revision !== expected.revision)
          throw new Error('The campaign changed in another tab. Reload it before resetting.');
        const saved = circuitRead.result as CircuitProgress | undefined;
        if (run.version !== CAMPAIGN_VERSION || (saved && saved.version !== 1))
          throw new Error('This campaign needs a newer Vault version.');
        store.delete(runKey(scope));
        store.delete(profileKey(scope));
        if (saved?.campaignFinishes) {
          const { campaignFinishes: _, ...progress } = saved;
          if (!finishUnlocked(progress, progress.finish)) progress.finish = 'afterlife';
          circuits.put(progress, scope);
        }
      } catch (cause) { tx.abort(); reject(cause); }
    };
    tx.oncomplete = () => resolve(emptyProfile());
    tx.onabort = () => reject(tx.error ?? new Error('The campaign couldn’t be reset. Try again.'));
  });
}

export function startCampaign(scope: string, starter: StarterKey, replace?: Pick<CampaignRun, 'id' | 'revision'>) {
  return updateCampaign(scope, (old, profile) => {
    if (old?.phase === 'claimingFinish' || (old?.phase === 'rewardPending' && !!old.completedAt)) throw new Error('Choose your earned room before starting another campaign.');
    if (replace && (old?.id !== replace.id || old.revision !== replace.revision)) {
      throw new Error('The campaign changed in another tab. Reload the campaign before starting again.');
    }
    if (old && old.phase !== 'completed' && !replace) throw new Error('Finish or abandon your current campaign first.');
    const run = newCampaign(starter, crypto.randomUUID(), crypto.randomUUID());
    const nextProfile = old ? { ...profile, history: [...(profile.history ?? []), {
      id: old.id, starter: old.starter, cleared: campaignClearedCount(old),
      completed: old.phase === 'completed', endedAt: old.completedAt ?? Date.now(), deck: structuredClone(old.deck),
    }] } : profile;
    return { run, profile: nextProfile, value: { run, profile: nextProfile } };
  });
}

export function chooseReward(scope: string, expected: number, slug: string) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || run.phase !== 'rewardPending' || (run.aftermath && !run.aftermath.sceneSeen)) throw new Error('The pack changed in another tab. Reload the campaign.');
    const reward = run.rewards[run.encounter];
    if (!reward || !reward.offers.includes(slug) || reward.choice || (run.aftermath && (run.revealed ?? 0) < reward.cards.length)) throw new Error('Choose an available card from this pack.');
    if (BY_SLUG.get(slug)?.type === 'Legend' && (run.inventory[slug] ?? 0) >= 1) throw new Error('You already have the maximum copies.');
    const next = { ...run, revision: run.revision + 1, encounter: run.encounter + 1, attempts: 0, defeats: 0, revealed: 0, aftermath: undefined, phase: 'upgrading' as const,
      inventory: { ...run.inventory, [slug]: (run.inventory[slug] ?? 0) + 1 },
      rewards: { ...run.rewards, [run.encounter]: { ...reward, choice: slug } } };
    return { run: next, value: { run: next, profile } };
  });
}

export function acknowledgeCampaignResult(scope: string, expected: Pick<CampaignRun, 'id' | 'revision'>, matchId: string) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.id !== expected.id || run.revision !== expected.revision || !run.resultPending
      || !run.match?.summary.ended || run.match.summary.matchId !== matchId)
      throw new Error('The campaign result changed in another tab. Reload the saved match.');
    const next = { ...run, revision: run.revision + 1, resultPending: undefined };
    return { run: next, value: { run: next, profile } };
  });
}

export function advanceCampaignScene(scope: string, expected: Pick<CampaignRun, 'id' | 'revision'>, skip = false) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.id !== expected.id || run.revision !== expected.revision || run.resultPending || !pendingCampaignPack(run)
      || !run.aftermath || run.aftermath.sceneSeen) throw new Error('The story changed in another tab. Reload the campaign.');
    const beat = run.aftermath.beat + 1;
    const sceneSeen = skip || beat >= aftermathBeats(run).length;
    const next = { ...run, revision: run.revision + 1,
      aftermath: { ...run.aftermath, beat: sceneSeen ? run.aftermath.beat : beat, sceneSeen } };
    return { run: next, value: { run: next, profile } };
  });
}

export function revealCampaignPack(scope: string, expected: number, count: number) {
  return updateCampaign(scope, (run, profile) => {
    const pack = run && pendingCampaignPack(run);
    if (!run || run.revision !== expected || !pack || (run.aftermath && !run.aftermath.sceneSeen)
      || !Number.isInteger(count) || count < (run.revealed ?? 0) || count > pack.cards.length)
      throw new Error('The pack changed in another tab. Reload the campaign.');
    const rewards = run.phase === 'rewardPending' && !pack.printingIds && !(run.revealed ?? 0) && count > 0
      ? { ...run.rewards, [run.encounter]: { ...pack, cards: sortLegacyPack(pack.cards) } }
      : run.rewards;
    const next = { ...run, revision: run.revision + 1, revealed: count, rewards };
    return { run: next, value: { run: next, profile } };
  });
}

export function finishCampaignPack(scope: string, expected: Pick<CampaignRun, 'id' | 'revision'>) {
  return updateCampaign(scope, (run, profile) => {
    const reward = run && pendingCampaignPack(run);
    if (!run || run.id !== expected.id || run.revision !== expected.revision || !reward || reward.offers.length
      || (run.revealed ?? 0) < reward.cards.length) throw new Error('Open every card in the saved pack first.');
    const phase = run.phase === 'retryReward' ? 'preparing' as const : 'claimingFinish' as const;
    const next = { ...run, revision: run.revision + 1, phase, revealed: 0, aftermath: undefined };
    return { run: next, value: { run: next, profile } };
  });
}

export function acknowledgeCampaignAct(scope: string, expected: number) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || run.phase !== 'upgrading' || ![3, 6].includes(run.encounter))
      throw new Error('The campaign changed in another tab. Reload the campaign.');
    const next = { ...run, revision: run.revision + 1, briefedAct: Math.floor(run.encounter / 3) };
    return { run: next, value: { run: next, profile } };
  });
}

export function saveCampaignDeck(scope: string, expected: number, deck: Deck) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || !['preparing', 'upgrading'].includes(run.phase)) throw new Error('The deck changed in another tab. Reload the campaign.');
    // A temporary short deck is fine while editing. Every selected copy must still be earned.
    const used: Record<string, number> = { ...deck.cards };
    for (const slug of deck.legends) used[slug] = (used[slug] ?? 0) + 1;
    if (Object.entries(used).some(([slug, qty]) => qty > (run.inventory[slug] ?? 0))) throw new Error('Your deck contains cards outside this campaign.');
    if (Object.keys(deck.sideboard).some(slug => deck.sideboard[slug] > 0)) throw new Error('Campaign sideboards are not available.');
    if (deck.legends.length !== 3 || new Set(deck.legends.map(slug => BY_SLUG.get(slug)?.name)).size !== 3)
      throw new Error('Choose three different Legends.');
    const base = run.lastLegal.legends.map(slug => BY_SLUG.get(slug)?.color).sort().join();
    if (deck.legends.map(slug => BY_SLUG.get(slug)?.color).sort().join() !== base) throw new Error('Keep the starter crew colours.');
    const next = { ...run, revision: run.revision + 1, deck: structuredClone(deck),
      lastLegal: campaignDeckIssues(run, deck).length ? run.lastLegal : structuredClone(deck) };
    return { run: next, value: { run: next, profile, issues: campaignDeckIssues(next, deck) } };
  });
}

export function claimEnvironment(scope: string, expected: number, environment: Environment) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || run.phase !== 'claimingFinish' || !ENVIRONMENTS.some(item => item.id === environment)
      || (profile.environments.includes(environment) && profile.environments.length < ENVIRONMENTS.length)) throw new Error('This reward changed. Reload the campaign.');
    const next = { ...run, revision: run.revision + 1, phase: 'completed' as const };
    const earned = { ...profile, environments: profile.environments.includes(environment) ? profile.environments : [...profile.environments, environment], equipped: environment };
    return { run: next, profile: earned, value: { run: next, profile: earned } };
  });
}

export function equipEnvironment(scope: string, environment: Environment) {
  return updateCampaign(scope, (run, profile) => {
    if (!profile.environments.includes(environment)) throw new Error('Earn this environment first.');
    const next = { ...profile, equipped: environment };
    return { profile: next, value: { run, profile: next } };
  });
}

export function campaignStatus(run?: CampaignRun) {
  if (!run) return 'Choose your starter';
  if (run.phase === 'completed') return 'Campaign completed';
  if (run.phase === 'claimingFinish') return 'Choose your new environment';
  if (run.resultPending) return 'Return to match result';
  if (pendingCampaignPack(run)) return run.aftermath && !run.aftermath.sceneSeen ? 'Continue your story' : 'Open your earned pack';
  if (run.phase === 'inMatch') return 'Return to match';
  return `${ENCOUNTERS[run.encounter]?.title ?? 'Next contract'} · ${run.encounter + 1} / ${ENCOUNTERS.length}`;
}
