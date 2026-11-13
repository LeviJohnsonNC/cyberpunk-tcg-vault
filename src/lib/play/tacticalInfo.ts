import { isReady, type MatchActionForm, type Picks } from './matchActions';
import { visibleCards, zoneCards } from './matchView';
import type { CardView, PlayerView } from './protocol';

const signed = (value: number) => `${value >= 0 ? '+' : '−'} ${Math.abs(value)}`;

/** Explain only visible contributors. Never reverse-engineer hidden or permanent effects. */
export function powerExplanation(card: CardView, cards: CardView[]) {
  if (!card.definitionId || card.type === 'gear' || card.type === 'program') return;
  const gear = cards.filter((item) => item.definitionId && item.attachedToId === card.instanceId &&
    (item.zone === card.zone || (card.type === 'legend' && item.zone === 'field')));
  const gearPower = gear.reduce((sum, item) => sum + item.power, 0);
  const modifiers = (card.activeEffects ?? []).filter((effect) => effect.effectKind === 'powerModifier');
  const multipliers = (card.activeEffects ?? []).filter((effect) => effect.effectKind === 'powerMultiplier');
  const delta = modifiers.reduce((sum, effect) => sum + Number(effect.modifierLabel), 0);
  const multiplier = multipliers.reduce((product, effect) => product * Number(effect.modifierLabel?.replace(/^x/, '')), 1);
  const calculated = Math.max(0, (card.power + gearPower + delta) * multiplier);
  const parts = [`Base ${card.power}`, ...(gearPower ? [`${signed(gearPower)} Gear`] : []),
    ...modifiers.map((effect) => `${signed(Number(effect.modifierLabel))} ${effect.sourceName}`)];
  // The projection may omit a permanent modifier or include a conditional effect.
  // In that case show the known base and equipment, never a misleading equation.
  const exact = Number.isFinite(calculated) && calculated === card.effectivePower;
  const sum = parts.join(' ');
  return { exact, gear, text: exact
    ? `${multiplier !== 1 ? `(${sum}) × ${multiplier}` : sum}${(card.power + gearPower + delta) * multiplier < 0 ? ' (minimum 0)' : ''} = ${card.effectivePower}`
    : `Base ${card.power}${gearPower ? ` · Gear ${signed(gearPower)}` : ''} · Current ${card.effectivePower}` };
}

/** A selected source is not necessarily the first choice (which can be payment or a target). */
export function decisionSource(view: PlayerView, action: MatchActionForm, picks: Picks, cards: CardView[]) {
  const payload = view.prompt.choice?.payload as { source?: { cardId?: string } } | undefined;
  if (payload?.source?.cardId) return cards.find((card) => card.instanceId === payload.source!.cardId && card.definitionId);
  const field = action.fields(picks).find((item) => ['card', 'ability', 'attacker'].includes(item.id));
  const id = field?.options.find((option) => picks[field.id]?.includes(option.id))?.cardId;
  return cards.find((card) => card.instanceId === id);
}

/** Use the public Gig zones to identify the owner, even after a Gig is stolen. */
export function gigAdjustmentTarget(view: PlayerView, dieId: unknown) {
  for (const seat of ['player', 'rival'] as const) {
    const player = view.players[seat];
    const gigs = zoneCards(player, 'gigArea');
    const die = gigs.find(card => card.instanceId === dieId);
    if (die) {
      const total = gigs.reduce((sum, gig) => sum + gig.power, 0);
      return { seat, die, streetCred: total === player.streetCred ? total : undefined };
    }
  }
}

/** Exact payment balance, before card effects or subsequent costs. Not a simulated outcome. */
export function paymentPreview(view: PlayerView, action: MatchActionForm, picks: Picks) {
  const payment = view.prompt.payment;
  if (!payment?.costs[action.id]) return;
  const fields = action.fields(picks);
  if (!isReady(fields.filter((field) => field.id !== 'payment'), picks)) return;
  const args = action.move(picks).args ?? {};
  const key = action.id === 'callLegend' || action.id === 'resolveRedirectDefeat' ? 'action'
    : action.id === 'activateAbility' ? `${args.cardId}:${args.abilityIndex}` : String(args.cardId);
  const cost = payment.costs[action.id]?.[key];
  if (!cost) return;
  const selected = picks.payment ?? [];
  const legends = new Set(payment.legendIds);
  const reserved = (cost.reservedLegendIds ?? []).filter((id) => legends.has(id));
  const ready = isReady(fields, picks);
  const sources = fields.find((field) => field.id === 'payment')?.options.filter((option) => selected.includes(option.id)) ?? [];
  const names = visibleCards(view);
  return { amount: cost.amount, ready,
    afterPayment: Math.max(0, view.players.player.availableEddies - cost.amount),
    sources: sources.map((source) => ({ ...source, legend: legends.has(source.id) })),
    reserved: reserved.map((id) => names.find((card) => card.instanceId === id)?.cardName ?? 'Legend slot'),
    // Separate this consequence from the payment balance; avoid implying that effects are forecast.
    afterCosts: Math.max(0, view.players.player.availableEddies - cost.amount - reserved.length),
  };
}

export interface PreviewRect { left: number; top: number; width: number; height: number }
/** Find a readable close-up that does not cover the hand, decision controls or eligible targets. */
export function previewPosition(anchor: PreviewRect, viewport: { width: number; height: number }, blocked: PreviewRect[]) {
  if (viewport.height < 480) return;
  for (const { width, height, landscape } of [{ width: 286, height: 464, landscape: false }, { width: 440, height: 330, landscape: true }]) {
    const margin = 12;
    const clampX = (x: number) => Math.max(margin, Math.min(viewport.width - width - margin, x));
    const clampY = (y: number) => Math.max(margin, Math.min(viewport.height - height - margin, y));
    if (viewport.width < width + 2 * margin || viewport.height < height + 2 * margin) continue;
    const positions = [
      { x: clampX(anchor.left + anchor.width + margin), y: clampY(anchor.top) },
      { x: clampX(anchor.left - width - margin), y: clampY(anchor.top) },
      { x: clampX(anchor.left + anchor.width / 2 - width / 2), y: clampY(anchor.top - height - margin) },
      { x: viewport.width - width - margin, y: margin }, { x: margin, y: margin },
    ];
    const position = positions.find(({ x, y }) => ![anchor, ...blocked].some((rect) =>
      x < rect.left + rect.width + 4 && x + width + 4 > rect.left && y < rect.top + rect.height + 4 && y + height + 4 > rect.top));
    if (position) return { ...position, landscape };
  }
}
