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
  } finally { vi.unstubAllGlobals(); }
}, 30000);
