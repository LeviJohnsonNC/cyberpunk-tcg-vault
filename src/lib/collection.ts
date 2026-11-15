import { printingVariant, type PrintingVariant } from './cardPrintingVariants';
import { PRICES, PRINTING_INDEX, acquireQuote, defaultPrinting, printingLabel, rarityRank, valueHolding, type Card, type Printing } from './data';
import type { Entry } from './store';

export type CollectionSort = 'name' | 'catalog' | 'color' | 'type' | 'cost' | 'power' | 'ram' | 'rarity' | 'qty' | 'unit' | 'value';
export type CollectionOrder = { key: CollectionSort; direction: 1 | -1 };

export function collectionValue(entries: Entry[]) {
  let knownCad = 0;
  let unpriced = 0;
  let copies = 0;
  for (const entry of entries) {
    const value = PRINTING_INDEX.get(entry.printingId)?.card.slug === entry.slug ? valueHolding(entry.printingId) : null;
    if (value) knownCad += value.cad * entry.qty;
    else unpriced += entry.qty;
    copies += entry.qty;
  }
  return { knownCad, unpriced, copies };
}

const showcaseRank: Record<PrintingVariant, number> = { Regular: 0, Promo: 1, Nova: 2, Iconic: 3, Judge: 4 };

function compareShowcase(a: Printing, b: Printing) {
  return showcaseRank[printingVariant(a)] - showcaseRank[printingVariant(b)]
    || rarityRank(a.rarity) - rarityRank(b.rarity)
    || (PRICES.printings[a.id]?.market ?? 0) - (PRICES.printings[b.id]?.market ?? 0);
}

/** Use the most collectible owned printing, with catalog order as the final tie-breaker. */
export function collectionCard(card: Card, entries: Entry[], qty: number) {
  const catalog = defaultPrinting(card);
  let cover: Entry | undefined;
  let coverPrinting: Printing | undefined;
  let unknownCopies = 0;
  for (const printing of card.printings) {
    const holding = entries.find((entry) => entry.printingId === printing.id);
    if (holding && holding.qty > 0 && (!coverPrinting || compareShowcase(printing, coverPrinting) > 0)) {
      cover = holding;
      coverPrinting = printing;
    }
  }
  for (const entry of entries) {
    if (!card.printings.some((printing) => printing.id === entry.printingId)) unknownCopies += entry.qty;
  }
  const exact = entries.length === 1 && cover ? valueHolding(cover.printingId) : null;
  return { card, qty, entries, catalog, cover, unknownCopies, exact, quote: acquireQuote(card.slug), value: collectionValue(entries) };
}

export type CollectionCard = ReturnType<typeof collectionCard>;

export function compactPrintingLabel(id: string): string {
  return printingLabel(id, false)
    .replace(/^WNC /, '')
    .replace(/^The Heist (Retail|Beta) SD /, 'Heist $1 ')
    .replace(/^Embracing Power (Retail|Beta) SD /, 'Power $1 ');
}

const natural = new Intl.Collator('en', { numeric: true });
const releaseOrder = [
  'Welcome to Night City — Retail',
  'The Heist — Retail Starter Deck',
  'Embracing Power — Retail Starter Deck',
  'Welcome to Night City — Beta',
  'The Heist — Beta Starter Deck',
  'Embracing Power — Beta Starter Deck',
];
function releaseRank(set: string) {
  const rank = releaseOrder.indexOf(set);
  return rank < 0 ? releaseOrder.length : rank;
}

export function compareCollection(a: CollectionCard, b: CollectionCard, order: CollectionOrder): number {
  const byName = natural.compare(a.card.display, b.card.display) || natural.compare(a.card.slug, b.card.slug);
  if (order.key === 'catalog') {
    return (releaseRank(a.catalog.set) - releaseRank(b.catalog.set)
      || natural.compare(a.catalog.set, b.catalog.set)
      || natural.compare(a.catalog.num, b.catalog.num)) * order.direction || byName;
  }
  const sortValue = (row: CollectionCard): string | number | null => {
    switch (order.key) {
      case 'name': return row.card.display;
      case 'color': return row.card.color;
      case 'type': return row.card.type;
      case 'cost': return row.card.cost;
      case 'power': return row.card.power;
      case 'ram': return row.card.ram;
      case 'rarity': return rarityRank(row.card.rarity);
      case 'qty': return row.qty;
      case 'unit': return row.quote?.cad ?? null;
      case 'value': return row.value.copies > row.value.unpriced ? row.value.knownCad : null;
      case 'catalog': return row.catalog.num;
    }
  };
  const x = sortValue(a), y = sortValue(b);
  if (x == null || y == null) return x == null && y == null ? byName : x == null ? 1 : -1;
  const diff = typeof x === 'number' && typeof y === 'number' ? x - y : natural.compare(String(x), String(y));
  return diff * order.direction || byName;
}
