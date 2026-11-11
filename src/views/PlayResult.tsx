import { vaultCard } from '../lib/play/cardDisplay';
import type { MatchReport, PlayerView } from '../lib/play/protocol';
import { CardFace } from './PlayCard';
import { CIRCUIT_CONTRACTS, type CircuitReceipt } from '../lib/play/circuit';
import { CircuitPayout } from './CircuitHub';

/** Gig counts turn by turn, as two step lines. Each line is named and valued in the legend, never by colour alone. */
function GigTimeline({ gigs }: { gigs: MatchReport['gigs'] }) {
  const width = 320, height = 92, pad = 7;
  const top = Math.max(1, ...gigs.flatMap((point) => [point.player, point.rival]));
  const x = (index: number) => pad + (width - pad * 2) * index / Math.max(1, gigs.length - 1);
  const y = (value: number) => height - pad - (height - pad * 2) * value / top;
  const line = (seat: 'player' | 'rival') => gigs.map((point, index) =>
    index ? `H${x(index).toFixed(1)}V${y(point[seat]).toFixed(1)}` : `M${x(0).toFixed(1)} ${y(point[seat]).toFixed(1)}`).join('');
  const last = gigs.at(-1)!;
  return <figure className="play-result-chart">
    <figcaption>Gigs by turn</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gigs held at the end of each of ${gigs.length} turns. You finished on ${last.player}, the rival on ${last.rival}.`}>
      <path className="play-result-axis" d={`M${pad} ${height - pad}H${width - pad}`} />
      <path data-seat="rival" d={line('rival')} /><path data-seat="player" d={line('player')} />
      <circle data-seat="rival" cx={x(gigs.length - 1)} cy={y(last.rival)} r="3.5" /><circle data-seat="player" cx={x(gigs.length - 1)} cy={y(last.player)} r="3.5" />
    </svg>
    <p><span data-seat="player">You <b>{last.player}</b></span><span data-seat="rival">Rival <b>{last.rival}</b></span><span>Turn 1 to {last.turn}</span></p>
  </figure>;
}

/** The end of the match, on the table: the result, how it went, and what never got played. */
export function MatchResult({ view, report, receipt, circuit, title, reason, busy, rematch, edit }: {
  view: PlayerView; report?: MatchReport; title: string; reason: string; busy: boolean; rematch: () => void; edit: () => void;
  receipt?: CircuitReceipt; circuit?: () => void;
}) {
  const reportBody = report && <div className="play-result-body">
    {report.gigs.length > 1 && <GigTimeline gigs={report.gigs} />}
    <dl className="play-result-facts">
      <div><dt>Cards played</dt><dd>{report.played}</dd></div><div><dt>Sold for Eddies</dt><dd>{report.sold}</dd></div>
      <div><dt>Your Units defeated</dt><dd>{report.lost.player}</dd></div><div><dt>Rival Units defeated</dt><dd>{report.lost.rival}</dd></div>
    </dl>
    {report.stuck.length > 0 && <div className="play-result-stuck"><h3>Sat in your hand</h3><ul>{report.stuck.map(({ card, copies, turns }) => <li key={card.definitionId}><CardFace card={card} /><span><strong>{vaultCard(card)?.name ?? card.cardName ?? 'Card'}{copies > 1 ? ` ×${copies}` : ''}</strong><small>Held {turns} turns</small></span></li>)}</ul><p>Still unplayed when the match ended.</p></div>}
  </div>;
  return <section className="play-result" data-result={view.winnerId ?? 'draw'} data-report={!!report} data-circuit={!!receipt} aria-label="Match report">
    <span className="play-result-burst" aria-hidden="true" />
    <p className="play-eyebrow">Match report{report ? <> <span>/</span> {report.turns} turns</> : null}</p>
    <h2>{title}</h2>
    <p className="play-result-reason">{reason}</p>
    <dl className="play-result-score"><div><dt>Your Gigs</dt><dd>{view.players.player.gigCount}</dd></div><div><dt>Rival Gigs</dt><dd>{view.players.rival.gigCount}</dd></div></dl>
    {receipt && <CircuitPayout receipt={receipt} />}
    {receipt ? <details className="circuit-match-detail"><summary>Inspect match report</summary>{reportBody}</details> : reportBody}
    <div className="play-actions">{circuit && <button type="button" className="btn" disabled={busy} onClick={circuit}>{receipt?.marks.includes('clear') && receipt.contractId !== CIRCUIT_CONTRACTS.at(-1)?.id ? 'Next contract' : 'Back to Circuit'}</button>}<button type="button" className={`btn ${circuit ? 'ghost' : ''}`} disabled={busy} onClick={rematch}>Rematch</button><button type="button" className="btn quiet" disabled={busy} onClick={edit}>Edit draft</button></div>
  </section>;
}
