import type { FilteredCardView } from '@tcg/cyberpunk-engine/view/filter';
import type { DecisionContext, MoveDecision } from '@tcg/cyberpunk-engine/automation/types';
import { scoreCardAbilitiesForPlay } from '@tcg/cyberpunk-engine/automation/util/ability-value';
import { gigPlanValue } from '@tcg/cyberpunk-engine/automation/util/gig-plan';

type View = DecisionContext['view'];
type Card = FilteredCardView;
const cards = (zone: Card[] | number | undefined): Card[] => Array.isArray(zone) ? zone : [];

/** A card's usefulness to its recipient, using only the supplied projection. */
function handValue(card: Card, view: View, recipient: string, advanced: boolean): number {
  const player = view.players[recipient];
  if (!player) return 0;
  const field = cards(player.zones.field);
  const units = field.filter(card => card.type === 'unit');
  const hosts = [...units, ...cards(player.zones.legendArea).filter(card => !card.faceDown)];
  const cost = card.effectiveCost ?? card.cost ?? 0;
  const affordable = cost <= player.availableEddies + 1;
  let value = 8 + Math.max(0, card.effectivePower) * 2 + (card.hasSellTag ? 3 : 0);
  if (card.type === 'unit') value += (units.length === 0 ? 14 : 5);
  if (!affordable) value -= (cost - player.availableEddies - 1) * 4;
  if (card.type === 'gear') {
    if (!hosts.length) value -= 12;
    else value += Math.max(...hosts.map(host =>
      Math.floor((host.effectivePower + card.effectivePower) / 10) > Math.floor(host.effectivePower / 10) ? 16 : 0));
  }
  if (advanced) value += Math.max(-20, Math.min(30, scoreCardAbilitiesForPlay(card, view, recipient))) * .5;
  return value;
}

/** Root choices already reveal these cards legally; never inspect a simulated draw. */
export function informedChoice(ctx: DecisionContext, advanced: boolean,
  deckTypePrior?: Readonly<Record<string, number>>): MoveDecision | undefined {
  const choice = ctx.prompt.choice;
  if (!choice) return undefined;
  if (choice.type === 'chooseGigsToSteal' && !advanced) {
    const { count, eligibleDice } = choice.payload;
    if (eligibleDice.length < count) return undefined;
    const dice = [...eligibleDice].sort((a, b) => b.faceValue - a.faceValue || a.dieId.localeCompare(b.dieId));
    return { kind: 'command', move: 'resolveStealGigs', args: { dieIds: dice.slice(0, count).map(die => die.dieId) } };
  }
  if (choice.type === 'chooseTarget' && choice.payload.effect?.effect === 'lookAt') {
    const visible = Object.values(ctx.view.players).flatMap(player => cards(player.zones.legendArea));
    const eligible = [...(choice.payload.eligibleIds ?? [])].sort((a, b) =>
      Number(!!visible.find(card => card.instanceId === a)?.definitionId)
      - Number(!!visible.find(card => card.instanceId === b)?.definitionId) || a.localeCompare(b));
    const count = Math.min(choice.payload.max ?? 1, eligible.length);
    if (count >= (choice.payload.min ?? 1)) return { kind: 'command', move: 'resolveEffectTarget', args: { targetIds: eligible.slice(0, count) } };
  }
  if (choice.type === 'scry') {
    const { destinations, revealedCards, player } = choice.payload;
    const recipient = player === 'friendly' ? ctx.playerId : player === 'rival'
      ? Object.keys(ctx.view.players).find(id => id !== ctx.playerId)! : player;
    const own = recipient === ctx.playerId;
    const selected = new Set<string>();
    const resolved = [];
    for (const destination of destinations) {
      if (destination.remainder) continue;
      const keep = destination.zone === 'hand' || destination.zone === 'deckTop';
      const direction = keep === own ? -1 : 1;
      const value = (id: string) => {
        const card = revealedCards.find(card => card.instanceId === id);
        return card ? handValue(card, ctx.view, recipient, advanced) : 0;
      };
      const available = destination.eligibleCardIds.filter(id => !selected.has(id))
        .sort((a, b) => direction * (value(a) - value(b)) || a.localeCompare(b));
      const min = destination.min ?? 0;
      const max = Math.min(destination.max ?? available.length, available.length);
      // Optional trash/bottom choices preserve useful own cards, unless taking
      // them out is required to obtain the remaining cards in hand.
      const remainder = destinations.find(item => item.remainder);
      const requiredForHand = remainder?.zone === 'hand';
      const desired = keep || !own || requiredForHand ? max
        : remainder?.zone === 'deckTop' ? Math.min(max, available.filter(id => value(id) < 18).length) : min;
      const cardIds = available.slice(0, Math.max(min, desired));
      cardIds.forEach(id => selected.add(id));
      resolved.push({ zone: destination.zone, cardIds });
    }
    return { kind: 'command', move: 'resolveScry', args: { destinations: resolved } };
  }
  if (choice.type === 'revealDestination') {
    const { player, destinations, revealedCards, drawIfDestination } = choice.payload;
    const value = (destination: string) => {
      let utility = destination === 'hand'
        ? revealedCards.reduce((sum, card) => sum + handValue(card, ctx.view, player, advanced), 0) * (player === ctx.playerId ? 1 : -1)
        : 0;
      if (drawIfDestination?.destination === destination) {
        // Generic draw value, not the next cards in the deck or the fork's RNG.
        utility += drawIfDestination.amount * 18 * (drawIfDestination.player === ctx.playerId ? 1 : -1);
      }
      return utility;
    };
    const destination = [...destinations].sort((a, b) => value(b) - value(a) || a.localeCompare(b))[0];
    return destination ? { kind: 'command', move: 'resolveRevealDestination', args: { destination } } : undefined;
  }
  if (choice.type === 'chooseCardType') {
    // The registered main-deck mix is a prior, not knowledge of the current top.
    // Without a supplied list, prefer a Unit; do not manufacture exact odds.
    const types = [...choice.payload.cardTypes];
    const cardType = types.sort((a, b) => (deckTypePrior?.[b] ?? 0) - (deckTypePrior?.[a] ?? 0)
      || Number(b === 'unit') - Number(a === 'unit') || a.localeCompare(b))[0];
    return cardType ? { kind: 'command', move: 'resolveCardTypeChoice', args: { cardType } } : undefined;
  }
  if (choice.type === 'gainGig') {
    const player = ctx.view.players[ctx.playerId];
    const fixer = cards(player?.zones.fixerArea);
    const values = cards(player?.zones.gigArea).map(gig => gig.effectivePower);
    const expectedValue = (id: string) => {
      const die = fixer.find(die => die.instanceId === id);
      const sides = Number(die?.definitionId.replace(/^d/, ''));
      if (![4, 6, 8, 10, 12, 20].includes(sides)) return 0;
      let score = 0;
      for (let face = 1; face <= sides; face++) {
        score += face + (advanced ? gigPlanValue(ctx.view, ctx.playerId, [...values, face]) : 0);
      }
      return score / sides;
    };
    const dieId = [...choice.payload.allowedDieIds].sort((a, b) => expectedValue(b) - expectedValue(a) || a.localeCompare(b))[0];
    return dieId ? { kind: 'command', move: 'gainGig', args: { dieId } } : undefined;
  }
}

/** A casual player can also choose a Legend they actually inspected. */
export function rememberedCall(decision: MoveDecision, ctx: DecisionContext): MoveDecision {
  if (decision.kind !== 'command' || decision.move !== 'callLegend') return decision;
  const move = ctx.prompt.availableMoves.find(move => move.moveId === 'callLegend');
  if (move?.inputSpec.type !== 'selectCard') return decision;
  const legends = cards(ctx.view.players[ctx.playerId]?.zones.legendArea);
  const value = (id: string) => {
    const card = legends.find(card => card.instanceId === id);
    // An unseen slot has ordinary development value, not an inferred identity.
    return card?.definitionId ? 10 + Math.max(0, scoreCardAbilitiesForPlay(card, ctx.view, ctx.playerId)) : 18;
  };
  const id = [...move.inputSpec.candidates].sort((a, b) => value(b) - value(a) || a.localeCompare(b))[0];
  return id ? { ...decision, args: { ...decision.args, legendId: id } } : decision;
}
