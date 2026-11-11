import type { MatchBeat } from '../lib/play/protocol';
import { CardFace } from './PlayCard';

export interface MatchPlayback { beat: MatchBeat; index: number; count: number; skip: () => void }
export function PlayPresentation({ playback, feedback }: { playback?: MatchPlayback; feedback?: MatchBeat }) {
  const beat = playback?.beat ?? feedback;
  if (!beat) return null;
  return <section className="play-move-receipt" data-beat-id={beat.id} aria-label={playback ? 'Move playback' : 'Move result'} key={beat.id}>
    <div className="play-move-receipt-head"><span className="play-eyebrow">{playback ? `Move ${playback.index + 1} / ${playback.count}` : 'Result'}</span>
      {playback && <button type="button" className="btn quiet" onClick={playback.skip}>Skip moves</button>}</div>
    {playback && beat.source?.definitionId && <span className="play-receipt-art"><CardFace card={beat.source} /></span>}
    {playback && beat.gigRolls.length > 0 && <p className="play-roll-wait">{beat.seat === 'player' ? 'You' : 'Rival'} · Rolling {beat.gigRolls.map(({ dieType }) => dieType).join(', ')}</p>}
    <p className="play-roll-outcome" role="status"><b>{beat.seat === 'player' ? 'You' : 'Rival'}</b> {beat.text}</p>
    {beat.changes.length > 0 && <ul className="play-roll-outcome">{beat.changes.slice(0, 8).map((change, index) => <li key={index} data-change={change.kind}>
      <span>{change.card?.cardName ?? (change.seat === 'player' ? 'You' : 'Rival')}</span> <strong>{change.label}</strong>
    </li>)}{beat.changes.length > 8 && <li>+{beat.changes.length - 8} more changes on the mat</li>}</ul>}
    {playback && <div className="play-playback-progress" aria-hidden="true"><span style={{ width: `${(playback.index + 1) / playback.count * 100}%` }} /></div>}
  </section>;
}
