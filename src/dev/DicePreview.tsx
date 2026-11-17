/** Isolated material and motion workbench, available only in development / QA previews. */
import { useState } from 'react';
import { DieFace } from '../views/PlayDice';
import { PlayGigRoll } from '../views/PlayGigRoll';
import { useTableSound } from '../views/useTableSound';
import { VaultSelect } from '../components/VaultSelect';
import type { GigRoll } from '../lib/play/protocol';
import './dice-preview.css';

const types = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
export function DicePreview() {
  const [type, setType] = useState('d20');
  const [run, setRun] = useState<{ id: number; rolls: GigRoll[]; vx: number }>();
  const sound = useTableSound();
  function roll(vx: number, both = false) {
    sound.unlock();
    setRun({ id: (run?.id ?? 0) + 1, vx, rolls: (both ? ['player', 'rival'] as const : ['player'] as const).map(seat =>
      ({ dieId: `preview-${seat}`, dieType: type, result: Number(type.slice(1)), seat, origin: 'gainGig' })) });
  }
  return <main className="dice-preview">
    <header><p>AFTERLIFE / MATERIAL LAB</p><h1>Crystal dice</h1><span>Blue for your crew. Red for your rival.</span></header>
    {(['player', 'rival'] as const).map(seat => <section key={seat} data-seat={seat} className="dice-preview-gallery" aria-label={`${seat} dice`}>
      {types.map(die => <figure key={die}><DieFace type={die} /><figcaption>{die.toUpperCase()} · {seat === 'player' ? 'PLAYER' : 'RIVAL'}</figcaption></figure>)}
    </section>)}
    <nav aria-label="Roll controls">
      <label htmlFor="dice-type">Die <VaultSelect id="dice-type" value={type} onValueChange={setType} options={types.map(value => ({ value, label: value }))} /></label>
      <button className="btn quiet" onClick={() => roll(120)}>Gentle drop</button>
      <button className="btn quiet" onClick={() => roll(950)}>Medium throw</button>
      <button className="btn" onClick={() => roll(2100)}>Aggressive throw</button>
      <button className="btn quiet" onClick={() => roll(-2100)}>Left rebound</button>
      <button className="btn quiet" onClick={() => roll(1400, true)}>Both crews</button>
      <button className="btn quiet" onClick={sound.toggle}>{sound.enabled ? 'Mute' : 'Enable sound'}</button>
    </nav>
    <div className="play-table dice-preview-table">
      {(['rival', 'player'] as const).map(seat => <div key={seat} data-seat={seat}>
        <div className="dice-preview-field" data-zone={`field:${seat}`}><span>{seat === 'player' ? 'YOUR FIELD' : 'RIVAL FIELD'}</span></div>
        <div className="play-gigs dice-preview-dock" data-drop-zone={`gigs:${seat}`}>
          <span className="play-die" data-card-id={`preview-${seat}`}><DieFace type={type} value={Number(type.slice(1))} /></span>
        </div>
      </div>)}
      {run && <PlayGigRoll key={run.id} rolls={run.rolls} thrown={{ dieId: 'preview-player', release: { x: .24, y: .5, vx: run.vx, vy: -80 } }} cue={sound.cue} />}
    </div>
  </main>;
}
