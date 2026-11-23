import { chooseMove, type EngineCardView } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { vaultCard } from './cardDisplay';
import { matchActions } from './matchActions';
import { visibleCards, zoneCards } from './matchView';
import type { CardView, Move, PlayerView } from './protocol';
import type { CoachStep } from './coachTypes';

const cost = (card: CardView) => card.effectiveCost ?? card.cost ?? 0;
const cheapFirst = (cards: CardView[]) => [...cards].sort((a, b) => cost(a) - cost(b));
function units(view: PlayerView) {
  return cheapFirst(zoneCards(view.players.player, 'hand').filter((card) => card.type === 'unit'));
}

export function coachFacts(view: PlayerView) {
  const facts = [
    `Turn ${view.turnNumber}. You have ${view.players.player.availableEddies} €$, ${view.players.player.gigCount} Gigs and ${view.players.player.streetCred} Street Cred. Rival has ${view.players.rival.gigCount} Gigs and ${view.players.rival.streetCred} Street Cred.`,
  ];
  for (const seat of ['player', 'rival'] as const) {
    for (const zone of ['hand', 'field', 'legendArea', 'gigArea'] as const) {
      if (seat === 'rival' && zone === 'hand') continue;
      for (const card of zoneCards(view.players[seat], zone)) {
        if (zone === 'gigArea') facts.push(`${seat} Gig: ${card.definitionId} showing ${card.power}.`);
        else if (card.definitionId && card.cardName)
          facts.push(
            `${seat} ${zone}: ${card.cardName}, ${cost(card)} €$, ${card.effectivePower} power${card.spent ? ', spent' : ''}${card.hasLag ? ', Lag' : ''}. ${vaultCard(card)?.text ?? ''}`.slice(
              0,
              520
            )
          );
      }
    }
  }
  return facts;
}

export function explainMove(view: PlayerView, move: Move, alternative = false): CoachStep {
  const a = move.args ?? {};
  const payload = view.prompt.choice?.payload as
    | {
        cards?: CardView[];
        revealedCards?: CardView[];
        gears?: CardView[];
        options?: {
          id?: string;
          triggerId?: string;
          cardName?: string;
          label?: string;
          abilityText?: string;
        }[];
        source?: { rulesText?: string };
      }
    | undefined;
  const cards = [
    ...visibleCards(view),
    ...(payload?.revealedCards ?? []),
    ...(payload?.cards ?? []),
    ...(payload?.gears ?? []),
  ];
  const get = (id: unknown) => cards.find((card) => card.instanceId === id);
  const label = (id: unknown): string => {
    const card = get(id);
    if (card?.zone === 'fixerArea' || card?.zone === 'gigArea')
      return card.definitionId + (card.zone === 'gigArea' ? ` showing ${card.power}` : '');
    for (const seat of ['player', 'rival'] as const) {
      const index = zoneCards(view.players[seat], 'legendArea').findIndex((c) => c.instanceId === id);
      if (index >= 0)
        return card?.cardName || `${seat === 'player' ? 'your' : 'rival'} Legend in slot ${index + 1}`;
    }
    return card?.cardName || 'the selected card';
  };
  const labels = (ids: unknown) => (Array.isArray(ids) ? ids.map(label).join(', ') : '');
  const hand = zoneCards(view.players.player, 'hand');
  const cash = view.players.player.availableEddies;
  const card = get(a.cardId);
  const sourceText = payload?.source?.rulesText;
  const action = matchActions(view).find((action) => action.id === move.move);
  let title = action?.label ?? 'Resolve the current decision';
  let why = sourceText || action?.detail || 'Resolve this choice before committing your next card or attacker.';
  if (a.pass)
    return {
      title: move.move === 'resolveAttack' ? 'Pass the combat response' : 'Pass on the optional effect',
      why:
        move.move === 'resolveAttack'
          ? 'Let the current attack advance while keeping your remaining cards and resources available.'
          : 'Declining preserves the cards and resources you would otherwise commit to this effect.',
    };
  switch (move.move) {
    case 'resolveFirstPlayer':
      title = a.goFirst ? 'Take the first turn' : 'Take the second turn';
      why = a.goFirst
        ? 'You get the first opportunity to develop your field. Plan your opening hand around a play you can make early.'
        : 'You will see the rival’s opening development before committing to your own main-turn line.';
      break;
    case 'mulligan':
    case 'keepHand': {
      const cheap = hand.filter((c) => c.cost !== null && c.cost <= 2);
      const sellable = hand.filter((c) => (c as EngineCardView).hasSellTag);
      title = move.move === 'mulligan' ? 'Mulligan this hand' : 'Keep this hand';
      if (alternative) {
        const earlyUnit = units(view)[0];
        const opener = earlyUnit ? `${earlyUnit.cardName} at ${cost(earlyUnit)} €$` : cheap[0]?.cardName;
        why =
          move.move === 'mulligan'
            ? `A fresh six could offer a stronger opening, but you give up ${opener ?? 'the early cards already in hand'} and cannot count on drawing it again.`
            : `Keeping guarantees ${opener ?? 'these six cards'}. ${sellable.length ? 'That line depends on finding enough early plays for your Eddies.' : 'Without a sell-tagged card, you have fewer ways to fund your next play.'}`;
        break;
      }
      why = `${
        cheap.length
          ? 'Your early options at 2 €$ or less include ' +
            cheap
              .slice(0, 2)
              .map((c) => c.cardName)
              .join(' and ')
          : 'You have no cards costing 2 €$ or less'
      }. ${sellable.length ? sellable[0].cardName + ' gives you a sale if you need an Eddie' : 'You have no sell-tagged card to help fund the opening'}. ${move.move === 'mulligan' ? 'A fresh six gives you another chance at a usable curve, at the cost of these specific cards.' : 'Keeping secures those options. A new six could lose them.'}`;
      break;
    }
    case 'gainGig': {
      const die = label(a.dieId);
      const faces = Number(die.replace(/^d/i, ''));
      title = `Roll the ${die}`;
      const cred = view.players.player.streetCred;
      const rival = view.players.rival.streetCred;
      const needed = rival - cred + 1;
      const odds =
        needed <= 1
          ? 'Every face puts you ahead of the rival on Street Cred.'
          : needed > faces
            ? 'Even its highest face leaves you behind or tied on Street Cred. Look for effects that work from that position.'
            : `A roll of ${needed} or more puts you ahead of the rival on Street Cred (${faces - needed + 1} of ${faces} faces).`;
      why = `Each available die gains one Gig. The ${die} averages ${(faces + 1) / 2} Street Cred, bringing your current ${cred} to ${cred + 1}–${cred + faces}. ${odds}`;
      break;
    }
    case 'playCard':
    case 'resolveCardToPlay':
      title = a.attachToId ? `Equip ${label(a.cardId)} to ${label(a.attachToId)}` : `Play ${label(a.cardId)}`;
      why = a.attachToId
        ? `The equipment goes on ${label(a.attachToId)}. ${card?.effectivePower ? 'Its current power contribution is ' + card.effectivePower + '. ' : ''}${(card && vaultCard(card)?.text) || 'Keep the host available to use the equipment.'}`
        : card?.type === 'unit'
          ? `Develop a ${card.effectivePower}-power Unit before spending your remaining resources. Check its Lag and ready status before planning an attack.`
          : (card && vaultCard(card)?.text) || why;
      break;
    case 'sellCard':
      title = `Sell ${label(a.cardId)}`;
      why = `Turn this card into an Eddie. You have ${cash} €$ available now. Selling gives up the card’s printed effect to fund a different play.`;
      break;
    case 'callLegend':
      title = `Call ${label(a.legendId)}`;
      why =
        'Calling turns that Legend face up. Check its revealed ability before spending the rest of your resources.';
      break;
    case 'goSolo':
      title = `Go solo with ${label(a.cardId)}`;
      why =
        'Move this Legend to the field as a threat. Consider the payment and what you give up by moving it out of the Legend area.';
      break;
    case 'attackRival':
    case 'attackUnit':
      title = `Attack ${a.defenderId ? label(a.defenderId) : 'the rival'} with ${label(a.attackerId)}`;
      why = a.defenderId
        ? `Compare ${get(a.attackerId)?.effectivePower} attacking power against ${get(a.defenderId)?.effectivePower} defending power before reactions. Removing a Unit can improve your next attack.`
        : `Your attacker has ${get(a.attackerId)?.effectivePower} power and the rival holds ${view.players.rival.gigCount} Gigs. A direct attack puts those Gigs under pressure. A blocker or reaction can change the result.`;
      break;
    case 'useBlocker':
      title = `Block with ${label(a.blockerId)}`;
      why = `Commit ${label(a.blockerId)} to redirect the incoming attack. Weigh the blocker’s ${get(a.blockerId)?.effectivePower} power against the attacker before reactions.`;
      break;
    case 'passPhase':
      title = 'End your turn';
      why = `You finish with ${cash} €$ available and ${view.players.player.gigCount} ${view.players.player.gigCount === 1 ? 'Gig' : 'Gigs'}. Passing preserves the options you have kept for the rival’s turn.`;
      break;
    case 'activateAbility':
      title = `Use ability ${Number(a.abilityIndex) + 1} on ${label(a.cardId)}`;
      why = (card && vaultCard(card)?.text) || why;
      break;
    case 'resolveAdjustGig':
      title = a.kind === 'noAdjustment' ? 'Leave the Gig unchanged' : `Adjust ${label(a.dieId)} to ${a.value}`;
      why =
        sourceText ||
        'A Gig’s face contributes to Street Cred. Check which card conditions change when you adjust it.';
      break;
    case 'resolveTrigger':
    case 'resolveChooseEffect': {
      const option = payload?.options?.find(
        (o) =>
          (o.triggerId === a.triggerId && a.triggerId !== undefined) ||
          (o.id === a.optionId && a.optionId !== undefined)
      );
      title = `Resolve ${option?.label ?? option?.cardName ?? 'the ability'}`;
      why = option?.abilityText || why;
      break;
    }
    case 'resolveScry':
      title =
        ((a.destinations as { zone: string; cardIds: string[] }[]) ?? [])
          .filter((d) => d.cardIds.length)
          .map(
            (d) =>
              `${labels(d.cardIds)} → ${d.zone.replace('deckTop', 'top of deck').replace('deckBottom', 'bottom of deck')}`
          )
          .join(' · ') || 'Keep the remaining cards in the indicated pile';
      break;
    case 'resolvePreventGigSteal':
      title =
        ((a.preventions as { cardId: string; dieId: string }[]) ?? [])
          .map((p) => `Discard ${label(p.cardId)} to keep ${label(p.dieId)}`)
          .join(' · ') || 'Keep your hand and allow the steal';
      break;
    case 'resolveCardTypeChoice':
      title = `Choose ${a.cardType}`;
      break;
    case 'resolveRevealDestination':
      title = `Move the revealed card to ${a.destination}`;
      break;
    default: {
      const picks =
        labels(a.targetIds ?? a.cardIds ?? a.dieIds) ||
        (a.cardId || a.protectedCardId ? label(a.cardId ?? a.protectedCardId) : '');
      if (picks) title += ' · ' + picks;
    }
  }
  const payKey =
    move.move === 'activateAbility' ? `${a.cardId}:${a.abilityIndex}` : String(a.cardId ?? 'action');
  const payment = view.prompt.payment?.costs[move.move]?.[payKey];
  if (payment?.amount) {
    const legendIds = new Set(view.prompt.payment?.legendIds);
    const payLegends = Array.isArray(a.paymentSourceIds)
      ? a.paymentSourceIds.filter((id) => legendIds.has(id))
      : [];
    const eddies = payment.amount - payLegends.length;
    const sources = [
      ...(eddies ? [`${eddies} ${eddies === 1 ? 'Eddie' : 'Eddies'}`] : []),
      ...payLegends.map(label),
    ];
    why += ` Pay with ${sources.join(' and ')}, leaving ${cash - payment.amount} €$ available.`;
  }
  return { title, why: why.replace(/\{([^{}]+)\}/g, '$1') };
}

export function continuation(view: PlayerView, last: Move, boundary: string): string[] {
  if (last.move === 'passPhase') return [];
  const lines = [
    last.move === 'keepHand'
      ? 'Once both opening hands are settled, follow the active player’s draw and Gig step.'
      : boundary,
  ];
  if (view.activePlayerId === 'rival' && view.gamePhase !== 'setup') {
    lines.push(
      'After your response resolves, priority returns according to the combat prompt. Reassess your defense if the rival acts again.'
    );
    return lines;
  }
  const handChanges = last.move === 'mulligan' || last.move === 'resolveFirstPlayer';
  if (last.move === 'resolveFirstPlayer')
    lines.push(
      'At the opening hand, look for early cards you can afford and a sell-tagged card to fund your next play. Mulligan if the hand gives you neither route.'
    );
  const fixer = zoneCards(view.players.player, 'fixerArea');
  // The d20 is available only after every smaller die has left the Fixer.
  const smaller = fixer.filter((die) => die.definitionId !== 'd20');
  const pool = smaller.length ? smaller : fixer;
  if (view.gamePhase === 'setup' && pool.length) {
    const preview = {
      ...view,
      prompt: {
        status: 'choice' as const,
        availableMoves: [],
        choice: { type: 'gainGig', payload: { allowedDieIds: pool.map((d) => d.instanceId) } },
      },
    };
    const roll = chooseMove(preview, () => 0.5, 'player', { strategy: 'tactical-ability-aware' });
    const die = pool.find((d) => d.instanceId === roll?.args?.dieId);
    if (die)
      lines.push(
        `When your Gig step offers ${die.definitionId}, roll it if the hand and dice still favor this line. A new hand can change which faces help your cards.`
      );
  }
  if (last.move === 'gainGig') {
    const payoff = ['hand', 'field', 'legendArea']
      .flatMap((z) => zoneCards(view.players.player, z))
      .find((c) => c.definitionId && /Street Cred|your Gigs?|your ☆/i.test(vaultCard(c)?.text ?? ''));
    lines.push(
      payoff
        ? `After the roll, check ${payoff.cardName}: ${vaultCard(payoff)!.text} If its condition holds and the action is available, preserve its payment and target. Otherwise use the development line below.`
        : 'If a higher roll puts you ahead on Street Cred, check which effects now apply. On a lower roll, favor affordable development over a conditional payoff.'
    );
  }
  const next = units(view).find((c) => c.instanceId !== last.args?.cardId);
  if (next && !handChanges)
    lines.push(
      `If ${next.cardName} is still in hand and playable, consider developing it for ${cost(next)} €$. Check the available payment after the current decision resolves.`
    );
  else if (handChanges)
    lines.push(
      'With the hand you actually keep, identify your first affordable Unit and which card you could sell to fund it. Build the board before relying on a future draw.'
    );
  const attacker = zoneCards(view.players.player, 'field').find(
    (c) => c.type === 'unit' && !c.spent && !c.hasLag && c.instanceId !== last.args?.attackerId
  );
  lines.push(
    attacker
      ? `If ${attacker.cardName} still has a legal attack, compare pressuring the rival’s Gigs with removing an exposed Unit. End the turn once another commitment would weaken your defense.`
      : 'After effects resolve, check for a profitable attack. If your Units cannot attack or you need them for defense, keep the remaining resources and end the turn.'
  );
  return lines;
}
