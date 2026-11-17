import { useLayoutEffect, useRef, useState } from 'react';
import type { GigRoll } from '../lib/play/protocol';
import { paintDie } from '../lib/play/diceMesh';
import { dicePalette } from '../lib/play/dicePalette';
import './play-dice.css';

// Cached crystal artwork stays crisp in the dock; images also survive table-flight clones.
const artwork = new Map<string, string>();
export function DieFace({ type, value }: { type: string; value?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const seat = element.closest('[data-seat]')?.getAttribute('data-seat') === 'rival' ? 'rival' : 'player';
    const palette = dicePalette(element, seat);
    const key = `${type}:${value}:${JSON.stringify(palette)}`;
    let image = artwork.get(key);
    if (!image) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      paintDie(ctx, type, value ?? 1, [type === 'd4' ? .67 : .16, -.13, 0], 68, 160, palette, true, value === undefined ? type : String(value));
      image = canvas.toDataURL();
      artwork.set(key, image);
    }
    setSrc(image);
  }, [type, value]);
  return <img ref={ref} className="play-die-face play-crystal-die" src={src} alt="" aria-hidden="true" draggable={false} />;
}

export function GigRollAnnouncement({ rolls }: { rolls: GigRoll[] }) {
  return <span className="sr-only" role="status">{rolls.map(({ seat, origin, dieType, result }) =>
    `${seat === 'player' ? 'You' : 'Rival'} ${origin === 'reroll' ? 'rerolled' : 'rolled'} a ${dieType}: ${result}.`).join(' ')}</span>;
}
