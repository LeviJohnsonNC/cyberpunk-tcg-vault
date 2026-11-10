import { createEngineSession } from './engineSession';
import type { MatchRequest, MatchResponse, MatchSetup } from './protocol';

export function createMatchController() {
  let setup: MatchSetup | undefined;
  let match: ReturnType<typeof createEngineSession> | undefined;

  return ({ id, action }: MatchRequest): MatchResponse => {
    try {
      if (action.type === 'start') {
        const nextSetup = structuredClone(action.setup);
        const nextMatch = createEngineSession(nextSetup);
        setup = nextSetup;
        match = nextMatch;
        return { id, snapshot: nextMatch.start() };
      }
      if (!match || !setup || action.matchId !== match.matchId) throw new Error('That match is no longer active.');
      if (action.type === 'rematch') {
        match = createEngineSession(setup);
        return { id, snapshot: match.start() };
      }
      return { id, snapshot: match.move(action.stateID, action.move) };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : 'Play Mode could not process that action.' };
    }
  };
}
