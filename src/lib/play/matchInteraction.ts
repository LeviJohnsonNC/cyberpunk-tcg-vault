import { isReady, type MatchActionForm, type PickField, type Picks } from './matchActions';
import type { CardView } from './protocol';

export interface Intent { action: number; picks: Picks }
export interface Destination { key: string; cardId?: string }

// Use action-form candidates for legality. Zones express intent, never rules.
export function cardIntents(actions: MatchActionForm[], cardId: string): Intent[] {
  return actions.flatMap((action, index) => {
    const first = action.fields({})[0];
    return first?.options.filter((option) => option.cardId === cardId)
      .map((option) => ({ action: index, picks: { [first.id]: [option.id] } })) ?? [];
  });
}

export function dropIntents(actions: MatchActionForm[], card: CardView, destination: Destination): Intent[] {
  return cardIntents(actions, card.instanceId).flatMap((intent) => {
    const action = actions[intent.action];
    const fields = action.fields(intent.picks);
    const chooseCard = fields[0];
    const host = fields.find((field) => field.id === 'host');
    if (action.id === 'playCard') {
      if (host) return destination.cardId && host.options.some((option) => option.cardId === destination.cardId)
        ? [{ ...intent, picks: { ...intent.picks, host: [destination.cardId] } }] : [];
      if (card.type === 'gear') return [];
      return destination.key === (card.type === 'program' ? 'program' : 'field:player') ? [intent] : [];
    }
    if (action.id === 'goSolo') return destination.key === 'field:player' ? [intent] : [];
    if (action.id === 'sellCard') return destination.key === 'eddies:player' ? [intent] : [];
    if (action.id === 'attackRival') return destination.key === 'gigs:rival' ? [intent] : [];
    if (action.id === 'attackUnit') {
      const defender = fields.find((field) => field.id === 'defender');
      const option = defender?.options.find((option) => option.cardId === destination.cardId);
      return option ? [{ ...intent, picks: { ...intent.picks, defender: [option.id] } }] : [];
    }
    if (action.id === 'useBlocker') return destination.key === 'attacker' ? [intent] : [];
    // Forced effect choices remain selections until explicitly resolved.
    if (action.id === 'resolveDiscardFromHand' && destination.key === 'trash:player'
      && chooseCard?.id === 'cards') return [intent];
    return [];
  });
}

export function activeStep(fields: PickField[], picks: Picks, requested?: string) {
  return fields.find((field) => field.id === requested)
    ?? fields.find((field) => !isReady([field], picks))
    ?? fields.find((field) => !(field.id in picks)) ?? fields.at(-1);
}

export function updatePick(action: MatchActionForm, picks: Picks, fieldId: string, value: string): Picks | undefined {
  const fields = action.fields(picks);
  const index = fields.findIndex((field) => field.id === fieldId);
  const field = fields[index];
  if (!field?.options.some((option) => option.id === value)) return;
  const values = picks[fieldId] ?? [];
  if (!values.includes(value) && values.length >= field.max && field.max > 1) return;
  const next = values.includes(value) ? values.filter((id) => id !== value)
    : field.max === 1 ? [value] : [...values, value];
  const dependent = ['card', 'ability', 'attacker', 'host', 'from', 'die'].includes(fieldId);
  const result = { ...(dependent ? Object.fromEntries(fields.slice(0, index).map((step) => [step.id, picks[step.id] ?? []])) : picks), [fieldId]: next };
  // Cross-field constraints (scry destinations, prevention pairs) must also stay valid.
  for (const step of action.fields(result)) {
    if (result[step.id]) result[step.id] = result[step.id].filter((id) => step.options.some((option) => option.id === id));
  }
  return result;
}

export function reorderPick(action: MatchActionForm, picks: Picks, fieldId: string, order: string[]): Picks | undefined {
  const field = action.fields(picks).find((candidate) => candidate.id === fieldId);
  const previous = picks[fieldId] ?? [];
  if (!field?.ordered || order.length !== previous.length || new Set(order).size !== order.length
    || !order.every((id) => previous.includes(id) && field.options.some((option) => option.id === id))) return;
  return { ...picks, [fieldId]: order };
}

export function intentLabel(action: MatchActionForm, picks: Picks, source?: CardView) {
  const payment = action.fields(picks).find((field) => field.id === 'payment');
  const ability = action.fields(picks)[0]?.options.find((option) => picks.ability?.includes(option.id));
  return [action.id === 'playCard' && source?.zone === 'legendArea' ? 'Play normally' : action.label, ability?.note, payment && !ability && `${payment.min} €$`].filter(Boolean).join(' · ');
}

export function commitLabel(action: MatchActionForm, picks: Picks) {
  const paid = action.fields(picks).some((field) => field.id === 'payment');
  const labels: Record<string, string> = { playCard: 'Play card', callLegend: 'Call Legend', goSolo: 'Go solo',
    sellCard: 'Sell for an Eddie', attackUnit: 'Attack Unit', attackRival: 'Attack rival', useBlocker: 'Block attack',
    activateAbility: 'Activate ability', gainGig: 'Roll die', resolveScry: 'Place cards' };
  return `${paid ? 'Pay & ' : ''}${paid ? (labels[action.id] ?? 'resolve').toLowerCase() : labels[action.id] ?? 'Resolve'}`;
}
