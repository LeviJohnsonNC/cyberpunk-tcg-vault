import type { EngineCheckpoint } from './engineSession';
import type { MatchSetup } from './protocol';

export interface CoachStep {
  title: string;
  why: string;
}
export interface CoachPlan {
  steps: CoachStep[];
  focus: { move: string; cards: string[] };
  /** Number of recommended actions both lines take before they diverge. */
  alternative?: CoachStep & { afterStep?: number };
  continuation: string[];
  facts: string[];
  forced: boolean;
}
export interface CoachLesson {
  explanation: string;
  watchFor: string;
}
export type CoachPosition = { setup: MatchSetup; checkpoint: EngineCheckpoint };
export type CoachSource = { scope: string; mode: 'campaign' | 'practice' } | { fixture: CoachPosition };
export interface CoachRequest {
  matchId: string;
  stateID: number;
  source: CoachSource;
}
