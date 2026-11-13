import { BY_SLUG, fitsRam, ramLimits, type Card } from '../data';
import { COPY_MAX, MAIN_MAX, MAIN_MIN, legendNames, validate } from '../decks';
import type { Deck } from '../store';
import type { CampaignRun } from './campaign';
import { isEngineSupported } from './engineCards';

export function campaignCrew(legends: string[]) {
  const colours = [...new Set(legends.flatMap(slug => {
    const card = BY_SLUG.get(slug);
    return card?.type === 'Legend' ? [card.color] : [];
  }))];
  return { colours, ram: ramLimits(legends) };
}

export function campaignCardFit(card: Card, crew: ReturnType<typeof campaignCrew>) {
  if (card.legal !== 'legal' || !isEngineSupported(card.slug)) return 'Unavailable in Campaign';
  if (card.type === 'Legend') return 'Legends go in your crew';
  if (!crew.colours.includes(card.color)) return `Needs a ${card.color} Legend`;
  if (!fitsRam(card, crew.ram)) return `Needs ${card.ram} ${card.color} RAM · crew provides ${crew.ram[card.color] ?? 0}`;
}

export function isCampaignLegend(card: Card) {
  return card.type === 'Legend' && card.legal === 'legal' && isEngineSupported(card.slug);
}

export function campaignLegendIssue(run: CampaignRun, legends: string[]) {
  if (legends.length !== 3 || legendNames(legends).size !== 3) return 'Choose three different Legends by name.';
  for (const slug of legends) {
    const card = BY_SLUG.get(slug)!;
    if (!isCampaignLegend(card)) return `${card.display} is unavailable in Campaign.`;
    if (!(run.inventory[slug] > 0)) return `${card.display} is not in your campaign reserve.`;
  }
}

export function campaignDeckIssues(run: CampaignRun, deck: Deck): string[] {
  const validation = validate(deck);
  const issues = [...validation.issues];
  const crew = campaignCrew(deck.legends);
  const legendIssue = campaignLegendIssue(run, deck.legends);
  if (legendIssue) issues.push(legendIssue);
  if (Object.values(deck.sideboard).some(qty => qty > 0)) issues.push('Campaign sideboards are not available.');
  for (const [slug, qty] of Object.entries(deck.cards)) {
    if (!qty) continue;
    const card = BY_SLUG.get(slug);
    if (card && card.legal === 'legal' && card.type !== 'Legend') {
      if (!isEngineSupported(slug)) issues.push(`${card.display} is unavailable in Campaign.`);
      else if (!crew.colours.includes(card.color)) issues.push(`${card.display} needs a ${card.color} Legend.`);
    }
    if (qty > (run.inventory[slug] ?? 0)) issues.push(`You have only ${run.inventory[slug] ?? 0} copies of ${card?.display ?? slug}.`);
  }
  return issues;
}

export function campaignCardAddReason(run: CampaignRun, card: Card, crew: ReturnType<typeof campaignCrew>, total: number) {
  const used = run.deck.cards[card.slug] ?? 0;
  return campaignCardFit(card, crew)
    ?? (used >= COPY_MAX ? `${COPY_MAX}-copy limit reached`
      : used >= (run.inventory[card.slug] ?? 0) ? 'All owned copies are in the deck'
        : total >= MAIN_MAX ? `Deck is at ${MAIN_MAX} cards` : undefined);
}

export function previewCampaignCrew(run: CampaignRun, legends: string[]) {
  const before = campaignCrew(run.deck.legends), after = campaignCrew(legends);
  const issue = campaignLegendIssue(run, legends);
  const deck = { ...run.deck, legends: [...legends], cards: { ...run.deck.cards } };
  const removed: { slug: string; copies: number; reason: string }[] = [];
  if (!issue) for (const [slug, copies] of Object.entries(deck.cards)) {
    if (copies <= 0) continue;
    const card = BY_SLUG.get(slug);
    const reason = card ? campaignCardFit(card, after) : 'Unavailable in Campaign';
    if (reason) {
      removed.push({ slug, copies, reason });
      delete deck.cards[slug];
    }
  }
  return { before, after, issue, deck, removed };
}

export function campaignDeckSizeIssue(total: number) {
  return total < MAIN_MIN ? `Needs ${MAIN_MIN - total} more ${MAIN_MIN - total === 1 ? 'card' : 'cards'}`
    : total > MAIN_MAX ? `Remove ${total - MAIN_MAX} ${total - MAIN_MAX === 1 ? 'card' : 'cards'}` : undefined;
}
