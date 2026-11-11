import { useEffect, useRef } from 'react';
import { subscribeMusic } from '../lib/musicSignal';
import './reactive-room.css';

/** Only the room moves. The mat, cards, focus rings and all hit targets remain still. */
export function ReactiveRoom() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => subscribeMusic((signal) => {
    const el = root.current;
    if (!el) return;
    const on = signal.active && signal.room;
    el.dataset.active = String(on);
    el.style.setProperty('--room-bass', String(on ? signal.bass : 0));
    el.style.setProperty('--room-air', String(on ? signal.air : 0));
    el.style.setProperty('--room-pulse', String(on ? signal.pulse : 0));
  }), []);
  return <div ref={root} className="reactive-room" aria-hidden="true"><div className="room-scene" /><div className="room-haze room-haze-pink" /><div className="room-haze room-haze-blue" /><div className="room-rings" /><div className="room-vignette" /></div>;
}
