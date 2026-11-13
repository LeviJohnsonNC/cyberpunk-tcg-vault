import type { MatchReport, PlayerView, Seat } from './protocol';

const reasons: Record<string, string> = {
  gig_victory: 'Gig control',
  overtime_majority: 'Overtime majority',
  deck_out_victory: 'Deck-out',
  concede: 'Concession',
  concession: 'Concession',
};

export function campaignResult(view: Pick<PlayerView, 'winnerId' | 'winReason' | 'overtimeActive'>) {
  const { winnerId, winReason, overtimeActive } = view;
  const outcome = winnerId === 'player' ? 'win' : winnerId === 'rival' ? 'loss' : 'draw';
  const title = outcome === 'win' ? 'You win' : outcome === 'loss' ? 'You lose' : 'Draw';
  const reason = winReason && reasons[winReason];
  const description = !winnerId
    ? overtimeActive || winReason === 'overtime_majority' ? 'Overtime ended level' : 'Match ended in a draw'
    : winReason === 'gig_victory' ? `Gig control ${outcome === 'win' ? 'victory' : 'defeat'}` : reason || 'Match ended';
  return { outcome, title, description, showThreshold: winReason === 'gig_victory' };
}

const seats: Seat[] = ['player', 'rival'];

/** A step chart using recorded turn numbers, including older reports with sparse history. */
export function campaignGigChart(gigs: MatchReport['gigs'], showThreshold: boolean) {
  if (!gigs.length) return;
  const first = gigs[0].turn;
  const last = gigs[gigs.length - 1];
  const peak = Math.max(showThreshold ? 7 : 1, ...gigs.flatMap(point => [point.player, point.rival]));
  const step = peak > 12 ? Math.ceil(peak / 6) : peak > 6 ? 2 : 1;
  const top = Math.ceil(peak / step) * step;
  const levels = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const range = Math.max(1, last.turn - first);
  const intervals = Math.min(5, range);
  const turns = [...new Set(Array.from({ length: intervals + 1 }, (_, i) =>
    Math.min(last.turn, first + Math.round(i * range / intervals))))];
  return { last, levels, turns,
    lines: (x: (turn: number) => number, y: (value: number) => number) => seats.map(seat => ({
      seat,
      path: gigs.map((point, index) => index ? `H${x(point.turn)}V${y(point[seat])}` : `M${x(point.turn)} ${y(point[seat])}`).join(' '),
    })),
    top, first, range };
}
