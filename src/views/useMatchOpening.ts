import { useEffect, useState } from 'react';
import type { TableCue } from '../lib/play/tableSound';

export function useMatchOpening(fresh: boolean, reduced: boolean, cue?: (name: TableCue) => (() => void) | undefined) {
  const [showing, setShowing] = useState(fresh);
  const [skipped, setSkipped] = useState(false);
  const duration = reduced ? 760 : 3050;

  useEffect(() => {
    if (!showing) return;
    // Defer playback to the next task so development's repeated mount cannot start the cue twice.
    let stop: (() => void) | undefined;
    const start = setTimeout(() => { stop = cue?.('match-opening'); }, 0);
    return () => { clearTimeout(start); stop?.(); };
  }, [showing, cue]);

  useEffect(() => {
    if (!showing) return;
    const timer = setTimeout(() => setShowing(false), duration);
    const settle = () => { if (document.hidden) { setSkipped(true); setShowing(false); } };
    document.addEventListener('visibilitychange', settle);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', settle); };
  }, [showing, duration]);

  return { showing, duration, skipped, skip: () => { setSkipped(true); setShowing(false); } };
}
