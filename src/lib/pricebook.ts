// Pure pricing selectors for the Price Book. No React, so they're unit-testable.
import { BY_SLUG, PRINTING_INDEX, priceConfidence, priceFor, rarityRank, type Card, type Printing } from './data';
import type { Entry } from './store';

export type Basis = 'Market' | 'Beta proxy' | 'Low listing';

export interface Line {
  entry: Entry;
  card: Card;
  printing: Printing | undefined;
  rarity: string; // printing rarity (Iconic, Nova...) falling back to the card's base rarity
  unit: number; // CAD per copy
  total: number; // CAD for the position
  basis: Basis | null;
  url: string | undefined;
}

export interface Group {
  key: string;
  value: number;
  count: number;
}

export interface Extra {
  slug: string;
  card: Card;
  copies: number; // copies beyond the 3-per-deck limit
  unit: number;
}

export interface PriceBookModel {
  lines: Line[];
  total: number;
  count: number;
  average: number;
  top: Line | null; // most valuable single copy
  extras: Extra[];
  extrasCopies: number;
  extrasValue: number;
  byConfidence: Group[];
  byColor: Group[];
  byRarity: Group[];
}

export type SortKey = 'total' | 'unit' | 'name' | 'qty';

export const COPY_LIMIT = 3;
const BASIS_ORDER: Basis[] = ['Market', 'Beta proxy', 'Low listing'];

function group(lines: Line[], key: (l: Line) => string): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const k = key(l);
    const g = m.get(k) ?? { key: k, value: 0, count: 0 };
    g.value += l.total;
    g.count += l.entry.qty;
    m.set(k, g);
  }
  return [...m.values()];
}

export function buildPriceBook(entries: Entry[]): PriceBookModel {
  const lines: Line[] = [];
  for (const entry of entries) {
    const card = BY_SLUG.get(entry.slug);
    if (!card || entry.qty <= 0) continue;
    const pr = priceFor(entry.slug, entry.printingId);
    const unit = pr?.cad ?? 0;
    const printing = PRINTING_INDEX.get(entry.printingId)?.printing;
    lines.push({
      entry,
      card,
      printing,
      rarity: printing?.rarity ?? card.rarity,
      unit,
      total: unit * entry.qty,
      basis: pr ? (priceConfidence(pr.point).label as Basis) : null,
      url: pr?.point.url,
    });
  }
  const total = lines.reduce((a, l) => a + l.total, 0);
  const count = lines.reduce((a, l) => a + l.entry.qty, 0);
  const top = lines.reduce<Line | null>((m, l) => (!m || l.unit > m.unit ? l : m), null);

  const bySlug = new Map<string, number>();
  for (const l of lines) bySlug.set(l.card.slug, (bySlug.get(l.card.slug) ?? 0) + l.entry.qty);
  const extras: Extra[] = [...bySlug.entries()]
    .filter(([, n]) => n > COPY_LIMIT)
    .map(([slug, n]) => ({ slug, card: BY_SLUG.get(slug)!, copies: n - COPY_LIMIT, unit: priceFor(slug)?.cad ?? 0 }))
    .sort((a, b) => b.unit * b.copies - a.unit * a.copies || a.card.display.localeCompare(b.card.display));

  return {
    lines,
    total,
    count,
    average: count ? total / count : 0,
    top,
    extras,
    extrasCopies: extras.reduce((a, x) => a + x.copies, 0),
    extrasValue: extras.reduce((a, x) => a + x.unit * x.copies, 0),
    byConfidence: group(lines, (l) => l.basis ?? 'Unpriced').sort(
      (a, b) => BASIS_ORDER.indexOf(a.key as Basis) - BASIS_ORDER.indexOf(b.key as Basis),
    ),
    byColor: group(lines, (l) => l.card.color).sort((a, b) => b.value - a.value),
    byRarity: group(lines, (l) => l.rarity).sort((a, b) => rarityRank(a.key) - rarityRank(b.key)),
  };
}

export function sortLines(lines: Line[], key: SortKey): Line[] {
  const byName = (a: Line, b: Line) => a.card.display.localeCompare(b.card.display);
  const cmp: Record<SortKey, (a: Line, b: Line) => number> = {
    total: (a, b) => b.total - a.total || byName(a, b),
    unit: (a, b) => b.unit - a.unit || byName(a, b),
    qty: (a, b) => b.entry.qty - a.entry.qty || byName(a, b),
    name: byName,
  };
  return [...lines].sort(cmp[key]);
}

/** CSV of the lines. Amounts are internal CAD; pass toCur/label to export in another display currency. */
export function toCsv(lines: Line[], toCur: (cadAmount: number) => number = (n) => n, label = 'CAD'): string {
  const rows = [['Card', 'Set', 'Number', 'Rarity', 'Qty', `Unit ${label}`, `Total ${label}`, 'Price basis']];
  for (const l of lines)
    rows.push([
      l.card.display,
      l.printing?.set ?? '',
      l.printing?.num ?? '',
      l.rarity,
      String(l.entry.qty),
      toCur(l.unit).toFixed(2),
      toCur(l.total).toFixed(2),
      l.basis ?? '',
    ]);
  return rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n');
}
