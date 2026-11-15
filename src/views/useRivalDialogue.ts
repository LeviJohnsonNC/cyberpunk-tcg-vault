import { useEffect, useState } from 'react';
import type { MatchBeat, MatchSnapshot } from '../lib/play/protocol';
import { advanceRivalDialogue, rivalResult, type RivalDialogueBank, type RivalDialogueState } from '../lib/play/rivalDialogue';

export function useRivalDialoguePreference(scope: string) {
  const key = `cptv.campaign.rivalDialogue:${scope}`;
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
  });
  return { enabled, toggle: () => {
    setEnabled(!enabled);
    try { localStorage.setItem(key, enabled ? 'off' : 'on'); } catch { /* Optional preference. */ }
  } };
}

export function useRivalDialogue(
  bank: RivalDialogueBank | undefined,
  snapshot: MatchSnapshot | undefined,
  opening: { matchId: string; retry: boolean } | undefined,
  playing: boolean,
  beat: MatchBeat | undefined,
) {
  const [dialogue, setDialogue] = useState<RivalDialogueState>();
  useEffect(() => {
    if (!bank || !snapshot) return;
    const batch = snapshot.presentation;
    const beats = playing ? beat ? [beat] : [] : [
      ...(batch?.feedback ? [batch.feedback] : []), ...(batch?.beats ?? []),
    ];
    const result = playing ? undefined : rivalResult(snapshot.view);
    const frame = requestAnimationFrame(now => {
      setDialogue(previous => advanceRivalDialogue(previous, {
        matchId: snapshot.matchId, batch: snapshot.view.stateID, beats, result, now,
        opening: opening?.matchId === snapshot.matchId ? opening.retry ? 'retry' : 'intro' : undefined,
      }, bank));
    });
    return () => cancelAnimationFrame(frame);
  }, [bank, snapshot, opening, playing, beat]);
  return dialogue?.matchId === snapshot?.matchId ? dialogue?.line : undefined;
}
