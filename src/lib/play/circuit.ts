import type { MatchSetup, MatchSnapshot, RivalSkill } from './protocol';

export type CircuitMark = 'clear' | 'bonus' | 'masterful';
export type TableFinish = 'afterlife' | 'ghost' | 'netrunner' | 'gold' | 'chrome';
export interface CircuitContract {
  id: string; title: string; act: string; location: string; rival: string; skill: RivalSkill;
  hook: string; briefing: string; bonus: string; objective: 'played' | 'defeated' | 'sold' | 'turns' | 'losses' | 'cred'; threshold: number;
}
export const CIRCUIT_CONTRACTS: CircuitContract[] = [
  { id: 'first-call', title: 'First call', act: '01 / Get noticed', location: 'Watson', rival: 'heist-reloaded', skill: 'standard',
    hook: 'A seat at the table. Nothing more.', briefing: 'The Heist crew is your way in. Build your board, put your Eddies to work, and give the room a reason to remember you.', bonus: 'Win after playing at least 6 cards.', objective: 'played', threshold: 6 },
  { id: 'chrome-debt', title: 'Chrome debt', act: '01 / Get noticed', location: 'Kabuki', rival: 'chrome-syndicate', skill: 'standard',
    hook: 'They brought chrome. Bring an answer.', briefing: 'Chrome Syndicate turns small threats into serious problems. Pick your fights before the upgrades take over.', bonus: 'Win after defeating at least 3 rival Units.', objective: 'defeated', threshold: 3 },
  { id: 'dead-air', title: 'Dead air', act: '02 / Make a name', location: 'Westbrook', rival: 'lowball-netrun-plus', skill: 'sharp',
    hook: 'Break the signal. Keep the payday.', briefing: 'Lowball Netrun+ wants to play on its terms. Build an economy that can keep up with the noise.', bonus: 'Win after selling at least 4 cards for Eddies.', objective: 'sold', threshold: 4 },
  { id: 'night-drive', title: 'Night drive', act: '02 / Make a name', location: 'The Badlands', rival: 'nomad-convoy', skill: 'sharp',
    hook: 'No brakes. No easy way home.', briefing: 'The Convoy keeps moving. Take control of the Gigs before the road belongs to someone else.', bonus: 'Win by turn 16.', objective: 'turns', threshold: 16 },
  { id: 'red-line', title: 'Red line', act: '03 / Own the room', location: 'City Center', rival: 'smasher-surge', skill: 'sharp',
    hook: 'Survive the headline act.', briefing: 'Smasher Surge puts real pressure on the table. Make every trade count and keep your crew standing.', bonus: 'Win with no more than 2 of your Units defeated.', objective: 'losses', threshold: 2 },
  { id: 'last-call', title: 'Last call', act: '03 / Own the room', location: 'The Afterlife', rival: 'arasaka-nines', skill: 'masterful',
    hook: 'The best seat is earned.', briefing: 'Arasaka 9s. Masterful tactics. One final contract. Close it out and the gold finish is yours.', bonus: 'Win with at least 40 Street Cred.', objective: 'cred', threshold: 40 },
];
export const CIRCUIT_RANKS = [
  { name: 'Unlisted', rep: 0, line: 'Every name starts somewhere.' },
  { name: 'Runner', rep: 150, line: 'Your calls are getting answered.' },
  { name: 'Operator', rep: 400, line: 'The room knows your work.' },
  { name: 'Fixer', rep: 800, line: 'You choose the jobs now.' },
  { name: 'Headliner', rep: 1400, line: 'People came to see this.' },
  { name: 'Afterlife Legend', rep: 2400, line: 'There is always a seat for you.' },
];
export const TABLE_FINISHES: { id: TableFinish; name: string; note: string; requirement: string }[] = [
  { id: 'afterlife', name: 'Afterlife', note: 'Plum leather. Pink neon. Home.', requirement: 'Yours from the start' },
  { id: 'ghost', name: 'Ghost signal', note: 'Mint light on dark glass.', requirement: 'Reach Runner · 150 REP' },
  { id: 'netrunner', name: 'Deep net', note: 'Electric blue. Cold precision.', requirement: 'Reach Operator · 400 REP' },
  { id: 'gold', name: 'House gold', note: 'The finish reserved for closers.', requirement: 'Clear all 6 contracts' },
  { id: 'chrome', name: 'Black chrome', note: 'Violet light. Nothing left to prove.', requirement: 'Earn all 18 contract marks' },
];
export interface CircuitReceipt {
  matchId: string; earned: number; baseRep: number; contractRep: number; markRep: number;
  repBefore: number; repAfter: number; rankBefore: number; rankAfter: number;
  contractId?: string; marks: CircuitMark[]; unlocks: TableFinish[];
}
export interface CircuitResult {
  matchId: string; finishedAt: number; player: string; rival: string; skill: RivalSkill;
  outcome: 'win' | 'loss' | 'draw'; conceded: boolean; turns: number; gigs: number; rivalGigs: number;
  receipt: CircuitReceipt;
}
export interface CircuitProgress {
  version: 1; rep: number; matches: number; wins: number; losses: number; draws: number; streak: number; bestStreak: number;
  contracts: Record<string, CircuitMark[]>; history: CircuitResult[]; finish: TableFinish; campaignFinishes?: TableFinish[];
}
export const emptyCircuit = (): CircuitProgress => ({ version: 1, rep: 0, matches: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, contracts: {}, history: [], finish: 'afterlife' });
export const skillLevel = (skill: RivalSkill) => ['standard', 'sharp', 'masterful'].indexOf(skill);
export const rankIndex = (rep: number) => CIRCUIT_RANKS.findLastIndex(rank => rep >= rank.rep);
export const contractCleared = (progress: CircuitProgress, id: string) => progress.contracts[id]?.includes('clear') ?? false;
export const contractUnlocked = (progress: CircuitProgress, id: string) => {
  const index = CIRCUIT_CONTRACTS.findIndex(contract => contract.id === id);
  return index >= 0 && (index === 0 || contractCleared(progress, CIRCUIT_CONTRACTS[index - 1].id));
};
export function circuitMarks(progress: CircuitProgress) { return CIRCUIT_CONTRACTS.reduce((sum, contract) => sum + (progress.contracts[contract.id]?.length ?? 0), 0); }
export function finishUnlocked(progress: CircuitProgress, finish: TableFinish) {
  return finish === 'afterlife' || !!progress.campaignFinishes?.includes(finish) || (finish === 'ghost' && progress.rep >= 150) || (finish === 'netrunner' && progress.rep >= 400)
    || (finish === 'gold' && CIRCUIT_CONTRACTS.every(contract => contractCleared(progress, contract.id))) || (finish === 'chrome' && circuitMarks(progress) === 18);
}
export function bonusProgress(contract: CircuitContract, snapshot: MatchSnapshot) {
  const report = snapshot.report;
  switch (contract.objective) {
    case 'played': return report?.played ?? 0;
    case 'sold': return report?.sold ?? 0;
    case 'defeated': return report?.lost.rival ?? 0;
    case 'losses': return report?.lost.player ?? Infinity;
    case 'turns': return snapshot.view.turnNumber;
    case 'cred': return snapshot.view.players.player.streetCred;
  }
}

/** Only a terminal, tracked match can settle. Called inside the same transaction as its checkpoint. */
export function settleCircuit(progress: CircuitProgress, snapshot: MatchSnapshot, setup: MatchSetup, now = Date.now()) {
  if (!snapshot.view.gameEnded || !setup.circuit) return;
  const existing = progress.history.find(result => result.matchId === snapshot.matchId);
  if (existing) return { progress, receipt: existing.receipt };
  const won = snapshot.view.winnerId === 'player';
  const conceded = /conced|concess/i.test(snapshot.view.winReason ?? '');
  const skill = setup.rivalSkill ?? 'standard';
  const outcome = won ? 'win' : snapshot.view.winnerId === 'rival' ? 'loss' : 'draw';
  // Conceding is always allowed, but never a reputation shortcut.
  const baseRep = conceded ? 0 : won ? [75, 100, 125][skillLevel(skill)] : 25;
  const contract = CIRCUIT_CONTRACTS.find(item => item.id === setup.circuit?.contractId);
  const prior = contract ? progress.contracts[contract.id] ?? [] : [];
  const marks: CircuitMark[] = [];
  if (won && !conceded && contract && contractUnlocked(progress, contract.id) && skillLevel(skill) >= skillLevel(contract.skill)) {
    if (!prior.includes('clear')) marks.push('clear');
    const actual = bonusProgress(contract, snapshot);
    if (!prior.includes('bonus') && (['losses', 'turns'].includes(contract.objective) ? actual <= contract.threshold : actual >= contract.threshold)) marks.push('bonus');
    if (skill === 'masterful' && !prior.includes('masterful')) marks.push('masterful');
  }
  const contractRep = marks.includes('clear') ? 100 : 0;
  const markRep = (marks.includes('bonus') ? 50 : 0) + (marks.includes('masterful') ? 75 : 0);
  const earned = baseRep + contractRep + markRep;
  const next: CircuitProgress = { ...progress, rep: progress.rep + earned, matches: progress.matches + 1,
    wins: progress.wins + Number(won), losses: progress.losses + Number(outcome === 'loss'), draws: progress.draws + Number(outcome === 'draw'),
    streak: won ? progress.streak + 1 : 0, bestStreak: Math.max(progress.bestStreak, won ? progress.streak + 1 : 0),
    contracts: { ...progress.contracts, ...(contract && marks.length ? { [contract.id]: [...prior, ...marks] } : {}) },
  };
  const receipt: CircuitReceipt = { matchId: snapshot.matchId, earned, baseRep, contractRep, markRep,
    repBefore: progress.rep, repAfter: next.rep, rankBefore: rankIndex(progress.rep), rankAfter: rankIndex(next.rep),
    contractId: contract?.id, marks, unlocks: TABLE_FINISHES.filter(finish => !finishUnlocked(progress, finish.id) && finishUnlocked(next, finish.id)).map(finish => finish.id),
  };
  const result: CircuitResult = { matchId: snapshot.matchId, finishedAt: now, player: snapshot.names.player, rival: snapshot.names.rival, skill, outcome, conceded,
    turns: snapshot.report?.turns ?? snapshot.view.turnNumber, gigs: snapshot.view.players.player.gigCount, rivalGigs: snapshot.view.players.rival.gigCount, receipt };
  next.history = [result, ...progress.history].slice(0, 50);
  return { progress: next, receipt };
}
