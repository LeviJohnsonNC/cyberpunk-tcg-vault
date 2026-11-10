import { createEngineSession, type EngineCheckpoint } from './engineSession';
import type { MatchRequest, MatchResponse, MatchSetup, MatchSnapshot, MatchSummary } from './protocol';

export interface StoredMatch {
  version: 1;
  setup: MatchSetup;
  checkpoint: EngineCheckpoint;
  summary: MatchSummary;
}

export function createMatchController(saved?: StoredMatch) {
  let setup = saved?.setup;
  let draft = saved?.summary.draft;
  let match = saved && createEngineSession(saved.setup, undefined, saved.checkpoint);

  function respond({ id, action }: MatchRequest): MatchResponse {
    try {
      if (action.type === 'start') {
        const nextSetup = structuredClone(action.setup);
        const nextMatch = createEngineSession(nextSetup);
        setup = nextSetup;
        draft = action.draft;
        match = nextMatch;
        return { id, snapshot: nextMatch.start() };
      }
      if (action.type === 'resume') {
        if (!match) throw new Error('There is no saved match for this Vault.');
        return { id, snapshot: match.start() };
      }
      if (!match || !setup || action.matchId !== match.matchId) throw new Error('That match is no longer active.');
      if (!match.isCurrent(action.stateID)) throw new Error('This match changed in another tab. Reload to continue from the saved turn.');
      if (action.type === 'rematch') {
        match = createEngineSession(setup);
        return { id, snapshot: match.start() };
      }
      return { id, snapshot: match.move(action.stateID, action.move) };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : 'Play Mode could not process that action.' };
    }
  }

  function save(snapshot: MatchSnapshot): StoredMatch {
    if (!setup || !match) throw new Error('There is no match to save.');
    return {
      version: 1, setup, checkpoint: match.checkpoint(),
      summary: { matchId: snapshot.matchId, ended: snapshot.view.gameEnded, draft },
    };
  }

  return { respond, save };
}
