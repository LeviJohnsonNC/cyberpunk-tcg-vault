import { imageUrl } from '../data';
import { vaultCard } from './cardDisplay';
import type { CardView } from './protocol';

const requested = new Set<string>();

/** Fetch art ahead of need, so a card in motion already shows its face. */
export function preloadArt(slugs: Iterable<string>) {
  if (typeof Image === 'undefined') return;
  for (const slug of slugs) {
    if (requested.has(slug)) continue;
    requested.add(slug);
    new Image().src = imageUrl(slug);
  }
}

export function preloadFaces(cards: CardView[]) {
  preloadArt(cards.flatMap((card) => vaultCard(card)?.slug ?? []));
}
