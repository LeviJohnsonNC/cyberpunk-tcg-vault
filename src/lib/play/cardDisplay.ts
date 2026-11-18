import { CARDS, BY_SLUG } from '../data';
import type { CardView } from './protocol';

const byId = new Map(CARDS.map((card) => [card.id, card]));
const byDisplay = new Map(CARDS.map((card) => [card.display, card]));
byDisplay.set('Lucyna Kushinada', BY_SLUG.get('lucyna-kushinada-fresh-beginnings')!);

export function vaultCard(card: CardView) {
  if (!card.definitionId) return;
  return byId.get(card.definitionId) ?? byDisplay.get(card.cardName ?? '');
}

/** Pending abilities can outlive their source. Use the identity already named in the prompt. */
export function triggerPreviewCard(source: CardView | undefined, id: string, name: string): CardView | undefined {
  if (source) return source.definitionId && source.zone !== 'eddieArea' ? source : undefined;
  const printing = byDisplay.get(name);
  if (!printing) return;
  return {
    instanceId: id, definitionId: printing.id, cardName: printing.display,
    type: printing.type.toLowerCase(), cost: printing.cost,
    power: printing.power ?? 0, effectivePower: printing.power ?? 0, spent: false, faceDown: false,
  };
}
