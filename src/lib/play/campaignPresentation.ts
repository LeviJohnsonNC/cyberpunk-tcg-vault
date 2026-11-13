import { BY_SLUG } from '../data';
import { totalCopies } from '../deckDraft';
import { MAIN_MIN } from '../decks';
import { campaignCardAddReason, campaignCardFit, campaignCrew } from './campaignDeckRules';
import { campaignPulls, RETRY_PACK_SIZE, type CampaignPull } from './campaignPack';
import { campaignClearedCount, campaignDeckIssues, makeStarterDeck, pendingCampaignPack, type CampaignRun } from './campaign';

export const CAMPAIGN_ACTS = [
  { title: 'A foot in the door.', kicker: 'Act I / The invitation', text: 'Start with a crew. Leave with a reputation.', room: 'booth' },
  { title: 'Above the noise.', kicker: 'Act II / The climb', text: 'Three tables down. The city is opening up, and the next crews have sharper answers.', room: 'rooftop' },
  { title: 'Take their seat.', kicker: 'Act III / The takeover', text: 'Six tables down. Three stand between your crew and the best room in the house.', room: 'arasaka' },
] as const;

export function needsActBriefing(run: CampaignRun) {
  return run.phase === 'upgrading' && (run.encounter === 3 || run.encounter === 6)
    && (run.briefedAct ?? 0) < Math.floor(run.encounter / 3);
}

export function latestCampaignReward(run: CampaignRun) {
  return pendingCampaignPack(run) ?? run.latestRetry
    ?? run.rewards[run.phase === 'claimingFinish' || run.phase === 'completed' ? run.encounter : run.encounter - 1];
}

export function latestPack(run: CampaignRun): CampaignPull[] {
  const pack = latestCampaignReward(run);
  return pack ? [...campaignPulls(pack), ...(pack.choice ? [{ slug: pack.choice }] : [])] : [];
}

/** A proposed edit only. Storage still authorizes and commits the whole deck atomically. */
export function previewCampaignEdit(run: CampaignRun, incoming: string, outgoing?: string) {
  const card = BY_SLUG.get(incoming);
  const deck = structuredClone(run.deck);
  if (!card || !(run.inventory[incoming] > 0)) return { deck, issues: ['This card is not in your campaign reserve.'] };
  if (incoming === outgoing) return { deck, issues: ['Choose a different card to return to reserve.'] };
  if (card.type === 'Legend') return { deck, issues: ['Manage Legends to change your crew.'] };
  if (outgoing) {
    if (!(deck.cards[outgoing] > 0)) return { deck, issues: ['That card is no longer in your main deck.'] };
    if (--deck.cards[outgoing] === 0) delete deck.cards[outgoing];
  }
  const addReason = campaignCardAddReason(run, card, campaignCrew(deck.legends), totalCopies(deck.cards));
  if (addReason) return { deck: run.deck, issues: [addReason] };
  deck.cards[incoming] = (deck.cards[incoming] ?? 0) + 1;
  const issues = campaignDeckIssues(run, deck);
  // The editor can save incremental improvements while the deck is under construction.
  const priorIssues = new Set(campaignDeckIssues(run, run.deck));
  const blockers = issues.filter(issue => !priorIssues.has(issue) && !issue.startsWith('Main deck must be'));
  return { deck, issues, canSave: !blockers.length && totalCopies(deck.cards) >= Math.min(MAIN_MIN, totalCopies(run.deck.cards)) };
}

export function packCardContext(run: CampaignRun, slug: string) {
  const card = BY_SLUG.get(slug);
  if (!card) return 'Card details unavailable.';
  if (card.type === 'Legend') return `${card.color} crew option · ${card.ram ?? 0} RAM`;
  const fit = campaignCardFit(card, campaignCrew(run.deck.legends));
  if (fit) return fit;
  const used = run.deck.cards[slug] ?? 0;
  return used ? `${used} already in your deck` : 'Fits your crew';
}

/** Derived from saved inventory and the actual finished list, never simulated match statistics. */
export function campaignRecap(run: CampaignRun) {
  const starter = makeStarterDeck(run.starter);
  const additions = Object.entries(run.deck.cards)
    .map(([slug, count]) => ({ slug, count: Math.max(0, count - (starter.cards[slug] ?? 0)) }))
    .filter(item => item.count > 0).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  const recruits = run.deck.legends.filter(slug => !starter.legends.includes(slug));
  const packs = Object.values(run.rewards);
  return { additions, recruits, changedCopies: additions.reduce((sum, item) => sum + item.count, 0),
    packs: packs.length + (run.retryPacks ?? 0), earnedCopies: packs.reduce((sum, pack) => sum + pack.cards.length + (pack.choice ? 1 : 0), (run.retryPacks ?? 0) * RETRY_PACK_SIZE),
    clears: campaignClearedCount(run) };
}
