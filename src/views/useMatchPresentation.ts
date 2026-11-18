import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { beatDuration, gigVictoryHold } from '../lib/play/matchPresentation';
import type { MatchSnapshot } from '../lib/play/protocol';
import { preloadFaces } from '../lib/play/cardArt';
import { visibleCards } from '../lib/play/matchView';

function subscribeMotion(notify: () => void) {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
const getMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useMatchPresentation(snapshot?: MatchSnapshot) {
  const [quick, setQuick] = useState(() => {
    try { return localStorage.getItem('cptv.match.quickPace') === 'on'; } catch { return false; }
  });
  function togglePace() {
    setQuick(!quick);
    try { localStorage.setItem('cptv.match.quickPace', quick ? 'off' : 'on'); } catch { /* Available for this session. */ }
  }
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => true);
  const key = snapshot ? `${snapshot.matchId}:${snapshot.view.stateID}` : '';
  const [progress, setProgress] = useState<{ key: string; index: number }>();
  const [expired, setExpired] = useState('');
  const rival = snapshot?.presentation?.beats ?? [];
  const own = snapshot?.presentation?.feedback;
  // Lead with the player's own move when it rolled a die, changed the table, or opened an attack the rival then answers.
  const victoryHold = gigVictoryHold(snapshot?.view, quick);
  const beats = own && (victoryHold || own.fight || own.gigRolls.length || (rival.length && (own.changes.length || own.view.attackState || own.tableCues?.length))) ? [own, ...rival] : rival;
  const index = progress?.key === key ? progress.index : 0;
  const playing = !!snapshot && !reduced && index < beats.length;
  const beat = playing ? beats[index] : undefined;
  const resultHold = index === beats.length - 1 ? victoryHold : 0;
  function skip() { setProgress({ key, index: beats.length }); }
  const finishRoll = useCallback(() => {
    setProgress(previous => previous?.key === key && previous.index > index ? previous : { key, index: index + 1 });
  }, [key, index]);

  useEffect(() => {
    if (!snapshot || !beat) return;
    const feedback = snapshot.presentation?.feedback;
    const rivalBeats = snapshot.presentation?.beats ?? [];
    const ownBeat = beat === feedback;
    const next = rivalBeats[ownBeat ? 0 : rivalBeats.indexOf(beat) + 1];
    return preloadFaces([...visibleCards(next?.view ?? snapshot.view), ...(next?.peeks ?? snapshot.peeks)]);
  }, [snapshot, beat]);

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
    const timer = setTimeout(() => setProgress({ key, index: index + 1 }), beatDuration(beats.length, beat, quick) + resultHold);
    const finish = () => setProgress({ key, index: beats.length });
    document.addEventListener('visibilitychange', finish);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', finish); };
  }, [key, index, playing, beat, beats.length, quick, resultHold]);
  useEffect(() => {
    if (playing || !snapshot?.presentation) return;
    // Keep the final card label and move summary available for the full popup animation.
    const timer = setTimeout(() => setExpired(key), 3200);
    return () => clearTimeout(timer);
  }, [key, playing, snapshot?.presentation]);

  const last = rival.at(-1) ?? own;
  const feedback = beat ?? (expired !== key ? last : undefined);
  const displayed: MatchSnapshot | undefined = snapshot && beat ? {
    matchId: snapshot.matchId, names: snapshot.names, openingDeal: snapshot.openingDeal,
    circuit: snapshot.circuit && { contractId: snapshot.circuit.contractId, skill: snapshot.circuit.skill },
    // Reveal the saved report and Circuit receipt together, after the final public beat.
    view: beat.view.gameEnded ? { ...beat.view, gameEnded: false } : beat.view,
    peeks: beat.peeks,
    knownLegends: beat.knownLegends, log: beat.log, gigRolls: beat.gigRolls,
  } : snapshot && beats.length && !reduced ? { ...snapshot, gigRolls: [] } : snapshot;
  return { displayed, playing, feedback, reduced, quick, togglePace,
    playback: playing ? { beat: beat!, index, count: beats.length, skip, finishRoll, resultHold } : undefined,
  };
}
