import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { equipTableFinish, readCircuitProgress, readMatchSummary, resetFreePlay, updateSavedMatch } from './matchStorage';
import { readCampaign, resetCampaign, startCampaign, updateCampaign } from './campaignStorage';
import { emptyCircuit } from './circuit';
import { emptyProfile, generateReward } from './campaign';
import { createMatchController, type StoredMatch } from './workerController';
import { prepareMatchDeck } from './matchDeck';
import { curatedOpponents } from './opponents';
import type { MatchResponse, MatchSnapshot } from './protocol';

function fixture() {
  const deck = prepareMatchDeck(curatedOpponents.find(item => item.key === 'curated:heist-reloaded')!.deck);
  const controller = createMatchController();
  const response = controller.respond({ id: 1, action: { type: 'start', setup: { player: deck, rival: deck, circuit: { version: 1, rivalKey: 'test', contractId: 'first-call' } } } });
  if (!('snapshot' in response)) throw new Error(response.error);
  const saved = controller.save(response.snapshot);
  const snapshot: MatchSnapshot = { ...response.snapshot, view: { ...response.snapshot.view, gameEnded: true, winnerId: 'player', winReason: 'gig_victory' }, report: { turns: 10, gigs: [], played: 6, sold: 3, lost: { player: 1, rival: 3 }, stuck: [] } };
  saved.summary.ended = true;
  return { saved, snapshot };
}
const response = (snapshot: MatchSnapshot): MatchResponse => ({ id: 2, snapshot: structuredClone(snapshot) });

describe('atomic Circuit storage', () => {
  it('upgrades existing version-one saves without removing their match or awarding retroactive REP', async () => {
    const { saved, snapshot } = fixture(); delete saved.setup.circuit;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('cptv.play-matches', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('matches'); request.result.createObjectStore('summaries'); };
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction(['matches', 'summaries'], 'readwrite');
        transaction.objectStore('matches').put(saved, 'legacy'); transaction.objectStore('summaries').put(saved.summary, 'legacy');
        transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
    expect(await readMatchSummary('legacy')).toEqual(saved.summary);
    await updateSavedMatch('legacy', () => ({ response: response(snapshot) }));
    expect((await readCircuitProgress('legacy')).matches).toBe(0);
  });
  it('commits the checkpoint and reward together, then returns the same receipt on repeated resumes', async () => {
    const { saved, snapshot } = fixture(), scope = 'atomic';
    const first = await updateSavedMatch(scope, () => ({ saved, response: response(snapshot) }));
    expect('snapshot' in first && first.snapshot.circuit?.receipt?.earned).toBe(225);
    const expected = await readCircuitProgress(scope);
    for (let i = 0; i < 3; i++) await updateSavedMatch(scope, previous => { expect(previous?.circuitReceipt?.earned).toBe(225); return { response: response(snapshot) }; });
    expect(await readCircuitProgress(scope)).toEqual(expected);
    expect(await readMatchSummary(scope)).toMatchObject({ matchId: snapshot.matchId, ended: true });
  });
  it('serializes competing tab settlements without double awarding', async () => {
    const { saved, snapshot } = fixture(), scope = 'two-tabs';
    await Promise.all([updateSavedMatch(scope, () => ({ saved, response: response(snapshot) })), updateSavedMatch(scope, () => ({ saved, response: response(snapshot) }))]);
    expect(await readCircuitProgress(scope)).toMatchObject({ matches: 1, rep: 225 });
  });
  it('keeps local, signed-in and sample Vaults separate and refuses locked cosmetics', async () => {
    const { saved, snapshot } = fixture();
    await updateSavedMatch('alice', () => ({ saved, response: response(snapshot) }));
    expect((await readCircuitProgress('bob')).rep).toBe(0);
    expect((await readCircuitProgress('sample')).rep).toBe(0);
    expect((await equipTableFinish('alice', 'ghost')).finish).toBe('ghost');
    await expect(equipTableFinish('bob', 'ghost')).rejects.toThrow('Earn this finish');
  });
  it('does not wipe cosmetics when a match finishes at the same time', async () => {
    const { saved, snapshot } = fixture(), scope = 'equip-race';
    await updateSavedMatch(scope, () => ({ saved, response: response(snapshot) }));
    const second = fixture();
    await Promise.all([equipTableFinish(scope, 'ghost'), updateSavedMatch(scope, () => ({ saved: second.saved, response: response(second.snapshot) }))]);
    expect(await readCircuitProgress(scope)).toMatchObject({ matches: 2, rep: 300, finish: 'ghost' });
  });
  it('rolls back the entire reward when checkpoint storage fails', async () => {
    const { saved, snapshot } = fixture();
    const broken = { ...saved, uncloneable: () => {} } as StoredMatch;
    await expect(updateSavedMatch('failed-write', () => ({ saved: broken, response: response(snapshot) }))).rejects.toThrow();
    expect((await readCircuitProgress('failed-write')).rep).toBe(0);
    expect(await readMatchSummary('failed-write')).toBeUndefined();
  });
  it('rejects a stale action without changing progression or the current match', async () => {
    const { saved, snapshot } = fixture();
    await updateSavedMatch('stale', () => ({ saved, response: response(snapshot) }));
    const before = await readCircuitProgress('stale');
    await updateSavedMatch('stale', () => ({ response: { id: 3, error: 'That match is no longer active.' } }));
    expect(await readCircuitProgress('stale')).toEqual(before);
  });
  it('resets only this Vault’s Free Play data and preserves Campaign rewards', async () => {
    const scope = 'reset-free-play';
    await startCampaign(scope, 'the-heist');
    await updateCampaign(scope, (_run, profile) => ({
      profile: { ...profile, completions: { ...profile.completions, 'the-heist': 1 }, environments: ['booth'], equipped: 'booth' },
      value: undefined,
    }));
    const campaign = await readCampaign(scope);
    const { saved, snapshot } = fixture();
    await updateSavedMatch(scope, () => ({ saved, response: response(snapshot) }));
    await equipTableFinish(scope, 'ghost');
    await updateSavedMatch('other-reset-vault', () => ({ saved, response: response(snapshot) }));

    await resetFreePlay(scope);

    expect(await readMatchSummary(scope)).toBeUndefined();
    await updateSavedMatch(scope, previous => {
      expect(previous).toBeUndefined();
      return { response: { id: 3, error: 'No saved match.' } };
    });
    expect(await readCircuitProgress(scope)).toEqual({ ...emptyCircuit(), campaignFinishes: ['gold'] });
    expect(await readCampaign(scope)).toEqual(campaign);
    expect(await readMatchSummary('other-reset-vault')).toEqual(saved.summary);
    expect((await readCircuitProgress('other-reset-vault')).rep).toBe(225);
  });
  it.each(['gold', 'ghost'] as const)('resets Campaign while preserving Free Play and any independently earned %s finish', async finish => {
    const scope = `reset-campaign-${finish}`;
    const { run } = await startCampaign(scope, 'the-heist');
    const other = await startCampaign(`${scope}-other`, 'embracing-power');
    const { saved, snapshot } = fixture();
    const active = { ...run, revision: 1, phase: 'inMatch' as const, match: saved, rewards: { 0: generateReward(run) } };
    await updateCampaign(scope, (_, profile) => ({ run: active, profile: {
      ...profile, completions: { ...profile.completions, 'the-heist': 1 }, environments: ['booth'], equipped: 'booth',
      history: [{ id: 'prior', starter: 'the-heist', cleared: 9, completed: true, endedAt: 1, deck: run.deck }],
    }, value: undefined }));
    await updateSavedMatch(scope, () => ({ saved, response: response(snapshot) }));
    const progress = await equipTableFinish(scope, finish);

    await expect(resetCampaign(scope, run)).rejects.toThrow('changed in another tab');
    expect((await readCampaign(scope)).run).toEqual(active);
    await resetCampaign(scope, active);

    expect(await readCampaign(scope)).toEqual({ run: undefined, profile: emptyProfile() });
    expect((await readCampaign(`${scope}-other`)).run).toEqual(other.run);
    expect(await readMatchSummary(scope)).toEqual(saved.summary);
    await updateSavedMatch(scope, previous => {
      expect(previous?.summary).toEqual(saved.summary);
      return { response: { id: 3, error: 'Read only' } };
    });
    expect(await readCircuitProgress(scope)).toEqual({ ...progress, campaignFinishes: undefined, finish: finish === 'gold' ? 'afterlife' : 'ghost' });
    const fresh = await startCampaign(scope, 'embracing-power');
    expect(fresh.run).toMatchObject({ starter: 'embracing-power', encounter: 0, rewards: {} });
    expect(fresh.run.id).not.toBe(run.id);
    expect(fresh.profile).toEqual(emptyProfile());
  });
});
