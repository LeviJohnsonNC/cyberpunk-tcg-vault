import type { MatchActionForm, PickField } from './matchActions';
import { combatContext } from './matchPresentation';
import type { PlayerView } from './protocol';

export interface CommandPresentation {
  variant: 'turn-order' | 'opening-hand' | 'gig' | 'payment' | 'target' | 'effect' | 'combat' | 'normal-turn' | 'waiting' | 'complete';
  attention: 'mandatory' | 'selection' | 'normal' | 'waiting';
  title: string;
  detail?: string;
  cueKey: string;
}

/** Presentation of existing engine choices, never a source of legal moves. */
export function commandPresentation({ view, actions, selected, active, busy = false, playback = false, rolling = false }: {
  view: PlayerView; actions: MatchActionForm[]; selected?: MatchActionForm; active?: PickField;
  busy?: boolean; playback?: boolean; rolling?: boolean;
}): CommandPresentation {
  const choice = view.prompt.choice;
  const offered = (id: string) => actions.some(action => action.id === id);
  const combat = combatContext(view);
  const attention = choice || combat && offered('resolveAttack') ? 'mandatory' : 'selection';
  const show = (variant: CommandPresentation['variant'], title: string, detail?: string, emphasis: CommandPresentation['attention'] = attention): CommandPresentation => ({
    variant, title, detail, attention: emphasis,
    // UI picks do not change stateID. Highlight once per prompt/step, not per selected target.
    cueKey: `${view.stateID}:${variant}:${selected?.id ?? ''}:${active?.id ?? ''}`,
  });
  if (view.gameEnded) return show('complete', view.winnerId === 'player' ? 'You win' : view.winnerId === 'rival' ? 'Rival wins' : 'Match complete', undefined, 'normal');
  if (rolling) return show('waiting', 'Rolling Gigs', 'The dice are resolving.', 'waiting');
  if (playback) return show('waiting', combat ? 'Resolving combat' : 'Watching moves', 'The move is playing out.', 'waiting');
  if (busy) return show('waiting', 'Resolving move', 'Your choice is being resolved.', 'waiting');
  if (!actions.length) return show('waiting', view.prompt.status === 'waiting' ? 'Rival is deciding' : 'Resolving effects', 'Waiting for the next action.', 'waiting');
  if (choice?.type === 'chooseFirstPlayer') return show('turn-order', 'Choose turn order', 'Decide who takes the first turn.', 'mandatory');
  if (view.gamePhase === 'setup' && offered('keepHand')) return show('opening-hand', 'Keep this hand?', actions.find(action => action.id === 'mulligan')?.detail, 'mandatory');
  if (selected) {
    if (selected.id === 'gainGig') return show('gig', 'Choose a Gig die', 'Drag onto your field, or select a die and choose Roll die.');
    if (active?.id === 'payment') return show('payment', 'Choose payment', 'Review the selected Eddies and Legends before confirming.');
    if (selected.id === 'useBlocker') return show('combat', 'Choose a blocker', 'Select a highlighted Unit, or pass the reaction.');
    if (['attackUnit', 'attackRival'].includes(selected.id)) return show('target', active?.id === 'defender' ? 'Choose an attack target' : 'Choose an attacker', 'Select a highlighted Unit. Cancel to return to your move.');
    return show(choice ? 'effect' : 'target', active?.label ?? selected.label, choice ? 'Resolve the highlighted choice to continue.' : 'Complete this action, or cancel to return to your move.');
  }
  if (choice) {
    // Direct choices have option labels ('unit', 'hand'), not an instruction.
    const title = choice.type === 'chooseCardType' ? 'Choose a card type'
      : choice.type === 'revealDestination' ? 'Place the revealed card' : actions[0]?.label ?? 'Resolve a choice';
    return show('effect', title, actions[0]?.detail);
  }
  if (combat) return show('combat', view.attackState?.step === 'react' ? 'Respond to the attack' : 'Continue combat', combat.hint, offered('resolveAttack') ? 'mandatory' : 'normal');
  return show('normal-turn', 'Your move', 'Select a card or drag it to a highlighted destination.', 'normal');
}
