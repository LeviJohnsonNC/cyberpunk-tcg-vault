import { BY_SLUG, type Card } from '../data';
import { rating } from '../autobuild';
import { COPY_MAX } from '../decks';
import type { CampaignRun } from './campaign';
import { campaignCardFit, campaignCrew } from './campaignDeckRules';

type RematchRole = 'cheap-threat' | 'low-cost-answer';
export const HOSTILE_TAKEOVER_REWARDS = {
  'the-heist': ['offduty-malfini', 'dexter-deshawn-one-last-chance', 'gilded-mato-n', 'maelstrom-goons'],
  'embracing-power': ['meredith-stout-stone-cold-corpo', 'emergency-atlus', 'swordwise-huscle', 'valentino-guerrera'],
} as const;
const pressureCards = new Set(['dexter-deshawn-one-last-chance', 'maelstrom-goons', 'gilded-mato-n', 'offduty-malfini',
  'psycho-squad', 'swordwise-huscle', 'emergency-atlus', 'valentino-guerrera', 'meredith-stout-stone-cold-corpo']);
const interactionCards = new Set(['detonate', 'nocturne-op55-n1', 'pyramid-song', 'safety-override', 'memory-relapse', 'take-control']);
const sweepers = new Set(['towerfall', 'don-t-fear-the-reaper']);

function rematchRole(card: Card): RematchRole | undefined {
  if (card.type === 'Unit' && (card.cost ?? Infinity) <= 4 && (card.power ?? 0) >= 3
      && !card.text.includes("can't attack") && !card.text.includes('only attack rival Units')) return 'cheap-threat';
  if (card.sellable && (card.cost ?? Infinity) <= 4 && (interactionCards.has(card.slug)
    || card.type === 'Program' && rating(card.slug).roles.includes('removal') && !card.text.includes('fight'))) return 'low-cost-answer';
}

/** One-for-one proposals from the current reserve. The Workbench still confirms and saves the edit. */
export function hostileTakeoverSwaps(run: CampaignRun) {
  if (!run.latestRetry || !run.attempts) return [];
  const crew = campaignCrew(run.deck.legends);
  const lastPack = new Set([...run.latestRetry.cards, run.latestRetry.choice]);
  const deckCards = Object.keys(run.deck.cards).filter(slug => run.deck.cards[slug] > 0).map(slug => BY_SLUG.get(slug)!);
  const available = Object.keys(run.inventory)
    .filter(slug => (run.deck.cards[slug] ?? 0) < Math.min(run.inventory[slug], COPY_MAX))
    .map(slug => BY_SLUG.get(slug))
    .filter((card): card is Card => !!card && !campaignCardFit(card, crew));
  const proposals: { incoming: string; outgoing: string; reason: string }[] = [];
  if (run.starter === 'the-heist' && run.deck.cards['heywood-ripperdoc'] > 0) {
    const [malfini, ...heistPressure] = HOSTILE_TAKEOVER_REWARDS['the-heist'];
    if (available.some(card => card.slug === malfini)) {
      proposals.push({ incoming: malfini, outgoing: 'heywood-ripperdoc', reason: 'Spend one of Splice’s attackers while adding a 5-power Unit.' });
      const followup = heistPressure.find(slug => available.some(card => card.slug === slug));
      if (followup && run.deck.cards['lizzy-wizzy-delicate-weapon'] > 0) {
        proposals.push({ incoming: followup, outgoing: 'lizzy-wizzy-delicate-weapon', reason: 'Add another attacker after Splice targets your first one.' });
      }
    }
  }
  if (proposals.length === 2) return proposals;

  const general = (['cheap-threat', 'low-cost-answer'] as const).flatMap(role => {
    const incomingOptions = available.filter(card => rematchRole(card) === role && !proposals.some(swap => swap.incoming === card.slug)).sort((a, b) =>
      Number(pressureCards.has(b.slug) || interactionCards.has(b.slug)) - Number(pressureCards.has(a.slug) || interactionCards.has(a.slug))
      || Number(lastPack.has(b.slug)) - Number(lastPack.has(a.slug))
      || rating(b.slug).power - rating(a.slug).power || (a.cost ?? 0) - (b.cost ?? 0) || a.slug.localeCompare(b.slug));
    for (const incoming of incomingOptions) {
      const outgoing = deckCards.filter(card => card.slug !== incoming.slug && card.sellable === incoming.sellable
        && !proposals.some(swap => swap.outgoing === card.slug)
        && rematchRole(card) !== role && !sweepers.has(card.slug)
        && ((card.cost ?? 0) > (incoming.cost ?? 0) && (card.type === 'Unit') === (incoming.type === 'Unit')
          || role === 'cheap-threat' && card.type === 'Unit' && (card.power ?? 0) === 0 && (run.deck.cards[card.slug] ?? 0) > 1
          || role === 'low-cost-answer' && card.type === 'Gear' && (run.deck.cards[card.slug] ?? 0) > 1))
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || rating(a.slug).power - rating(b.slug).power || a.slug.localeCompare(b.slug))[0];
      if (outgoing) return [{ incoming: incoming.slug, outgoing: outgoing.slug,
        reason: role === 'cheap-threat' ? 'Get another attacker on the field after Splice removes one.'
          : 'Answer a threat while leaving more Eddies to rebuild.' }];
    }
    return [];
  });
  return [...proposals, ...general].slice(0, 2);
}
