import { visibleCards, zoneCards } from './matchView';
import type { CardView, Move, PlayerView, Seat } from './protocol';

export interface PickOption { id: string; label: string; cardId?: string; note?: string }
export interface PickField { id: string; label: string; options: PickOption[]; min: number; max: number; ordered?: boolean }
export type Picks = Record<string, string[]>;
export interface MatchActionForm {
  id: string;
  label: string;
  detail?: string;
  confirm?: string;
  fields: (picks: Picks) => PickField[];
  move: (picks: Picks) => Move;
}

const pick = (id: string, label: string, note?: string): PickOption => ({ id, label, note });
const field = (id: string, label: string, options: PickOption[], min = 1, max = min, ordered = false): PickField => ({ id, label, options, min, max, ordered });
const one = (picks: Picks, key: string) => picks[key]?.[0];
const direct = (id: string, label: string, args?: Move['args'], detail?: string): MatchActionForm => ({
  id, label, detail, fields: () => [], move: () => ({ move: id, args }),
});
const form = (
  id: string, label: string, fields: MatchActionForm['fields'], args: (picks: Picks) => Move['args'], detail?: string,
): MatchActionForm => ({ id, label, detail, fields, move: (picks) => ({ move: id, args: args(picks) }) });

export function isReady(fields: PickField[], picks: Picks) {
  return fields.every(({ id, min, max, options }) => {
    const selected = picks[id] ?? [];
    return selected.length >= min && selected.length <= max && new Set(selected).size === selected.length &&
      selected.every((value) => options.some((option) => option.id === value));
  });
}

export function matchActions(view: PlayerView): MatchActionForm[] {
  const { prompt } = view;
  const choice = prompt.choice;
  const offered = new Map(prompt.availableMoves.map(({ moveId, inputSpec }) => [moveId, inputSpec]));
  const payload = choice?.payload as Record<string, unknown> | undefined;
  const exposed = (payload?.cards ?? payload?.revealedCards ?? payload?.gears ?? []) as CardView[];
  const cards = new Map([...exposed, ...visibleCards(view)].map((card) => [card.instanceId, card]));
  const dieOwners = new Map(Object.entries(view.players).flatMap(([seat, player]) =>
    zoneCards(player, 'gigArea').map((card) => [card.instanceId, seat as Seat] as const)));
  const source = payload?.source as { displayName?: string; rulesText?: string } | undefined;
  const detail = source?.displayName ? [source.displayName, source.rulesText].filter(Boolean).join(' · ') : undefined;
  const option = (id: string): PickOption => {
    const card = cards.get(id);
    if (card?.zone === 'gigArea' || card?.zone === 'fixerArea') {
      return { id, cardId: id, label: card.zone === 'fixerArea' ? card.definitionId : `${card.definitionId} · ${card.power}`, note: dieOwners.get(id) === 'rival' ? 'Rival Gig' : undefined };
    }
    const note = card?.cost != null ? `${card.effectiveCost ?? card.cost} €$` : undefined;
    const hidden = card?.zone === 'legendArea' ? 'Face-down Legend' : 'Hidden card';
    const position = zoneCards(view.players.player, 'legendArea').findIndex((legend) => legend.instanceId === id);
    return { id, cardId: id, label: card?.cardName ?? (position >= 0 ? `Legend slot ${position + 1}` : hidden), note };
  };
  const options = (ids: string[]) => ids.map(option);
  const payment = prompt.payment;
  const poolOptions = payment ? [
    ...payment.eddieIds.map((id, index) => ({ ...pick(id, `Eddie ${index + 1}`), cardId: id })),
    ...Array.from({ length: Math.max(0, payment.eddies - payment.eddieIds.length) },
      (_, index) => ({ ...pick(`pool:${index}`, `Eddie ${payment.eddieIds.length + index + 1}`), cardId: `pool:${index}` })),
  ] : [];
  const paymentFields = (move: string, key?: string) => {
    const cost = key ? payment?.costs[move]?.[key] : undefined;
    if (!payment || !cost?.amount) return [];
    const legends = payment.legendIds.filter((id) => !cost.reservedLegendIds?.includes(id));
    return [field('payment', `Pay ${cost.amount} €$`, [...poolOptions, ...options(legends)], cost.amount)];
  };
  const paymentArgs = (p: Picks) => p.payment
    ? { paymentSourceIds: p.payment.filter((id) => !id.startsWith('pool:')) }
    : {};
  const select = (id: string, label: string, ids: string[], key: string, count = 1) =>
    form(id, label, () => [field('target', label, options(ids), count)], (p) => ({ [key]: count === 1 ? one(p, 'target') : p.target }), detail);
  const skip = (id: string, label = 'Decline') => direct(id, label, { pass: true });
  const allow = (forms: MatchActionForm[]) => forms.filter((action) => offered.has(action.id));

  if (choice && payload) {
    let actions: MatchActionForm[] = [];
    switch (choice.type) {
      case 'chooseFirstPlayer':
        actions = [direct('resolveFirstPlayer', 'Go first', { goFirst: true }), direct('resolveFirstPlayer', 'Go second', { goFirst: false })];
        break;
      case 'gainGig':
        actions = [select('gainGig', 'Choose a Gig die', payload.allowedDieIds as string[], 'dieId')];
        break;
      case 'chooseTarget': {
        const ids = (payload.eligibleIds ?? []) as string[];
        const min = (payload.min ?? 1) as number;
        const max = (payload.max ?? 1) as number;
        if (offered.has('resolveAdjustGig')) {
          const adjustment = (payload.adjustGig ?? payload) as { direction?: string; maxAmount?: number; chooseUpTo?: boolean };
          const dieIds = payload.dieId ? [payload.dieId as string] : ids;
          const fixed = dieIds.length === 1 ? dieIds[0] : undefined;
          actions = [form('resolveAdjustGig', 'Adjust a Gig', (p) => {
            const id = fixed ?? one(p, 'die');
            const die = id ? cards.get(id) : undefined;
            const steps = fixed ? [] : [field('die', 'Choose a Gig', options(dieIds))];
            if (!die && !payload.dieId) return steps;
            const current = (payload.currentValue ?? die?.power ?? 0) as number;
            const faces = (payload.maxFaceValue ?? Number(die?.definitionId.slice(1))) as number;
            const values = Array.from({ length: faces || 0 }, (_, i) => i + 1).filter((value) => {
              const delta = value - current;
              return Math.abs(delta) <= (adjustment.maxAmount ?? 0) &&
                (adjustment.chooseUpTo || delta !== 0) &&
                (adjustment.direction !== 'increase' || delta >= 0) && (adjustment.direction !== 'decrease' || delta <= 0);
            });
            return [...steps, field('value', `New value · currently ${current}`, values.map((value) => pick(String(value), String(value))))];
          }, (p) => ({ kind: 'adjust', dieId: fixed ?? one(p, 'die'), value: Number(one(p, 'value')) }), detail)];
          if (payload.canDecline || min === 0 || adjustment.chooseUpTo) actions.push(direct('resolveAdjustGig', 'Decline adjustment', { kind: 'noAdjustment' }));
        } else if (payload.type === 'discardFromHand') {
          actions = [form('resolveDiscardFromHand', 'Discard from hand', () => [field('cards', 'Choose cards to discard', options(ids), payload.amount as number ?? 1)],
            (p) => ({ cardIds: p.cards }), detail)];
          if (payload.canDecline) actions.push(skip('resolveDiscardFromHand'));
        } else {
          const label = payload.targetPurpose === 'attachHost' ? 'Choose an attachment host' : payload.targetPurpose === 'gearToPlay' ? 'Choose Gear' : 'Choose a target';
          const eligible = payload.targetPurpose === 'playCard'
            ? ids.filter((id) => ((payload.effectiveCostsByCardId as Record<string, number>)?.[id] ?? 0) <= (payload.availableEddiesAfterCosts as number ?? Infinity))
            : ids;
          actions = [form('resolveEffectTarget', label, (p) => {
            if (!payload.pairConstraint) return [field('targets', label, options(eligible), min, max)];
            const first = one(p, 'from');
            const targets = eligible.filter((id) => id !== first &&
              (payload.pairConstraint !== 'gig-copy-between-players' || dieOwners.get(id) !== dieOwners.get(first)));
            return [field('from', 'Copy value from', options(eligible)),
              ...(first ? [field('to', 'Copy value to', options(targets))] : [])];
          }, (p) => ({ targetIds: payload.pairConstraint ? [one(p, 'from'), one(p, 'to')] : p.targets ?? [] }), detail)];
          if (payload.canDecline || min === 0 || payload.targetPurpose === 'playCard') actions.push(skip('resolveEffectTarget'));
        }
        break;
      }
      case 'chooseEffect':
        actions = [form('resolveChooseEffect', 'Choose an effect', () => [field('effect', 'Effect', (payload.options as { id: string; label: string }[]).map(({ id, label }) => pick(id, label)))],
          (p) => ({ optionId: one(p, 'effect') }), detail)];
        break;
      case 'chooseTrigger': {
        const triggers = payload.options as { triggerId: string; cardName: string; abilityText: string }[];
        const multiple = triggers.length > 1;
        actions = [form('resolveTrigger', multiple ? 'Order abilities' : 'Resolve an ability',
          () => [field('trigger', multiple ? 'Choose what resolves first' : 'Choose an ability', triggers.map(({ triggerId, cardName, abilityText }) => pick(triggerId, cardName, abilityText)))],
          (p) => ({ triggerId: one(p, 'trigger') }), multiple ? 'Resolve one ability at a time. The first can change what the others can do.' : undefined)];
        if (payload.canPass) actions.push(skip('resolveTrigger', 'Pass on optional abilities'));
        break;
      }
      case 'chooseGigsToSteal':
        actions = [form('resolveStealGigs', 'Steal Gigs', () => [field('gigs', 'Choose Gigs to steal',
          options((payload.eligibleDice as { dieId: string }[]).map(({ dieId }) => dieId)), payload.count as number)], (p) => ({ dieIds: p.gigs }), detail)];
        break;
      case 'preventGigSteal': {
        const gigs = payload.stealEntries as { dieId: string; value: number }[];
        const hand = payload.handEntries as { cardId: string; cost: number }[];
        actions = [form('resolvePreventGigSteal', 'Prevent Gig theft', (p) => gigs.map(({ dieId, value }) =>
          field(dieId, `Discard for ${option(dieId).label}`, options(hand.filter(({ cardId, cost }) => cost === value &&
            !Object.entries(p).some(([other, chosen]) => other !== dieId && chosen.includes(cardId))).map(({ cardId }) => cardId)), 0, 1)),
        (p) => ({ preventions: gigs.flatMap(({ dieId }) => one(p, dieId) ? [{ dieId, cardId: one(p, dieId) }] : []) }),
        'You may discard one card of equal cost per Gig to keep it.')];
        break;
      }
      case 'scry': {
        const destinations = payload.destinations as { zone: string; remainder?: boolean; min?: number; max?: number; eligibleCardIds: string[]; order?: string }[];
        const labels: Record<string, string> = { hand: 'Add to hand', trash: 'Send to trash', deckTop: 'Top of deck', deckBottom: 'Bottom of deck', field: 'Put on the field' };
        const selectable = destinations.filter((dest) => !dest.remainder);
        const remainder = destinations.find((dest) => dest.remainder)?.zone ?? 'deckBottom';
        actions = [form('resolveScry', 'Place revealed cards', (p) => selectable.map((dest, i) =>
          field(String(i), labels[dest.zone] ?? dest.zone,
            options(dest.eligibleCardIds.filter((id) => !Object.entries(p).some(([key, chosen]) => key !== String(i) && chosen.includes(id)))),
            dest.min ?? 0, dest.max ?? dest.eligibleCardIds.length, dest.order !== 'random' && (dest.zone === 'deckTop' || dest.zone === 'deckBottom'))),
        (p) => ({ destinations: selectable.map((dest, i) => ({ zone: dest.zone, cardIds: dest.zone === 'deckTop' ? [...(p[String(i)] ?? [])].reverse() : p[String(i)] ?? [] })) }),
        [detail, `Unassigned cards · ${labels[remainder] ?? remainder}.`].filter(Boolean).join(' '))];
        break;
      }
      case 'revealDestination':
        actions = (payload.destinations as string[]).map((destination) => direct('resolveRevealDestination', destination === 'hand' ? 'Add to hand' : 'Send to trash', { destination }, detail));
        break;
      case 'chooseCardToPlay':
      case 'chooseCardToMove': {
        const play = choice.type === 'chooseCardToPlay';
        const id = play ? 'resolveCardToPlay' : 'resolveCardToMove';
        const ids = payload.cardIds as string[];
        if (play) {
          const eligible = ids.filter((cardId) => {
            const [cost] = paymentFields(id, cardId);
            return (!cost || cost.options.length >= cost.min) && payment?.effectGearHosts[cardId]?.length !== 0;
          });
          const forced = eligible.length === 1 && payment?.costs[id]?.[eligible[0]]?.amount ? eligible[0] : undefined;
          actions = eligible.length ? [form(id, forced ? `Pay to play ${option(forced).label}` : 'Choose a card to play', (p) => {
            const cardId = forced ?? one(p, 'card');
            const hosts = cardId ? payment?.effectGearHosts[cardId] : undefined;
            return [
              ...(forced ? [] : [field('card', 'Choose a card to play', options(eligible))]),
              ...(hosts ? [field('host', 'Attach to', options(hosts))] : []),
              ...paymentFields(id, cardId),
            ];
          }, (p) => ({ cardId: forced ?? one(p, 'card'), attachToId: one(p, 'host'), ...paymentArgs(p) }), detail)] : [];
        } else {
          actions = [select(id, 'Choose a card to move', ids, 'cardId')];
        }
        if (payload.canDecline) actions.push(skip(id));
        break;
      }
      case 'chooseCardType':
        actions = (payload.cardTypes as string[]).map((cardType) => direct('resolveCardTypeChoice', cardType, { cardType }, detail));
        break;
      case 'redirectDefeat': {
        const id = 'resolveRedirectDefeat';
        const eligible = payload.eligibleProtectedCardIds as string[] | undefined;
        actions = [form(id, eligible ? 'Protect a Unit' : `Protect ${option(payload.protectedCardId as string).label}`,
          () => [...(eligible ? [field('protected', 'Choose a Unit to protect', options(eligible))] : []), ...paymentFields(id, 'action')],
          (p) => ({ ...paymentArgs(p), ...(eligible && { protectedCardId: one(p, 'protected') }) }),
          `Spend ${payload.cost} €$ and defeat ${option(payload.replacementCardId as string).label} instead.`), skip(id)];
        break;
      }
      case 'chooseSacrificialGear':
        actions = [select('resolveSacrificialGear', 'Choose Gear to sacrifice', payload.gearIds as string[], 'cardId')];
        break;
    }
    return allow(actions);
  }

  const actions: MatchActionForm[] = [];
  for (const [id, spec] of offered) {
    switch (id) {
      case 'playCard': {
        const candidates = (spec.candidates as { cardId: string; attachTargets?: string[] }[]).filter((card) => card.attachTargets?.length !== 0);
        actions.push(form(id, 'Play card', (p) => {
          const cardId = one(p, 'card');
          const targets = candidates.find((card) => card.cardId === cardId)?.attachTargets;
          return [field('card', 'Choose a card', options(candidates.map((card) => card.cardId))),
            ...(targets ? [field('host', 'Attach to', options(targets))] : []),
            ...paymentFields(id, cardId)];
        }, (p) => ({ cardId: one(p, 'card'), attachToId: one(p, 'host'), ...paymentArgs(p) })));
        break;
      }
      case 'attackUnit': {
        const attackers = spec.fromCandidates as string[];
        const defenders = spec.toCandidates as string[];
        const legalTargets = (attacker: string) => {
          const rules = cards.get(attacker)?.grantedRules ?? [];
          return defenders.filter((id) => {
            const card = cards.get(id);
            return card?.spent || rules.includes('canAttackReadyUnits') ||
              (rules.includes('canAttackReadyBlockers') && card?.grantedRules?.includes('blocker'));
          });
        };
        actions.push(form(id, 'Attack a Unit', (p) => {
          const attacker = one(p, 'attacker');
          return [field('attacker', 'Choose an attacker', options(attackers.filter((id) => legalTargets(id).length))),
            ...(attacker ? [field('defender', 'Choose a defender', options(legalTargets(attacker)))] : [])];
        }, (p) => ({ attackerId: one(p, 'attacker'), defenderId: one(p, 'defender') })));
        break;
      }
      case 'activateAbility': {
        const abilities = spec.candidates as { cardId: string; abilityIndex: number; eddieCost: number; spendsCard: boolean }[];
        actions.push(form(id, 'Activate ability', (p) => {
          const ability = abilities[Number(one(p, 'ability'))];
          return [field('ability', 'Choose an ability', abilities.map((candidate, i) => ({
            ...option(candidate.cardId), id: String(i), note: `Ability ${candidate.abilityIndex + 1} · ${candidate.eddieCost} €$${candidate.spendsCard ? ' · spends card' : ''}`,
          }))), ...(ability ? paymentFields(id, `${ability.cardId}:${ability.abilityIndex}`) : [])];
        }, (p) => {
          const { cardId, abilityIndex } = abilities[Number(one(p, 'ability'))];
          return { cardId, abilityIndex, ...paymentArgs(p) };
        }));
        break;
      }
      case 'sellCard': actions.push(select(id, 'Sell for an Eddie', spec.candidates as string[], 'cardId')); break;
      case 'callLegend':
      case 'goSolo': {
        const calling = id === 'callLegend';
        const label = calling ? 'Call a Legend' : 'Go solo';
        actions.push(form(id, label, (p) => [
          field('card', label, options(spec.candidates as string[])),
          ...(one(p, 'card') ? paymentFields(id, calling ? 'action' : one(p, 'card')) : []),
        ], (p) => ({ [calling ? 'legendId' : 'cardId']: one(p, 'card'), ...paymentArgs(p) })));
        break;
      }
      case 'attackRival': actions.push(select(id, 'Attack the rival', spec.candidates as string[], 'attackerId')); break;
      case 'useBlocker': actions.push(select(id, 'Block the attack', spec.candidates as string[], 'blockerId')); break;
      case 'keepHand': actions.push(direct(id, 'Keep hand')); break;
      case 'mulligan': actions.push(direct(id, 'Mulligan', undefined, 'Shuffle this hand back and draw six new cards.')); break;
      case 'passPhase': actions.push(direct(id, 'End turn')); break;
      case 'resolveAttack': actions.push(direct(id, view.attackState?.step === 'react' ? 'Pass reaction' : 'Continue combat', { pass: true })); break;
    }
  }
  return actions;
}
