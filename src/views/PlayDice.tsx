import { useState } from 'react';
import type { GigRoll, Seat } from '../lib/play/protocol';
import './play-dice.css';

const images = import.meta.glob<string>('../assets/play/dice/*.webp', { eager: true, import: 'default' });

export function DieFace({ type, value, seat = 'player' }: { type: string; value?: number; seat?: Seat }) {
  const src = images[`../assets/play/dice/${seat}-${type}.webp`] ?? images[`../assets/play/dice/${seat}-d6.webp`];
  const [failed, setFailed] = useState<string>();
  return <i className="play-die-face play-crystal-die" data-shape={type} data-seat={seat} aria-hidden="true">
    {src && failed !== src && <img src={src} alt="" draggable={false} onError={() => setFailed(src)} />}
    <b>{value ?? type}</b>
  </i>;
}

export function GigRollAnnouncement({ rolls }: { rolls: GigRoll[] }) {
  return <span className="sr-only" role="status">{rolls.map(({ seat, origin, dieType, result }) =>
    `${seat === 'player' ? 'You' : 'Rival'} ${origin === 'reroll' ? 'rerolled' : 'rolled'} a ${dieType}: ${result}.`).join(' ')}</span>;
}
