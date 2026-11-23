import { readCampaign } from './campaignStorage';
import { readSavedMatch } from './matchStorage';
import { planTurn } from './coachPlanner';
import type { CoachRequest } from './coachTypes';

self.onmessage = async ({ data }: MessageEvent<CoachRequest>) => {
  try {
    const source = data.source;
    const position =
      'fixture' in source
        ? source.fixture
        : source.mode === 'campaign'
          ? (await readCampaign(source.scope)).run?.match
          : await readSavedMatch(source.scope);
    if (
      !position ||
      position.checkpoint.matchId !== data.matchId ||
      position.checkpoint.state.ctx.stateID !== data.stateID
    )
      throw new Error('The saved table has changed. Return to the current decision and ask again.');
    self.postMessage({ plan: planTurn(position) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'The coach could not read this position.',
    });
  }
};
