import { useEffect, useState } from 'react';
import { playHref } from '../lib/playNavigation';
import { readPlayEntry } from '../lib/play/playEntry';
import type { MatchSummary } from '../lib/play/protocol';
import { PlayModeGateway } from './PlayModeGateway';

export function PlayLanding({ scope, mobile, onMatchRead }: {
  scope: string; mobile?: boolean; onMatchRead: (saved?: MatchSummary) => void;
}) {
  const [status, setStatus] = useState<'loading' | 'choose' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const origin = window.location.hash;
    void readPlayEntry(scope).then(({ mode, saved }) => {
      if (!active || window.location.hash !== origin) return;
      onMatchRead(saved);
      if (mode) window.location.replace(playHref(mode));
      else setStatus('choose');
    }).catch(() => {
      if (active && window.location.hash === origin) setStatus('error');
    });
    return () => { active = false; };
  }, [scope, attempt, onMatchRead]);

  if (status === 'loading') return <p className="callout" role="status">Checking for saved play progress…</p>;
  if (status === 'error') return <section className="panel play-landing">
    <h1 className="panel-title">Play Mode</h1>
    <p role="alert">Saved play progress couldn’t be checked. Check that browser storage is available and try again.</p>
    <button type="button" className="btn" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>Try again</button>
  </section>;
  return <PlayModeGateway preparationOnly={mobile} />;
}
