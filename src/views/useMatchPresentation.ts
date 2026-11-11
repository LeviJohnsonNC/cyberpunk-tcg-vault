import { useEffect, useState, useSyncExternalStore } from 'react';
import { beatDuration } from '../lib/play/matchPresentation';
import type { MatchSnapshot } from '../lib/play/protocol';

function subscribeMotion(notify: () => void) {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
const getMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useMatchPresentation(snapshot?: MatchSnapshot) {
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => true);
  const key = snapshot ? `${snapshot.matchId}:${snapshot.view.stateID}` : '';
  const [progress, setProgress] = useState<{ key: string; index: number }>();
  const [expired, setExpired] = useState('');
  const rival = snapshot?.presentation?.beats ?? [];
  const own = snapshot?.presentation?.feedback;
  const beats = own && (own.gigRolls.length || (rival.length && own.changes.length)) ? [own, ...rival] : rival;
  const index = progress?.key === key ? progress.index : 0;
  const playing = !!snapshot && !reduced && index < beats.length;
  const beat = playing ? beats[index] : undefined;
  function skip() { setProgress({ key, index: beats.length }); }

  useEffect(() => {
    if (!beats.length) return;
    // Preference changes finish this batch; enabling motion applies to future moves.
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setProgress({ key, index: beats.length });
    query.addEventListener('change', finish);
    return () => query.removeEventListener('change', finish);
  }, [key, beats.length]);
  useEffect(() => {
    if (!playing || !beat) return;
    const timer = setTimeout(() => setProgress({ key, index: index + 1 }), beatDuration(beats.length, beat));
    const finish = () => setProgress({ key, index: beats.length });
    document.addEventListener('visibilitychange', finish);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', finish); };
  }, [key, index, playing, beat, beats.length]);
  useEffect(() => {
    if (playing || !snapshot?.presentation) return;
    const timer = setTimeout(() => setExpired(key), 2400);
    return () => clearTimeout(timer);
  }, [key, playing, snapshot?.presentation]);

  const last = rival.at(-1) ?? own;
  const feedback = beat ?? (expired !== key ? last : undefined);
  const displayed: MatchSnapshot | undefined = snapshot && beat ? {
    matchId: snapshot.matchId, names: snapshot.names,
    view: beat.view.gameEnded && beat.gigRolls.length ? { ...beat.view, gameEnded: false } : beat.view,
    peeks: beat.peeks,
    knownLegends: beat.knownLegends, log: beat.log, gigRolls: beat.gigRolls,
  } : snapshot && beats.length && !reduced ? { ...snapshot, gigRolls: [] } : snapshot;
  return { displayed, playing, feedback, reduced,
    playback: playing ? { beat: beat!, index, count: beats.length, skip } : undefined,
  };
}
