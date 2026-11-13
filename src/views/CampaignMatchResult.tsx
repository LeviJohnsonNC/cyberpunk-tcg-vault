import { useEffect, useId, useRef, useState } from 'react';
import type { EncounterId } from '../lib/play/campaign';
import { campaignResult, campaignGigChart } from '../lib/play/campaignResult';
import { campaignChapters } from '../lib/play/campaignStory';
import { advanceRivalDialogue, rivalResult } from '../lib/play/rivalDialogue';
import type { CardView, MatchReport, MatchSnapshot } from '../lib/play/protocol';
import { vaultCard } from '../lib/play/cardDisplay';
import { CardFace, CardInspection } from './PlayCard';
import { CampaignRivalPortrait } from './CampaignStory';
import './campaign-result.css';

const illustrations = import.meta.glob<string>('../assets/play/results/*.webp', { eager: true, import: 'default', query: '?url' });

export interface CampaignResultDetails {
  encounter: EncounterId;
  title: string;
  dialogue: boolean;
  continueLabel: string;
  next?: string;
  reload?: () => void;
}

function Score({ snapshot }: { snapshot: MatchSnapshot }) {
  return <dl className="campaign-result-score">
    <div><dt>Your Gigs</dt><dd>{snapshot.view.players.player.gigCount}</dd></div>
    <div><dt>Rival Gigs</dt><dd>{snapshot.view.players.rival.gigCount}</dd></div>
    <div><dt>Turns</dt><dd>{snapshot.report?.turns ?? snapshot.view.turnNumber}</dd></div>
  </dl>;
}

function GigChart({ report, showThreshold }: { report: MatchReport; showThreshold: boolean }) {
  const chart = campaignGigChart(report.gigs, showThreshold);
  if (!chart) return <p>No Gig history was recorded for this match.</p>;
  const { first, last, top, range } = chart;
  const x = (turn: number) => 37 + 525 * (turn - first) / range;
  const y = (value: number) => 163 - 143 * value / top;
  return <figure className="campaign-report-chart">
    <figcaption className="campaign-report-key">
      <span data-seat="player">You <strong>{last.player}</strong></span>
      <span data-seat="rival">Rival <strong>{last.rival}</strong></span>
      {showThreshold && <span data-threshold>7-Gig target</span>}
    </figcaption>
    <svg viewBox="0 0 582 201" role="img" aria-label={`Recorded Gig counts from turn ${first} to ${last.turn}. Final score: you ${last.player}, rival ${last.rival}.`}>
      {chart.levels.map(value => <g key={value}>
        <line x1={37} x2={562} y1={y(value)} y2={y(value)} />
        <text x={24} y={y(value)} dominantBaseline="middle" textAnchor="end">{value}</text>
      </g>)}
      {chart.turns.map(turn => <text key={turn} x={x(turn)} y={185} textAnchor="middle">{turn}</text>)}
      {showThreshold && <line data-threshold x1={37} x2={562} y1={y(7)} y2={y(7)} />}
      {chart.lines(x, y).map(({ seat, path }) => <path key={seat} data-seat={seat} d={path} />)}
      <circle data-seat="player" cx={x(last.turn)} cy={y(last.player)} r={5} />
      <circle data-seat="rival" cx={x(last.turn)} cy={y(last.rival)} r={last.player === last.rival ? 8 : 5} />
    </svg>
    <p className="campaign-report-axis-label">Turn</p>
    <details className="campaign-report-data">
      <summary>Gig counts by turn</summary>
      <table><caption className="sr-only">Recorded Gig counts by turn</caption>
        <thead><tr><th scope="col">Turn</th><th scope="col">Your Gigs</th><th scope="col">Rival Gigs</th></tr></thead>
        <tbody>{report.gigs.map(point => <tr key={point.turn}><th scope="row">{point.turn}</th><td>{point.player}</td><td>{point.rival}</td></tr>)}</tbody>
      </table>
    </details>
  </figure>;
}

export function CampaignMatchResult({ details, snapshot, busy, error, onContinue }: {
  details: CampaignResultDetails; snapshot: MatchSnapshot; busy: boolean; error?: string; onContinue: () => void;
}) {
  const { outcome, title, description, showThreshold } = campaignResult(snapshot.view);
  const { report } = snapshot;
  const { encounter } = details;
  const chapter = campaignChapters[encounter];
  const resultMoment = rivalResult(snapshot.view);
  const farewell = advanceRivalDialogue(undefined, {
    matchId: snapshot.matchId, batch: snapshot.view.stateID, beats: [], result: resultMoment, now: 0,
  }, chapter.lines).line;
  const image = outcome === 'draw' ? undefined : illustrations[`../assets/play/results/${encounter}-${outcome}.webp`];
  const [imageFailed, setImageFailed] = useState(false);
  const [inspected, setInspected] = useState<CardView>();
  const inspectionTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const reportButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const reportId = useId();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, []);

  function openReport() {
    reportDialog.current?.showModal();
    reportDialog.current?.scrollTo(0, 0);
    reportHeading.current?.focus({ preventScroll: true });
  }

  return <section className="campaign-match-result" data-outcome={outcome} aria-labelledby={headingId}>
    <div className="campaign-result-art" aria-hidden="true">
      {image && !imageFailed ? <img src={image} alt="" fetchPriority="high" onError={() => setImageFailed(true)} />
        : <CampaignRivalPortrait encounter={encounter} />}
    </div>
    <div className="campaign-result-copy">
      <p className="campaign-invitation-eyebrow">{details.title} <span aria-hidden="true">//</span> Campaign result</p>
      <h1 id={headingId} ref={heading} tabIndex={-1}>{title}<span aria-hidden="true">.</span></h1>
      <p className="campaign-result-reason">{description}</p>
      <Score snapshot={snapshot} />
      {details.dialogue && farewell && <figure className="campaign-result-quote">
        <figcaption>{chapter.rival}</figcaption><blockquote>“{farewell.text}”</blockquote>
      </figure>}
      <div className="campaign-result-actions">
        <button type="button" className="campaign-invitation-cta" disabled={busy} onClick={onContinue}>
          {details.continueLabel} <span aria-hidden="true">→</span>
        </button>
        {details.next && <p>{details.next}</p>}
        {report && <button ref={reportButton} type="button" className="btn quiet" aria-haspopup="dialog" onClick={openReport}>View match report</button>}
      </div>
      {error && <p className="play-error" role="alert">{error} {details.reload && <button type="button" className="btn quiet" onClick={details.reload}>Reload saved match</button>}</p>}
    </div>
    {report && <dialog ref={reportDialog} className="al-dialog campaign-match-report" aria-labelledby={reportId} onClose={() => reportButton.current?.focus()}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="campaign-report-body">
        <header>
          <div><p className="campaign-invitation-eyebrow">{details.title} <span aria-hidden="true">//</span> {chapter.rival}</p>
            <h2 id={reportId} ref={reportHeading} tabIndex={-1}>Match report</h2>
            <p className="campaign-report-outcome">{title} · {description}</p></div>
          <button type="button" className="btn quiet" onClick={() => reportDialog.current?.close()}>Back to result</button>
        </header>
        <Score snapshot={snapshot} />
        <div className="campaign-report-layout">
          <section className="campaign-report-panel">
            <h3>Gig control</h3>
            <GigChart report={report} showThreshold={showThreshold} />
          </section>
          <div className="campaign-report-sidebar">
            <section className="campaign-report-panel">
              <h3>Match activity</h3>
              <dl className="campaign-report-activity">
                <div><dt>Cards played</dt><dd>{report.played}</dd></div>
                <div><dt>Sold for Eddies</dt><dd>{report.sold}</dd></div>
                <div><dt>Your Units defeated</dt><dd>{report.lost.player}</dd></div>
                <div><dt>Rival Units defeated</dt><dd>{report.lost.rival}</dd></div>
              </dl>
            </section>
            {report.stuck.length > 0 && <section className="campaign-report-panel">
              <h3>Unplayed at match end</h3>
              <ul className="campaign-report-unplayed">{report.stuck.map(({ card, copies, turns }) => <li key={card.definitionId}>
                <button type="button" aria-haspopup="dialog" onClick={event => {
                  inspectionTrigger.current = event.currentTarget;
                  setInspected(card);
                }}><CardFace card={card} /><span><strong>{vaultCard(card)?.name ?? card.cardName ?? 'Card'}{copies > 1 ? ` ×${copies}` : ''}</strong>
                  <small>{copies > 1 ? 'Longest held' : 'Held'} {turns} turns</small></span></button>
              </li>)}</ul>
            </section>}
          </div>
        </div>
      </div>
    </dialog>}
    {inspected && <CardInspection card={inspected} shortcuts={[]} onClose={() => {
      setInspected(undefined);
      inspectionTrigger.current?.focus({ preventScroll: true });
    }} />}
  </section>;
}
