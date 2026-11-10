import type { CardView, Move, PlayerView, Seat, SeatView } from './protocol';

export function zoneCards(seat: SeatView, zone: string): CardView[] {
  const cards = seat.zones[zone];
  return Array.isArray(cards) ? cards : [];
}

export function zoneCount(seat: SeatView, zone: string) {
  const cards = seat.zones[zone];
  return Array.isArray(cards) ? cards.length : cards ?? 0;
}

export function visibleCards(view: PlayerView) {
  return Object.values(view.players).flatMap((seat) => Object.values(seat.zones).flatMap((zone) => Array.isArray(zone) ? zone : []));
}

// Some upstream targeting prompts project all selectable cards as revealed.
// Preserve legal slot IDs but reuse the masked board card until a peek resolves.
export function hideConcealedTargets(view: PlayerView): PlayerView {
  const choice = view.prompt.choice;
  const payload = choice?.payload as { cards?: CardView[]; source?: { cardId: string } } | undefined;
  if (!choice || !payload || (!payload.cards && !payload.source)) return view;
  const concealed = new Map(visibleCards(view).filter((card) => card.faceDown && !card.definitionId).map((card) => [card.instanceId, card]));
  return {
    ...view,
    prompt: {
      ...view.prompt,
      choice: {
        ...choice,
        payload: {
          ...payload,
          ...(payload.cards && { cards: payload.cards.map((card) => concealed.get(card.instanceId) ?? card) }),
          ...(payload.source && concealed.has(payload.source.cardId) && { source: undefined }),
        },
      },
    },
  };
}

export function describeAction(seat: Seat, command: Move, before: PlayerView, after: PlayerView): string | undefined {
  const beforeCards = visibleCards(before);
  const afterCards = visibleCards(after);
  const name = (id: unknown) => afterCards.find((card) => card.instanceId === id)?.cardName
    ?? beforeCards.find((card) => card.instanceId === id)?.cardName;
  const args = command.args ?? {};
  switch (command.move) {
    case 'resolveFirstPlayer': return args.goFirst ? 'Chose to go first.' : 'Chose to go second.';
    case 'keepHand': return 'Kept the opening hand.';
    case 'mulligan': return 'Took a mulligan.';
    case 'gainGig': {
      const die = zoneCards(after.players[seat], 'gigArea').find((card) => card.instanceId === args.dieId);
      return die ? `Gained a ${die.definitionId} Gig · rolled ${die.power}.` : 'Gained a Gig.';
    }
    case 'playCard': return `Played ${name(args.cardId) ?? 'a card'}.`;
    case 'sellCard': return 'Sold a card for an Eddie.';
    case 'callLegend': return `Called ${name(args.legendId) ?? 'a Legend'}.`;
    case 'goSolo': return `${name(args.cardId) ?? 'A Legend'} went solo.`;
    case 'attackRival': return `${name(args.attackerId) ?? 'A Unit'} attacked the rival.`;
    case 'attackUnit': return `${name(args.attackerId) ?? 'A Unit'} attacked ${name(args.defenderId) ?? 'a Unit'}.`;
    case 'useBlocker': return `Blocked with ${name(args.blockerId) ?? 'a Unit'}.`;
    case 'activateAbility': return `Activated ${name(args.cardId) ?? 'a card'}.`;
    case 'passPhase': return 'Ended the turn.';
    case 'concede': return 'Conceded the match.';
  }
  const gained = after.players[seat].gigCount - before.players[seat].gigCount;
  const lost = before.players[seat === 'player' ? 'rival' : 'player'].gigCount - after.players[seat === 'player' ? 'rival' : 'player'].gigCount;
  return gained > 0 && lost > 0 ? `Stole ${Math.min(gained, lost)} ${gained === 1 ? 'Gig' : 'Gigs'}.` : undefined;
}
