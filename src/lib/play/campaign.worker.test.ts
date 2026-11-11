import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { readCampaign, startCampaign } from './campaignStorage';
import type { CampaignWorkerResponse } from './campaign.worker';

it('restores the exact campaign engine checkpoint without replacing a finished start', async () => {
  let receive: ((event: { data: unknown }) => void) | undefined;
  let respond: ((value: CampaignWorkerResponse) => void) | undefined;
  vi.stubGlobal('self', {
    addEventListener: (_: string, listener: typeof receive) => { receive = listener; },
    postMessage: (value: CampaignWorkerResponse) => respond?.(value),
  });
  try {
    await import('./campaign.worker');
    const scope = 'campaign-worker-resume';
    const started = await startCampaign(scope, 'the-heist');
    const command = (action: object) => new Promise<CampaignWorkerResponse>(resolve => {
      respond = resolve;
      receive?.({ data: { id: 1, scope, action } });
    });
    const opening = await command({ type: 'start', revision: started.run.revision });
    expect(opening.error).toBeUndefined();
    expect(opening.run?.phase).toBe('inMatch');
    expect((await readCampaign(scope)).run?.match?.summary.matchId).toBe(opening.snapshot?.matchId);
    const resumed = await command({ type: 'resume' });
    expect(resumed.snapshot?.matchId).toBe(opening.snapshot?.matchId);
    expect(resumed.snapshot?.view.stateID).toBe(opening.snapshot?.view.stateID);
    expect((await command({ type: 'start', revision: started.run.revision })).error).toContain('changed in another tab');
    const lost = await command({ type: 'move', matchId: opening.snapshot!.matchId,
      stateID: opening.snapshot!.view.stateID, move: { move: 'concede' } });
    expect(lost.error).toBeUndefined();
    expect(lost.run?.phase).toBe('preparing');
    expect(lost.run?.encounter).toBe(0);
    expect(lost.run?.inventory).toEqual(started.run.inventory);
    expect(lost.run?.rewards[0]).toEqual(opening.run?.rewards[0]);
    const savedLoss = await command({ type: 'resume' });
    expect(savedLoss.snapshot?.view.gameEnded).toBe(true);
    expect(savedLoss.snapshot?.matchId).toBe(opening.snapshot?.matchId);
    const retry = await command({ type: 'start', revision: lost.run!.revision });
    expect(retry.run?.phase).toBe('inMatch');
    expect(retry.run?.rewards[0]).toEqual(opening.run?.rewards[0]);
    expect(retry.snapshot?.matchId).not.toBe(opening.snapshot?.matchId);
    const staleMove = await command({ type: 'move', matchId: opening.snapshot!.matchId,
      stateID: opening.snapshot!.view.stateID, move: { move: 'concede' } });
    expect(staleMove.error).toBeTruthy();
    expect((await readCampaign(scope)).run?.match?.summary.matchId).toBe(retry.snapshot?.matchId);
  } finally { vi.unstubAllGlobals(); }
}, 30000);
