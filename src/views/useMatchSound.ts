import { useEffect, useRef } from 'react';
import type { MatchBeat, MatchSnapshot } from '../lib/play/protocol';
import type { TableCue } from '../lib/play/tableSound';

type Cue = (name: TableCue, delayMs?: number, pan?: number) => (() => void) | undefined;

const delays = { turn: 0, deal: 140, draw: 140, eddie: 300, call: 135, 'gig-steal': 240 };

export function useMatchSound(snapshot: MatchSnapshot, beat: MatchBeat | undefined, reduced: boolean, cue?: Cue, opening = false) {
  const heardBeat = useRef(0);
  const heardOpening = useRef(false);
  const result = snapshot.view.gameEnded ? snapshot.view.winnerId ?? 'draw' : undefined;
  const heardResult = useRef(result);

  useEffect(() => {
    if (opening) return;
    const presentation = snapshot.presentation;
    // If the rival chose turn order during match creation, the player may already have a hand.
    const hand = snapshot.view.players.player.zones.hand;
    const alreadyDealt = snapshot.openingDeal && Array.isArray(hand) && hand.length > 0 && !heardOpening.current;
    if (alreadyDealt) {
      heardOpening.current = true;
      cue?.('deal');
    }
    const beats = reduced && presentation
      ? [...(presentation.feedback ? [presentation.feedback] : []), ...presentation.beats]
      : beat ? [beat] : [];
    const fresh = beats.filter(item => item.id > heardBeat.current);
    for (const [index, item] of fresh.entries()) {
      heardBeat.current = item.id;
      for (const sound of item.tableCues ?? []) {
        // Without animation, stagger compressed actions so two turn cues remain distinct.
        const delay = reduced ? index * 85 + (sound.cue === 'turn' ? 0 : 85) : delays[sound.cue];
        const delayForDeal = sound.cue === 'deal' && item.view.gamePhase === 'setup' ? 0 : delay;
        if (alreadyDealt && sound.cue === 'deal') continue;
        cue?.(sound.cue, delayForDeal, sound.seat === 'rival' ? .18 : -.18);
      }
    }
    if (result !== heardResult.current) {
      heardResult.current = result;
      if (result && result !== 'draw') cue?.(result === 'player' ? 'win' : 'lose', 250);
    }
  }, [snapshot, beat, reduced, result, cue, opening]);
}
