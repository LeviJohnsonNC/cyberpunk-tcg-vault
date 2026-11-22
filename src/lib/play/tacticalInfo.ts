import type { MatchActionForm, Picks } from './matchActions';
import { zoneCards } from './matchView';
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

export interface PreviewRect { left: number; top: number; width: number; height: number }

const previewGap = 8;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function cardPreviewStatus(card: CardView) {
  if (!card.definitionId || card.zone === 'eddieArea') return [];
  const labels: string[] = [];
  if (card.effectiveCost != null && card.cost != null && card.effectiveCost !== card.cost) labels.push(`Cost ${card.effectiveCost} €$`);
  if ((card.type === 'unit' || card.type === 'legend') && card.effectivePower !== card.power) labels.push(`Power ${card.effectivePower}`);
  if (card.spent) labels.push('Spent');
  if (card.hasLag) labels.push('Lag');
  if (card.damage) labels.push(`${card.damage} damage`);
  return labels;
}

/** Bounds are the visible table, or the hand lane below the command bar. */
export function cardPreviewPosition(anchor: PreviewRect, bounds: PreviewRect, preferredWidth: number,
  inHand: boolean, statusCount: number, blocked: PreviewRect[], pieces: PreviewRect[]) {
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
  const anchorRight = anchor.left + anchor.width, anchorBottom = anchor.top + anchor.height;
  const middle = anchor.left + anchor.width / 2, centerY = anchor.top + anchor.height / 2;
  const footer = Math.ceil(statusCount / 2) * 20;
  const baseline = Math.min(bottom, anchorBottom);
  const maxHeight = inHand ? baseline - bounds.top : bounds.height;
  const maxWidth = Math.floor(Math.min(preferredWidth, bounds.width, (maxHeight - footer) * 5 / 7));
  // Below this threshold the close-up adds little legibility. Details remains available.
  const minWidth = Math.max(inHand ? 144 : 120, Math.ceil(anchor.width * 1.25));

  for (let width = maxWidth; width >= minWidth; width--) {
    const height = width * 7 / 5 + footer;

    if (inHand) {
      const x = clamp(middle - width / 2, bounds.left, right - width);
      const y = baseline - height;
      const obstructed = blocked.some(r => x < r.left + r.width + previewGap && x + width + previewGap > r.left &&
        y < r.top + r.height + previewGap && y + height + previewGap > r.top);
      if (!obstructed) return { x, y, width, height };
      continue;
    }

    // Stay alongside the source. Its nearest usable space may start just past a target.
    const leftX = anchor.left - previewGap - width, rightX = anchorRight + previewGap;
    const xs = new Set([leftX, rightX, ...blocked.flatMap(r => [r.left - previewGap - width, r.left + r.width + previewGap])]);
    const idealY = centerY - height / 2;
    let best: { x: number; y: number; score: number } | undefined;
    for (const x of xs) {
      const sideGap = x >= rightX ? x - rightX : leftX - x;
      if (x < bounds.left || x + width > right || sideGap < 0 || sideGap > preferredWidth) continue;

      // Find the clear vertical strip alongside the source, then center the art within it.
      let top = bounds.top, floor = bottom;
      for (const r of blocked) {
        if (x >= r.left + r.width + previewGap || x + width + previewGap <= r.left) continue;
        if (r.top + r.height + previewGap <= centerY) top = Math.max(top, r.top + r.height + previewGap);
        else floor = Math.min(floor, r.top - previewGap);
      }
      if (floor < centerY || floor - top < height) continue;
      const y = clamp(idealY, top, floor - height);
      const covered = pieces.reduce((area, r) => area +
        Math.max(0, Math.min(x + width, r.left + r.width) - Math.max(x, r.left)) *
        Math.max(0, Math.min(y + height, r.top + r.height) - Math.max(y, r.top)), 0);
      const room = x >= rightX ? right - anchorRight : anchor.left - bounds.left;
      const score = covered / width + sideGap + Math.abs(y - idealY) * .25 - Math.min(room, preferredWidth * 2) * .01;
      if (!best || score < best.score) best = { x, y, score };
    }
    if (best) return { x: best.x, y: best.y, width, height };
  }
}

/** Effect options also carry a rules excerpt and have their own compact layouts. */
export function effectPreviewPosition(anchor: PreviewRect, viewport: { width: number; height: number }, blocked: PreviewRect[],
  sizes: { width: number; height: number; landscape: boolean }[]) {
  for (const { width, height, landscape } of sizes) {
    const margin = 12;
    const clampX = (x: number) => Math.max(margin, Math.min(viewport.width - width - margin, x));
    const clampY = (y: number) => Math.max(margin, Math.min(viewport.height - height - margin, y));
    if (viewport.width < width + 2 * margin || viewport.height < height + 2 * margin) continue;
    const centerX = clampX(anchor.left + (anchor.width - width) / 2);
    const alongsideY = clampY(anchor.top + anchor.height - height);
    const positions = [
      { x: clampX(anchor.left + anchor.width + margin), y: clampY(anchor.top) },
      { x: clampX(anchor.left - width - margin), y: clampY(anchor.top) },
      { x: centerX, y: clampY(anchor.top - height - margin) },
      ...blocked.flatMap(rect => [
        { x: clampX(rect.left - width - margin), y: alongsideY },
        { x: clampX(rect.left + rect.width + margin), y: alongsideY },
        { x: centerX, y: clampY(rect.top - height - margin) },
        { x: centerX, y: clampY(rect.top + rect.height + margin) },
      ]),
      { x: viewport.width - width - margin, y: margin }, { x: margin, y: margin },
    ];
    const position = positions.find(({ x, y }) => ![anchor, ...blocked].some((rect) =>
      x < rect.left + rect.width + 4 && x + width + 4 > rect.left && y < rect.top + rect.height + 4 && y + height + 4 > rect.top));
    if (position) return { ...position, width, height, landscape };
  }
}
