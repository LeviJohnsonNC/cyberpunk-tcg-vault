import { CARDS, BY_SLUG } from '../data';
import type { CardView } from './protocol';

const byId = new Map(CARDS.map((card) => [card.id, card]));
const byDisplay = new Map(CARDS.map((card) => [card.display, card]));
byDisplay.set('Lucyna Kushinada', BY_SLUG.get('lucyna-kushinada-fresh-beginnings')!);

export function vaultCard(card: CardView) {
  if (!card.definitionId) return;
  return byId.get(card.definitionId) ?? byDisplay.get(card.cardName ?? '');
}
