import { directStealPotential, isReadyBlocker, pairCount, type EngineCardView } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { vaultCard } from './cardDisplay';
import { printedAbility } from './engineSession';
import { zoneCards, zoneCount } from './matchView';
import type { CardView, PlayerView } from './protocol';

const gigs = (n: number) => `${n} ${n === 1 ? 'Gig' : 'Gigs'}`;
const hints = (card: CardView) => (card as Partial<EngineCardView>).abilityHints ?? [];
const baseSteal = (card: CardView) => directStealPotential(card.effectivePower, card.grantedRules?.includes('stealsOneFewerGig'));
const steal = (view: PlayerView, attacker: CardView) => Math.min(view.players.rival.gigCount, baseSteal(attacker));

export function canAttackGigs(view: PlayerView, id: unknown) {
  const candidates = view.prompt.availableMoves.find(m => m.moveId === 'attackRival')?.inputSpec.candidates;
  return Array.isArray(candidates) && candidates.includes(id);
}

function attackEffects(view: PlayerView, attacker: CardView) {
  const gear = zoneCards(view.players.player, 'field').filter(c => c.attachedToId === attacker.instanceId);
  return [attacker, ...gear].flatMap(source => hints(source)
    .filter(h => source === attacker ? h.timing === 'attack' : h.event === 'cardSpent')
    .map(hint => ({ source, hint })));
}

export function attackReason(view: PlayerView, attacker: CardView) {
  const rival = view.players.rival;
  const amount = steal(view, attacker);
  const dice = zoneCards(rival, 'gigArea');
  const target = dice.length === 1 ? `the rival’s only Gig (${dice[0].definitionId} showing ${dice[0].effectivePower})` : gigs(amount);
  const hit = amount ? `At ${attacker.effectivePower} power, the unblocked attack can steal ${target} if no effect changes the result.`
    : `At ${attacker.effectivePower} power, the base steal is zero. Declaring the attack can still trigger card abilities.`;
  const own = view.players.player.gigCount;
  if (own < 7 && own + amount >= 7)
    return hit + (view.overtimeActive ? ' Taking the majority in overtime would win immediately.' : ' Reaching seven puts you in position to win if you start your turn with that many.');
  const info = attackEffects(view, attacker).some(({ hint }) =>
    hint.effects.some(e => ['lookAt', 'scry', 'searchDeck'].includes(e)));
  return info && view.players.player.availableEddies > 0
    ? `${hit} Attack with ${view.players.player.availableEddies} €$ available so you can act on what you learn.` : hit;
}

export function stealReason(view: PlayerView, ids: readonly string[]) {
  const rivalDice = zoneCards(view.players.rival, 'gigArea');
  const selected = rivalDice.filter(d => ids.includes(d.instanceId));
  const values = selected.map(d => d.effectivePower);
  const cred = values.reduce((sum, value) => sum + value, 0);
  const lines = [`If the steal resolves, you gain ${gigs(selected.length)} and ${cred} Street Cred. The rival loses the same amount.`];
  for (const seat of ['player', 'rival'] as const) {
    const player = view.players[seat];
    const before = zoneCards(player, 'gigArea').map(d => d.effectivePower);
    const after = seat === 'player' ? [...before, ...values] : rivalDice.filter(d => !ids.includes(d.instanceId)).map(d => d.effectivePower);
    if (pairCount(before) === pairCount(after)) continue;
    const cards = [...zoneCards(player, 'legendArea'), ...zoneCards(player, 'field')].filter(c => !c.faceDown);
    const source = cards.find(c => hints(c).some(h => h.timing !== 'play' && h.effects.includes('forEachFriendlyGigPair') && h.effects.includes('draw')));
    if (source) {
      const who = seat === 'player' ? 'your' : 'the rival’s';
      lines.push(`That changes the number of pairs for ${who} ${source.cardName} draw effect from ${pairCount(before)} to ${pairCount(after)}.`);
    }
  }
  return lines.join(' ');
}

function spendDraw(view: PlayerView, gear: CardView) {
  const hint = hints(gear).find(h => h.event === 'cardSpent' && h.effects.includes('draw'));
  const need = hint?.conditionThresholds.find(t => t.condition === 'hasDistinctGigValues')?.minCount;
  if (!hint || !need) return '';
  const dice = zoneCards(view.players.player, 'gigArea');
  const adjustment = hint.effects.includes('adjustGig') ? `${gear.cardName} can adjust a Gig. ` : '';
  if (dice.length < need)
    return `${adjustment}Its draw needs ${need} different friendly values before the steal, when you own only ${gigs(dice.length)}.`;
  if (new Set(dice.map(d => d.effectivePower)).size >= need)
    return `You already have ${need} different friendly Gig values. With ${gear.cardName} equipped, preserve those values to draw when the host is spent, before the steal.`;
  return `${gear.cardName}’s draw depends on having ${need} different friendly Gig values when the spend effect resolves, before the steal.`;
}

export function equipmentReason(view: PlayerView, next: PlayerView, gear: CardView, host: CardView, equipped: CardView) {
  const power = host.effectivePower === equipped.effectivePower ? `Equip ${host.cardName} to use ${gear.cardName}’s ability.`
    : `${gear.cardName} takes ${host.cardName} from ${host.effectivePower} to ${equipped.effectivePower} power.`;
  if (!canAttackGigs(next, host.instanceId)) return power;
  const extra = steal(view, host) < steal(next, equipped)
    ? `A clean hit can now take ${gigs(steal(next, equipped))}.` : '';
  const peek = hints(gear).some(h => h.event === 'cardSpent' && h.effects.includes('lookAt')) &&
    zoneCards(view.players.player, 'legendArea').some(c => c.faceDown)
    ? 'Spending the attacker also gives you a chance to inspect a face-down Legend.' : '';
  return [power, extra, peek || spendDraw(view, gear)].filter(Boolean).join(' ');
}

function futureHost(view: PlayerView, gear: CardView) {
  // Limit the illustration to unrestricted Gear and a printed Unit with no
  // abilities of its own. Future affordability and remaining Gigs are conditional.
  if (gear.power <= 0 || !vaultCard(gear)?.text.startsWith('(Equip to a friendly Unit or face-up Legend.)')) return '';
  const host = zoneCards(view.players.player, 'hand').filter(c => c.type === 'unit' &&
    !hints(c).length && directStealPotential(c.power + gear.power) > directStealPotential(c.power))
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
  if (!host) return '';
  const power = host.power + gear.power;
  return `If you develop ${host.cardName} later, this Gear could take it from ${host.power} to ${power} power. A clean hit could then steal ${gigs(directStealPotential(power))} if the rival has that many.`;
}

/** Both views are legal pre-attack positions on either side of the same purchase. */
export function compareEquipment(bare: PlayerView, equipped: PlayerView, hostId: string, gear: CardView, buy: boolean) {
  const before = zoneCards(bare.players.player, 'field').find(c => c.instanceId === hostId)!;
  const after = zoneCards(equipped.players.player, 'field').find(c => c.instanceId === hostId)!;
  const first = steal(bare, before), second = steal(equipped, after);
  const swing = first === second
    ? `Equipping leaves the base steal at ${gigs(first)} even at ${after.effectivePower} power.`
    : `At ${before.effectivePower} power the base steal is ${gigs(first)}. At ${after.effectivePower} power it is ${gigs(second)} on a clean hit.`;
  const cash = `You have ${bare.players.player.availableEddies} €$ available if you attack first and ${equipped.players.player.availableEddies} €$ if you equip first.`;
  const draw = spendDraw(bare, gear);
  return [swing, cash, draw, !buy && first === second && futureHost(bare, gear)].filter(Boolean).join(' ');
}

export function afterAttack(view: PlayerView, attacker: CardView) {
  const callCost = view.prompt.availableMoves.some(m => m.moveId === 'callLegend') &&
    view.prompt.payment?.costs.callLegend?.action?.amount;
  const lines = attackEffects(view, attacker).flatMap(({ source, hint }) => {
    const text = printedAbility(source, hint.abilityIndex)?.replace(/^\{Attack\}\s*/i, '').replace(/\{([^{}]+)\}/g, '$1');
    if (!text) return [];
    const rule = text.replace(/^When this (?:Unit or Legend|Unit|Legend) is spent, /i, '');
    let line = `${source.cardName} triggers ${source === attacker ? 'on attack' : 'when the attacker is spent'}. ${rule.charAt(0).toUpperCase()}${rule.slice(1)}`;
    if (hint.effects.includes('lookAt') && hint.effects.includes('callLegend') && callCost)
      line += ` If the free Call does not apply, you could pay ${callCost} €$ after combat if you still have your Call for the turn.`;
    return [line];
  }).slice(0, 4);
  const rival = view.players.rival;
  const blockers = zoneCards(rival, 'field').filter(isReadyBlocker);
  const cards = zoneCount(rival, 'hand');
  if (blockers.length && !attacker.grantedRules?.includes('cantBeBlocked'))
    lines.push(`${blockers[0].cardName} is ready and could block. If the attack is redirected, compare the two Units’ power before committing a response.`);
  else if (cards)
    lines.push(`The rival has ${rival.availableEddies} €$ available and ${cards} ${cards === 1 ? 'card' : 'cards'} in hand. Check what they actually play before counting the result of combat.`);
  return lines;
}
