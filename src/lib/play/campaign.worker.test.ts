import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { CARDS, BY_SLUG } from '../data';
import { campaignCardFit, campaignCrew } from './campaignDeckRules';
import { acknowledgeCampaignResult, readCampaign, saveCampaignDeck, startCampaign, updateCampaign } from './campaignStorage';
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
    expect(savedLoss.run?.resultPending).toBe(true);
    expect(savedLoss.snapshot?.report).toEqual(lost.snapshot?.report);
    expect((await command({ type: 'start', revision: lost.run!.revision })).error).toBeTruthy();
    const acknowledged = await acknowledgeCampaignResult(scope, lost.run!, savedLoss.snapshot!.matchId);
    const retry = await command({ type: 'start', revision: acknowledged.run.revision });
    expect(retry.run?.phase).toBe('inMatch');
    expect(retry.run?.rewards[0]).toEqual(opening.run?.rewards[0]);
    expect(retry.snapshot?.matchId).not.toBe(opening.snapshot?.matchId);
    const secondLoss = await command({ type: 'move', matchId: retry.snapshot!.matchId,
      stateID: retry.snapshot!.view.stateID, move: { move: 'concede' } });
    const afterLoss = await acknowledgeCampaignResult(scope, secondLoss.run!, retry.snapshot!.matchId);
    const legends = ['adam-smasher-ender-of-legends', 'dexter-deshawn-off-the-grid', 'johnny-silverhand-rocking-renegade'];
    const crew = campaignCrew(legends);
    const cards = Object.fromEntries(CARDS.filter(card => !campaignCardFit(card, crew)).slice(0, 14)
      .map((card, i) => [card.slug, i === 13 ? 1 : 3]));
    const withReserve = { ...afterLoss.run, inventory: { ...afterLoss.run.inventory, ...cards,
      ...Object.fromEntries(legends.map(slug => [slug, 1])) } };
    await updateCampaign(scope, () => ({ run: withReserve, value: undefined }));
    const revised = await saveCampaignDeck(scope, withReserve, { ...withReserve.deck, legends, cards });
    const rematch = await command({ type: 'start', revision: revised.run.revision });
    expect(rematch.error).toBeUndefined();
    expect(rematch.run?.match?.setup.player.legends).toEqual(legends);
    expect(rematch.run?.rewards[0]).toMatchObject({
      cards: opening.run?.rewards[0].cards, printingIds: opening.run?.rewards[0].printingIds,
    });
    expect(rematch.run?.rewards[0].offers.map(slug => BY_SLUG.get(slug)?.color)).toEqual(['Red', 'Red', 'Red']);

    const staleMove = await command({ type: 'move', matchId: opening.snapshot!.matchId,
      stateID: opening.snapshot!.view.stateID, move: { move: 'concede' } });
    expect(staleMove.error).toBeTruthy();
    expect((await readCampaign(scope)).run?.match?.summary.matchId).toBe(rematch.snapshot?.matchId);
  } finally { vi.unstubAllGlobals(); }
}, 30000);
