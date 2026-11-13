import { BY_SLUG, CARDS, PRINTING_INDEX, defaultPrinting, type Printing } from '../data';
import type { CampaignReward } from './campaign';

const retail = 'Welcome to Night City — Retail';
const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Secret', 'Iconic Other', 'Iconic Legend', 'Iconic Secret'];
const rank = (rarity: string) => rarityOrder.indexOf(rarity);

export interface CampaignPull { slug: string; printing?: Printing }
type RetailPull = { slug: string; printing: Printing };
const pool = CARDS.flatMap(card => card.printings
  .filter(printing => printing.set === retail && rank(printing.rarity) >= 0)
  .map(printing => ({ slug: card.slug, printing })));
export const RETRY_PACK_SIZE = 5;

const retryPool = pool.filter(({ slug }) => BY_SLUG.get(slug)?.type !== 'Legend');

// WeirdCo's published odds are per 12-card booster, with two Rare+ slots.
// Keep both slots in the 7-card adaptation. For two independent slots,
// 1 - (1 - slotChance)^2 gives the published chance of at least one hit.
const slotChance = (packChance: number) => 1 - Math.sqrt(1 - packChance);
const epic = slotChance(1 / 4);
const secret = slotChance(1 / 24);
const iconic = slotChance(1 / 18);

function rollPack(random: () => number, pool: readonly RetailPull[], regularSlots: number, rareSlots: number) {
  const used = new Set<string>();
  const pulls: RetailPull[] = [];
  const commonCount = regularSlots - (random() < .5 ? 2 : 1);

  function take(rarity: string) {
    const options = pool.filter(({ slug, printing }) => !used.has(slug) &&
      (rarity === 'Iconic' ? printing.rarity.startsWith('Iconic ') : printing.rarity === rarity));
    const pull = options[Math.floor(random() * options.length)];
    used.add(pull.slug);
    pulls.push(pull);
  }

  for (let slot = 0; slot < regularSlots; slot++) take(slot < commonCount ? 'Common' : 'Uncommon');
  for (let slot = 0; slot < rareSlots; slot++) {
    const roll = random();
    const rarity = roll < iconic ? 'Iconic' : roll < iconic + secret ? 'Secret' : roll < iconic + secret + epic ? 'Epic' : 'Rare';
    take(rarity);
  }
  return pulls.sort((a, b) => rank(a.printing.rarity) - rank(b.printing.rarity));
}

export function rollCampaignPack(random: () => number) {
  return rollPack(random, pool, 5, 2);
}

/** House packs contain five main-deck cards, including one Rare+ roll. */
export function rollRetryPack(random: () => number) {
  return rollPack(random, retryPool, RETRY_PACK_SIZE - 1, 1);
}

export function campaignPulls(reward: CampaignReward): CampaignPull[] {
  return reward.cards.map((slug, index) => {
    const exact = PRINTING_INDEX.get(reward.printingIds?.[index] ?? '');
    const card = BY_SLUG.get(slug);
    return { slug, printing: exact?.card.slug === slug ? exact.printing : card && defaultPrinting(card) };
  });
}

export function packRarityLabel(rarity?: string) {
  if (rarity === 'Iconic Secret') return 'Iconic Secret Rare';
  if (rarity === 'Iconic Legend') return 'Iconic Legend Rare';
  if (rarity === 'Iconic Other') return 'Iconic Other Rare';
  if (rarity === 'Epic' || rarity === 'Secret') return `${rarity} Rare`;
  return rarity ?? '';
}
