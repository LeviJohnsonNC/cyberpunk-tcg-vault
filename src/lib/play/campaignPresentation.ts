import { BY_SLUG, fitsRam, ramLimits } from '../data';
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

export function latestPack(run: CampaignRun): CampaignPull[] {
  const pack = pendingCampaignPack(run) ?? run.latestRetry
    ?? run.rewards[run.phase === 'claimingFinish' || run.phase === 'completed' ? run.encounter : run.encounter - 1];
  return pack ? [...campaignPulls(pack), ...(pack.choice ? [{ slug: pack.choice }] : [])] : [];
}

/** A proposed edit only. Storage still authorizes and commits the whole deck atomically. */
export function previewCampaignEdit(run: CampaignRun, incoming: string, outgoing?: string) {
  const card = BY_SLUG.get(incoming);
  const deck = structuredClone(run.deck);
  if (!card || !(run.inventory[incoming] > 0)) return { deck, issues: ['This card is not in your campaign reserve.'] };
  if (incoming === outgoing) return { deck, issues: ['Choose a different card to return to reserve.'] };
  if (card.type === 'Legend') {
    const prior = BY_SLUG.get(outgoing ?? '');
    if (!outgoing || !deck.legends.includes(outgoing) || prior?.color !== card.color)
      return { deck, issues: ['Choose a crew member of the same colour.'] };
    deck.legends = deck.legends.map(slug => slug === outgoing ? incoming : slug);
  } else {
    if (outgoing) {
      if (!(deck.cards[outgoing] > 0)) return { deck, issues: ['That card is no longer in your main deck.'] };
      if (--deck.cards[outgoing] === 0) delete deck.cards[outgoing];
    }
    deck.cards[incoming] = (deck.cards[incoming] ?? 0) + 1;
  }
  return { deck, issues: campaignDeckIssues(run, deck) };
}

export function packCardContext(run: CampaignRun, slug: string) {
  const card = BY_SLUG.get(slug);
  if (!card) return 'Card details unavailable.';
  if (!run.deck.legends.some(legend => BY_SLUG.get(legend)?.color === card.color)) return `Outside your starter’s colours · ${card.color}`;
  if (card.type === 'Legend') return `${card.color} crew option · ${card.ram ?? 0} RAM`;
  const fits = fitsRam(card, ramLimits(run.deck.legends));
  const used = run.deck.cards[slug] ?? 0;
  return `${used ? `${used} already in your deck` : 'New option for your deck'} · ${fits ? 'Fits your crew’s RAM' : `Needs ${card.ram ?? 0} ${card.color} RAM`}`;
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
