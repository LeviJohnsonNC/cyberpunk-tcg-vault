import { useState } from 'react';
import { publicChangeLabel } from '../lib/play/matchPresentation';
import type { MatchBeat } from '../lib/play/protocol';

export function CardPowerReceipt({ beat, id, power }: { beat?: MatchBeat; id: string; power: number }) {
  const [latest, setLatest] = useState<{ id: number; power: number; text?: string; gear?: string; down: boolean }>();
  if (beat && latest?.id !== beat.id) {
    const change = beat.changes.find(item => item.kind === 'power' && item.card?.instanceId === id);
    const attachment = beat.changes.find(item => item.kind === 'played' && item.card?.attachedToId === id);
    if (change || attachment) setLatest({ id: beat.id, power: change?.card?.effectivePower ?? power,
      text: change ? publicChangeLabel(change, beat.view) : 'Equipped', gear: attachment?.card?.cardName ?? undefined,
      down: (change?.amount ?? 0) < 0 });
  }
  if (!latest?.text || latest.power !== power) return null;
  return <span className="play-float play-power-receipt" key={latest.id} data-tone={latest.down ? 'down' : 'up'} aria-hidden="true"
    onAnimationEnd={() => setLatest(value => value?.id === latest.id ? { ...value, text: undefined } : value)}>
    {latest.gear && <small>{latest.gear}</small>}{latest.text}
  </span>;
}

export interface MatchPlayback { beat: MatchBeat; index: number; count: number; skip: () => void; finishRoll?: () => void; resultHold?: number }
/** One line for the move on the table. The table itself shows what changed. */
export function PlayPresentation({ playback, feedback }: { playback?: MatchPlayback; feedback?: MatchBeat }) {
  const beat = playback?.beat ?? feedback;
  if (!beat) return null;
  return <section className="play-move-receipt" data-beat-id={beat.id} data-seat={beat.seat} aria-label={playback ? 'Move playback' : 'Move result'} key={beat.id}>
    {playback && beat.gigRolls.length > 0 && <p className="play-roll-wait"><b>{beat.seat === 'player' ? 'You' : 'Rival'}</b> Rolling {beat.gigRolls.map(({ dieType }) => dieType).join(', ')}</p>}
    <p className="play-roll-outcome" role="status">{!beat.fight && <b>{beat.seat === 'player' ? 'You' : 'Rival'} </b>}{beat.text}</p>
    {!beat.fight && beat.changes.length > 0 && <ul className="play-roll-outcome">{beat.changes.slice(0, 4).map((change, index) => <li key={index} data-change={change.kind}>
      <span>{change.card?.cardName ?? (change.seat === 'player' ? 'You' : 'Rival')}</span> <strong>{publicChangeLabel(change, beat.view)}</strong>
    </li>)}{beat.changes.length > 4 && <li>+{beat.changes.length - 4} more on the mat</li>}</ul>}
    {playback && <div className="play-playback">
      <span className="play-eyebrow">Move {playback.index + 1} / {playback.count}</span>
      <div className="play-playback-progress" aria-hidden="true"><span style={{ width: `${(playback.index + 1) / playback.count * 100}%` }} /></div>
      <button type="button" className="btn quiet" onClick={playback.skip}>Skip moves</button>
    </div>}
  </section>;
}
