import { updateCampaign } from './campaignStorage';
import { ENCOUNTERS, campaignDeckIssues, encounterDeck, encounterRivalPlan, encounterSkill, prepareCampaignReward, settleCampaignMatch } from './campaign';
import { prepareMatchDeck } from './matchDeck';
import { createMatchController } from './workerController';
import type { MatchSnapshot, Move } from './protocol';

type Command = { id: number; scope: string; action: { type: 'start'; revision: number } | { type: 'resume' } |
  { type: 'move'; matchId: string; stateID: number; move: Move } };

self.addEventListener('message', async ({ data }: MessageEvent<Command>) => {
  const { id, scope, action } = data;
  try {
    const value = await updateCampaign(scope, (run, profile) => {
      if (!run) throw new Error('Choose a starter first.');
      if (action.type === 'start') {
        if (run.revision !== action.revision || run.resultPending || !['preparing', 'upgrading'].includes(run.phase)) throw new Error('The campaign changed in another tab. Reload to continue.');
        const issues = campaignDeckIssues(run, run.deck);
        if (issues.length) throw new Error(issues.join(' '));
        const rival = encounterDeck(run), rivalDeck = prepareMatchDeck(rival), player = prepareMatchDeck(run.deck);
        const reward = run.encounter < ENCOUNTERS.length - 1 ? prepareCampaignReward(run) : undefined;
        const controller = createMatchController();
        const response = controller.respond({ id, action: { type: 'start', setup: { player, rival: rivalDeck, rivalSkill: encounterSkill(run), campaignRivalPlan: encounterRivalPlan(run) } } });
        if (!('snapshot' in response)) throw new Error(response.error);
        const next = { ...run, deckUndo: undefined, phase: 'inMatch' as const, revision: run.revision + 1,
          rewards: reward ? { ...run.rewards, [run.encounter]: reward } : run.rewards,
          match: controller.save(response.snapshot) };
        return { run: next, value: { run: next, profile, snapshot: response.snapshot } };
      }
      if (!run.match) throw new Error('No campaign match has been saved.');
      const controller = createMatchController(run.match);
      if (action.type === 'resume') {
        const response = controller.respond({ id, action });
        if (!('snapshot' in response)) throw new Error(response.error);
        return { value: { run, profile, snapshot: response.snapshot } };
      }
      if (run.phase !== 'inMatch') throw new Error('This encounter has ended. Return to your campaign.');
      const response = controller.respond({ id, action: { type: 'move', matchId: action.matchId, stateID: action.stateID, move: action.move } });
      if (!('snapshot' in response)) throw new Error(response.error);
      const match = controller.save(response.snapshot);
      const result = response.snapshot.view.gameEnded
        ? settleCampaignMatch(run, profile, match, response.snapshot.view.winnerId,
          action.move.move === 'concede' || /conced|concess/i.test(response.snapshot.view.winReason ?? ''))
        : { run: { ...run, match }, profile };
      return { run: result.run, profile: result.profile,
        value: { run: result.run, profile: result.profile, snapshot: response.snapshot } };
    });
    self.postMessage({ id, ...value });
  } catch (cause) { self.postMessage({ id, error: cause instanceof Error ? cause.message : 'The campaign could not save this move.' }); }
});

export interface CampaignWorkerResponse { id: number; run?: import('./campaign').CampaignRun; profile?: import('./campaign').CampaignProfile; snapshot?: MatchSnapshot; error?: string }
