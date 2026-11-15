import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberPlayMode } from '../playNavigation';
import { resetCampaign, startCampaign, updateCampaign } from './campaignStorage';
import { emptyCircuit, type CircuitProgress } from './circuit';
import { openDatabase, resetFreePlay } from './matchStorage';
import { readPlayEntry } from './playEntry';

async function put(store: 'circuits' | 'summaries', scope: string, value: unknown) {
  const db = await openDatabase();
  const transaction = db.transaction(store, 'readwrite');
  transaction.objectStore(store).put(value, scope);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Play entry progress', () => {
  it('ignores visits, default Circuit state and campaign-only table finishes', async () => {
    const scope = 'fresh';
    vi.stubGlobal('localStorage', { getItem: () => 'campaign' });
    await put('circuits', scope, { ...emptyCircuit(), campaignFinishes: ['gold'], finish: 'gold' });
    expect(await readPlayEntry(scope)).toEqual({ mode: undefined, saved: undefined });
  });

  it.each<Partial<CircuitProgress>>([
    { matches: 1 }, { rep: 75 }, { wins: 1 }, { losses: 1 }, { draws: 1 }, { contracts: { 'first-call': ['clear'] } },
  ])('recognises Free Play progress from %j without a saved match', async progress => {
    const scope = Object.keys(progress)[0];
    await put('circuits', scope, { ...emptyCircuit(), ...progress });
    expect((await readPlayEntry(scope)).mode).toBe('free');
  });

  it('recognises Campaign rewards without a current run', async () => {
    const scope = 'completed-campaign';
    await updateCampaign(scope, (_run, profile) => ({
      profile: { ...profile, completions: { ...profile.completions, 'the-heist': 1 } }, value: undefined,
    }));
    expect((await readPlayEntry(scope)).mode).toBe('campaign');
  });

  it('returns the live match, preserves a remembered mode and scopes both to the Vault', async () => {
    const scope = 'both-active';
    await startCampaign(scope, 'the-heist');
    const saved = { matchId: 'live-match', ended: false };
    await put('summaries', scope, saved);
    expect(await readPlayEntry(scope)).toEqual({ mode: 'free', saved });
    const preference = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: preference.get.bind(preference), setItem: preference.set.bind(preference) });
    rememberPlayMode(scope, 'campaign');
    expect(await readPlayEntry(scope)).toEqual({ mode: 'campaign', saved });
    expect(await readPlayEntry('other-vault')).toEqual({ mode: undefined, saved: undefined });
  });

  it.each(['campaign', 'free'] as const)('opens the gateway only after both modes reset, starting with %s', async first => {
    const scope = `reset-${first}`;
    const { run } = await startCampaign(scope, 'the-heist');
    await put('circuits', scope, { ...emptyCircuit(), rep: 75, matches: 1 });
    await expect(resetCampaign(scope, { ...run, revision: run.revision + 1 })).rejects.toThrow('another tab');
    expect((await readPlayEntry(scope)).mode).toBe('campaign');

    const reset = { campaign: () => resetCampaign(scope, run), free: () => resetFreePlay(scope) };
    const other = first === 'campaign' ? 'free' : 'campaign';
    await reset[first]();
    expect((await readPlayEntry(scope)).mode).toBe(other);
    await reset[other]();
    expect((await readPlayEntry(scope)).mode).toBeUndefined();
  });

  it('rejects unreadable progress so the gateway cannot mistake it for a fresh Vault', async () => {
    const scope = 'unreadable';
    await put('circuits', scope, { version: 2 });
    await expect(readPlayEntry(scope)).rejects.toThrow('newer version');
    await put('circuits', scope, emptyCircuit());
    expect((await readPlayEntry(scope)).mode).toBeUndefined();
  });
});
