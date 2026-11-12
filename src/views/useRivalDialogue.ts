import { useEffect, useState } from 'react';
import type { EncounterId } from '../lib/play/campaign';
import { campaignChapters } from '../lib/play/campaignStory';
import type { MatchBeat, MatchSnapshot } from '../lib/play/protocol';
import { advanceRivalDialogue, rivalResult, type RivalDialogueState } from '../lib/play/rivalDialogue';

export function useRivalDialogue(
  encounter: EncounterId | undefined,
  snapshot: MatchSnapshot | undefined,
  opening: { matchId: string; retry: boolean } | undefined,
  playing: boolean,
  beat: MatchBeat | undefined,
) {
  const [dialogue, setDialogue] = useState<RivalDialogueState>();
  useEffect(() => {
    if (!encounter || !snapshot) return;
    const batch = snapshot.presentation;
    const beats = playing ? beat ? [beat] : [] : [
      ...(batch?.feedback ? [batch.feedback] : []), ...(batch?.beats ?? []),
    ];
    const result = playing ? undefined : rivalResult(snapshot.view);
    const frame = requestAnimationFrame(now => {
      setDialogue(previous => advanceRivalDialogue(previous, {
        matchId: snapshot.matchId, batch: snapshot.view.stateID, beats, result, now,
        opening: opening?.matchId === snapshot.matchId ? opening.retry ? 'retry' : 'intro' : undefined,
      }, campaignChapters[encounter].lines));
    });
    return () => cancelAnimationFrame(frame);
  }, [encounter, snapshot, opening, playing, beat]);
  return dialogue?.matchId === snapshot?.matchId ? dialogue?.line : undefined;
}
