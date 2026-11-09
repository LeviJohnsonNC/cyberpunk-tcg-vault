// Physical retail starter decks (hand-curated from WeirdCo's official decklists; see
// src/curated/starter-decks.json for the source). Kept separate from the demo collection.
import starterJson from '../curated/starter-decks.json';
import type { Entry } from './store';

export type StarterKey = 'the-heist' | 'embracing-power';
export type StarterEdition = 'retail' | 'beta';

export interface StarterDeck {
  key: StarterKey;
  name: string;
  colors: string[];
  legends: string[];
  cards: Record<string, number>;
  printings: Record<StarterEdition, Record<string, string>>; // slug -> printing id
}

const RAW = starterJson as unknown as { _source: string; decks: Record<StarterKey, Omit<StarterDeck, 'key'>> };

export const STARTER_SOURCE = RAW._source;
export const STARTERS: StarterDeck[] = (Object.keys(RAW.decks) as StarterKey[]).map((key) => ({ key, ...RAW.decks[key] }));
export const starterByKey = (k: StarterKey) => STARTERS.find((s) => s.key === k)!;

export const EDITIONS: { id: StarterEdition; label: string; hint: string }[] = [
  { id: 'retail', label: 'Retail', hint: 'The store version (Nov 6, 2026)' },
  { id: 'beta', label: 'Beta', hint: 'The Kickstarter backer version' },
];

/** Every card in the box (3 Legends + 40-card deck) as collection entries for one edition. */
export function starterEntries(s: StarterDeck, edition: StarterEdition): Entry[] {
  const ids = s.printings[edition];
  return [...s.legends.map((slug) => ({ slug, qty: 1 })), ...Object.entries(s.cards).map(([slug, qty]) => ({ slug, qty }))].map((e) => ({
    slug: e.slug,
    printingId: ids[e.slug],
    qty: e.qty,
  }));
}

export const starterCardCount = (s: StarterDeck) => s.legends.length + Object.values(s.cards).reduce((a, b) => a + b, 0);

/**
 * True when the collection already holds at least one full copy of this starter's printings,
 * so a second add is probably a mistake (we ask before adding). Overlapping booster pulls
 * alone don't trigger it.
 */
export function looksAlreadyLogged(collection: Entry[], s: StarterDeck, edition: StarterEdition): boolean {
  const have = new Map<string, number>();
  for (const e of collection) have.set(e.printingId, (have.get(e.printingId) ?? 0) + e.qty);
  return starterEntries(s, edition).every((e) => (have.get(e.printingId) ?? 0) >= e.qty);
}

/** The starter as a deck for the builder hand-off. */
export function starterAsDeck(s: StarterDeck) {
  return { legends: [...s.legends], cards: { ...s.cards } };
}
