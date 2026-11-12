import type { RivalMoment } from './campaignStory';
import type { MatchBeat, MatchChange, PlayerView } from './protocol';

export const dialogueCooldown = 4500;

export function rivalReaction(beat: Pick<MatchBeat, 'view' | 'changes' | 'gigRolls'>): RivalMoment | undefined {
  const { view, changes, gigRolls } = beat;
  const gigDelta = (seat: 'player' | 'rival') => changes.reduce(
    (sum, change) => sum + (change.kind === 'gigs' && change.seat === seat ? change.amount ?? 0 : 0), 0,
  );
  const player = gigDelta('player');
  const rival = gigDelta('rival');
  const lead = view.players.player.gigCount - view.players.rival.gigCount;
  const priorLead = lead - player + rival;
  // The first point in a tied game is a Gig, not a swing in the match.
  if (priorLead < 0 && lead > 0 || priorLead <= 0 && lead >= 2) return 'playerLead';
  if (priorLead > 0 && lead < 0 || priorLead >= 0 && lead <= -2) return 'rivalLead';
  const roll = gigRolls.find(item => item.seat === 'rival' && (item.result === 1 || item.result === Number(item.dieType.slice(1))));
  if (roll) return roll.result === 1 ? 'lowRoll' : 'highRoll';
  if (player > 0 || rival < 0) return 'playerGig';
  if (rival > 0 || player < 0) return 'rivalGig';
  const isUnitLost = (change: MatchChange) => change.kind === 'defeated' && change.card?.type?.toLowerCase() === 'unit';
  const defeated = changes.find(isUnitLost);
  if (defeated) return defeated.seat === 'player' ? 'playerUnitLost' : 'rivalUnitLost';
}

export function rivalResult(view: Pick<PlayerView, 'gameEnded' | 'winnerId'>): RivalMoment | undefined {
  if (!view.gameEnded) return;
  return view.winnerId === 'player' ? 'playerWon' : view.winnerId === 'rival' ? 'rivalWon' : 'draw';
}

export interface RivalDialogueState {
  matchId: string;
  batch: number;
  seen: number[];
  opened: boolean;
  result: boolean;
  lastAt: number;
  counts: Partial<Record<RivalMoment, number>>;
  line?: { text: string; moment: RivalMoment; sequence: number };
}

interface DialogueFrame {
  matchId: string;
  batch: number;
  beats: MatchBeat[];
  opening?: 'intro' | 'retry';
  result?: RivalMoment;
  now: number;
}

export function advanceRivalDialogue(
  previous: RivalDialogueState | undefined, frame: DialogueFrame, bank: Record<RivalMoment, readonly string[]>,
): RivalDialogueState {
  const state = previous?.matchId === frame.matchId ? previous : {
    matchId: frame.matchId, batch: frame.batch, seen: [], opened: false, result: false, lastAt: -Infinity, counts: {},
  };
  const seen = state.batch === frame.batch ? state.seen : [];
  const fresh = frame.beats.filter(beat => !seen.includes(beat.id));
  const next = fresh.length || state.batch !== frame.batch
    ? { ...state, batch: frame.batch, seen: [...seen, ...fresh.map(beat => beat.id)] } : state;
  let moment: RivalMoment | undefined;
  if (frame.result && !state.result) moment = frame.result;
  else if (frame.opening && !state.opened && !state.line && !fresh.length) moment = frame.opening;
  else if (!state.result && frame.now - state.lastAt >= dialogueCooldown) {
    moment = fresh.map(rivalReaction).findLast(candidate => candidate !== undefined);
  }
  if (!moment) return next;
  const lines = bank[moment];
  const count = state.counts[moment] ?? 0;
  // Cycle each event's lines from a stable offset so separate attempts can open differently.
  const offset = [...frame.matchId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return {
    ...next, opened: true, result: !!frame.result, lastAt: frame.now,
    counts: { ...state.counts, [moment]: count + 1 },
    line: { moment, text: lines[(offset + count) % lines.length], sequence: (state.line?.sequence ?? 0) + 1 },
  };
}
