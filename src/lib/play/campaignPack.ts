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

const iconicPool = pool.filter(({ printing }) => printing.rarity.startsWith('Iconic '));

// WeirdCo's published odds are per 12-card booster, with two Rare+ slots.
// Keep both slots in the 7-card adaptation. For two independent slots,
// 1 - (1 - slotChance)^2 gives the published chance of at least one hit.
const slotChance = (packChance: number) => 1 - Math.sqrt(1 - packChance);
const epic = slotChance(1 / 4);
const secret = slotChance(1 / 24);
const iconic = slotChance(1 / 18);

export function rollCampaignPack(random: () => number, compatible: ReadonlySet<string>, offers: readonly string[]) {
  const used = new Set(offers);
  const pulls: RetailPull[] = [];
  const commonCount = random() < .5 ? 3 : 4; // Five lower-rarity slots, with a 7:3 Common-to-Uncommon split on average.

  function take(candidates: RetailPull[], preferCompatible = false) {
    const available = candidates.filter(({ slug }) => !used.has(slug));
    const preferred = preferCompatible ? available.filter(({ slug }) => compatible.has(slug)) : [];
    const options = preferred.length ? preferred : available;
    const pull = options[Math.floor(random() * options.length)];
    used.add(pull.slug);
    pulls.push(pull);
  }

  const commons = pool.filter(({ printing }) => printing.rarity === 'Common');
  const uncommons = pool.filter(({ printing }) => printing.rarity === 'Uncommon');
  for (let slot = 0; slot < 5; slot++) take(slot < commonCount ? commons : uncommons, true);
  for (let slot = 0; slot < 2; slot++) {
    const roll = random();
    if (roll < iconic) take(iconicPool);
    else {
      const rarity = roll < iconic + secret ? 'Secret' : roll < iconic + secret + epic ? 'Epic' : 'Rare';
      take(pool.filter(({ printing }) => printing.rarity === rarity));
    }
  }
  return pulls.sort((a, b) => rank(a.printing.rarity) - rank(b.printing.rarity));
}

/** The house's five-card retry pack uses playable crew cards and one Rare+ roll. */
export function rollRetryPack(random: () => number, compatible: ReadonlySet<string>, inventory: Readonly<Record<string, number>>) {
  const pulls: RetailPull[] = [];
  const used = new Set<string>();
  const candidates = pool.filter(pull => compatible.has(pull.slug));
  const commonCount = random() < .5 ? 2 : 3;
  const hit = random();
  const rareSlot = hit < iconic ? 'Iconic' : hit < iconic + secret ? 'Secret' : hit < iconic + secret + epic ? 'Epic' : 'Rare';
  const rarities = [...Array.from({ length: RETRY_PACK_SIZE - 1 }, (_, index) => index < commonCount ? 'Common' : 'Uncommon'), rareSlot];

  for (const rarity of rarities) {
    const available = candidates.filter(pull => !used.has(pull.slug));
    const matching = available.filter(pull => pull.printing.rarity === rarity || (rarity === 'Iconic' && pull.printing.rarity.startsWith('Iconic ')));
    const room = (pull: RetailPull) => (inventory[pull.slug] ?? 0) < 3;
    const options = [matching.filter(room), available.filter(room), matching, available].find(group => group.length);
    if (!options) throw new Error('There are too few playable cards for the house pack.');
    const pull = options[Math.floor(random() * options.length)];
    used.add(pull.slug);
    pulls.push(pull);
  }
  return pulls.sort((a, b) => rank(a.printing.rarity) - rank(b.printing.rarity));
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
