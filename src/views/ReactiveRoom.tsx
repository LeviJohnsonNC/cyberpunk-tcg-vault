import { useEffect, useRef } from 'react';
import { subscribeMusic } from '../lib/musicSignal';
import './reactive-room.css';
import './campaign-rooms.css';

/** Only the room moves. The mat, cards, focus rings and all hit targets remain still. */
export function ReactiveRoom() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const visibility = () => { if (root.current) root.current.dataset.hidden = String(document.hidden); };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    const unsubscribe = subscribeMusic((signal) => {
    const el = root.current;
    if (!el) return;
    const on = signal.active && signal.room;
    el.dataset.active = String(on);
    el.dataset.atmosphere = signal.room ? 'on' : 'off';
    el.style.setProperty('--room-bass', String(on ? signal.bass : 0));
    el.style.setProperty('--room-air', String(on ? signal.air : 0));
    el.style.setProperty('--room-pulse', String(on ? signal.pulse : 0));
    });
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return <div ref={root} className="reactive-room" aria-hidden="true"><div className="room-scene" /><div className="room-haze room-haze-pink" /><div className="room-haze room-haze-blue" /><div className="room-rings" /><div className="room-atmosphere" /><div className="room-vignette" /></div>;
}
