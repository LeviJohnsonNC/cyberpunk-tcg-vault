import { useEffect, useRef } from 'react';
import type { MatchBeat, MatchSnapshot } from '../lib/play/protocol';
import type { TableCue } from '../lib/play/tableSound';

type Cue = (name: TableCue, delayMs?: number, pan?: number) => (() => void) | undefined;

const delays = { turn: 0, deal: 140, draw: 140, eddie: 300, call: 135, 'gig-steal': 240 };

export function useMatchSound(snapshot: MatchSnapshot, beat: MatchBeat | undefined, reduced: boolean, cue?: Cue) {
  const heardBeat = useRef(0);
  const heardOpening = useRef(false);
  const result = snapshot.view.gameEnded ? snapshot.view.winnerId ?? 'draw' : undefined;
  const heardResult = useRef(result);

  useEffect(() => {
    let openingDelay = 0;
    if (snapshot.openingDeal && !heardOpening.current) {
      heardOpening.current = true;
      cue?.('deal', reduced ? 0 : 1150);
      openingDelay = reduced ? 180 : 1550;
    }
    const presentation = snapshot.presentation;
    const beats = reduced && presentation
      ? [...(presentation.feedback ? [presentation.feedback] : []), ...presentation.beats]
      : beat ? [beat] : [];
    const fresh = beats.filter(item => item.id > heardBeat.current);
    for (const [index, item] of fresh.entries()) {
      heardBeat.current = item.id;
      for (const sound of item.tableCues ?? []) {
        // Without animation, stagger compressed actions so two turn cues remain distinct.
        const delay = reduced ? index * 85 + (sound.cue === 'turn' ? 0 : 85) : delays[sound.cue];
        cue?.(sound.cue, openingDelay + delay, sound.seat === 'rival' ? .18 : -.18);
      }
    }
    if (result !== heardResult.current) {
      heardResult.current = result;
      if (result && result !== 'draw') cue?.(result === 'player' ? 'win' : 'lose', 250);
    }
  }, [snapshot.openingDeal, snapshot.presentation, beat, reduced, result, cue]);
}
