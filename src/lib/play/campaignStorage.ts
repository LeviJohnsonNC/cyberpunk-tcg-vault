import type { Deck } from '../store';
import { BY_SLUG } from '../data';
import { openDatabase } from './matchStorage';
import { emptyCircuit, type CircuitProgress, type TableFinish } from './circuit';
import { CAMPAIGN_VERSION, ENCOUNTERS, ENVIRONMENTS, campaignDeckIssues, emptyProfile, newCampaign,
  type CampaignProfile, type CampaignRun, type Environment } from './campaign';
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

export function startCampaign(scope: string, starter: StarterKey, replace = false) {
  return updateCampaign(scope, (old, profile) => {
    if (old?.phase === 'claimingFinish') throw new Error('Choose your earned room before starting another campaign.');
    if (old && old.phase !== 'completed' && !replace) throw new Error('Finish or abandon your current campaign first.');
    const run = newCampaign(starter, crypto.randomUUID(), crypto.randomUUID());
    const nextProfile = old ? { ...profile, history: [...(profile.history ?? []), {
      id: old.id, starter: old.starter, cleared: old.phase === 'completed' ? ENCOUNTERS.length : old.encounter,
      completed: old.phase === 'completed', endedAt: old.completedAt ?? Date.now(), deck: structuredClone(old.deck),
    }] } : profile;
    return { run, profile: nextProfile, value: { run, profile: nextProfile } };
  });
}

export function chooseReward(scope: string, expected: number, slug: string) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || run.phase !== 'rewardPending') throw new Error('The pack changed in another tab. Reload the campaign.');
    const reward = run.rewards[run.encounter];
    if (!reward || !reward.offers.includes(slug) || reward.choice) throw new Error('Choose an available card from this pack.');
    if ((run.inventory[slug] ?? 0) >= (BY_SLUG.get(slug)?.type === 'Legend' ? 1 : 3)) throw new Error('You already have the maximum copies.');
    const next = { ...run, revision: run.revision + 1, encounter: run.encounter + 1, attempts: 0, revealed: 0, phase: 'upgrading' as const,
      inventory: { ...run.inventory, [slug]: (run.inventory[slug] ?? 0) + 1 },
      rewards: { ...run.rewards, [run.encounter]: { ...reward, choice: slug } } };
    return { run: next, value: { run: next, profile } };
  });
}

export function revealCampaignPack(scope: string, expected: number, count: number) {
  return updateCampaign(scope, (run, profile) => {
    if (!run || run.revision !== expected || run.phase !== 'rewardPending' || !Number.isInteger(count) || count < (run.revealed ?? 0) || count > 7)
      throw new Error('The pack changed in another tab. Reload the campaign.');
    const next = { ...run, revision: run.revision + 1, revealed: count };
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
  if (run.phase === 'rewardPending') return 'Open your earned pack';
  if (run.phase === 'inMatch') return 'Return to match';
  return `${ENCOUNTERS[run.encounter]?.title ?? 'Next contract'} · ${run.encounter + 1} / ${ENCOUNTERS.length}`;
}
