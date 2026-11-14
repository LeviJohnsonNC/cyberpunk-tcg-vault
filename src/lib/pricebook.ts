// Pure pricing selectors for the Price Book. No React, so they're unit-testable.
import { BY_SLUG, PRINTING_INDEX, printingLabel, rarityRank, valueHolding, type Card, type HoldingBasis, type Printing } from './data';
import type { Entry } from './store';

export type Basis = HoldingBasis;

export interface Line {
  entry: Entry;
  card: Card;
  printing: Printing | undefined;
  rarity: string; // printing rarity (Iconic, Nova...) falling back to the card's base rarity
  unit: number | null; // CAD per copy; null = unpriced
  total: number | null; // CAD for the position; null = unpriced
  basis: Basis | null;
  url: string | null;
  sourcePrintingId: string | null; // differs from the holding for a Beta proxy
}

export interface Group {
  key: string;
  value: number; // CAD, priced copies only
  count: number; // all copies
  unpriced: number; // copies with no value
}

export interface Extra {
  slug: string;
  card: Card;
  copies: number; // copies beyond the 3-per-deck limit
  value: number; // CAD for the priced extra copies
  unpriced: number; // extra copies with no value
}

export interface PriceBookModel {
  lines: Line[];
  total: number; // CAD, priced copies only
  count: number; // all copies
  pricedCount: number;
  unpriced: number; // copies with no value
  average: number; // over priced copies
  top: Line | null; // most valuable single copy
  extras: Extra[];
  extrasCopies: number;
  extrasValue: number;
  extrasUnpriced: number;
  byConfidence: Group[];
  byColor: Group[];
  byRarity: Group[];
}

export type SortKey = 'total' | 'unit' | 'name' | 'qty';
export const UNSPECIFIED_SET = 'Printing unspecified';
export const FILTERS = [
  { key: 'color', label: 'Color', all: 'All colors' },
  { key: 'rarity', label: 'Rarity', all: 'All rarities' },
  { key: 'type', label: 'Card type', all: 'All card types' },
  { key: 'set', label: 'Set', all: 'All sets' },
  { key: 'basis', label: 'Price confidence', all: 'Any confidence' },
] as const;
export type FilterKey = (typeof FILTERS)[number]['key'];
export type PriceFilters = Partial<Record<FilterKey, string>>;

export const COPY_LIMIT = 3;
const BASIS_ORDER: Basis[] = ['Market', 'Beta proxy', 'Low listing'];
const basisRank = (k: string) => {
  const i = BASIS_ORDER.indexOf(k as Basis);
  return i < 0 ? BASIS_ORDER.length : i;
};

function group(lines: Line[], key: (l: Line) => string): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const k = key(l);
    const g = m.get(k) ?? { key: k, value: 0, count: 0, unpriced: 0 };
    g.value += l.total ?? 0;
    g.count += l.entry.qty;
    if (l.total == null) g.unpriced += l.entry.qty;
    m.set(k, g);
  }
  return [...m.values()];
}

export function holdingLines(entries: Entry[]): Line[] {
  const lines: Line[] = [];
  for (const entry of entries) {
    const card = BY_SLUG.get(entry.slug);
    if (!card || entry.qty <= 0) continue;
    const v = valueHolding(entry.printingId);
    const printing = PRINTING_INDEX.get(entry.printingId)?.printing;
    lines.push({
      entry,
      card,
      printing,
      rarity: printing?.rarity ?? card.rarity,
      unit: v ? v.cad : null,
      total: v ? v.cad * entry.qty : null,
      basis: v?.basis ?? null,
      url: v?.url ?? null,
      sourcePrintingId: v?.sourcePrintingId ?? null,
    });
  }
  return lines;
}

const filterValue = {
  color: (line: Line) => line.card.color,
  rarity: (line: Line) => line.rarity,
  type: (line: Line) => line.card.type,
  set: (line: Line) => line.printing?.set ?? UNSPECIFIED_SET,
  basis: (line: Line) => line.basis ?? 'Unpriced',
};

export function filterOptions(lines: Line[]) {
  return Object.fromEntries(FILTERS.map(({ key }) => {
    const values = [...new Set(lines.map(filterValue[key]))];
    values.sort((a, b) => (key === 'rarity' ? rarityRank(a) - rarityRank(b)
      : key === 'basis' ? basisRank(a) - basisRank(b) : 0) || a.localeCompare(b));
    return [key, values.map((value) => ({ value, label: value }))];
  })) as Record<FilterKey, { value: string; label: string }[]>;
}

export function filterHoldings(lines: Line[], query: string, filters: PriceFilters) {
  const normalize = (value: string) => value.toLowerCase().replace(/β/g, 'b').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return lines.filter((line) => {
    if (!FILTERS.every(({ key }) => !filters[key] || filterValue[key](line) === filters[key])) return false;
    if (!terms.length) return true;
    const number = line.printing?.num ?? '';
    const search = normalize([line.card.name, line.card.sub, line.card.display, line.printing?.set,
      printingLabel(line.entry.printingId, false), number.replace(/^([βb]?)0+(?=\d)/i, '$1')].join(' '));
    return terms.every((term) => search.includes(term));
  });
}

export function buildPriceBook(entries: Entry[]): PriceBookModel {
  return summarizeHoldings(holdingLines(entries));
}

export function summarizeHoldings(lines: Line[], fullCollection?: PriceBookModel): PriceBookModel {
  const priced = lines.filter((l) => l.unit != null);
  const total = priced.reduce((a, l) => a + l.total!, 0);
  const count = lines.reduce((a, l) => a + l.entry.qty, 0);
  const pricedCount = priced.reduce((a, l) => a + l.entry.qty, 0);
  const top = priced.reduce<Line | null>((m, l) => (!m || l.unit! > m.unit! ? l : m), null);

  // Trade bait: copies past the deck limit. You'd trade away your least valuable copies first.
  const extras = fullCollection?.extras ?? tradeExtras(lines);
  return {
    lines, total, count, pricedCount, unpriced: count - pricedCount,
    average: pricedCount ? total / pricedCount : 0,
    top, extras,
    extrasCopies: extras.reduce((a, x) => a + x.copies, 0),
    extrasValue: extras.reduce((a, x) => a + x.value, 0),
    extrasUnpriced: extras.reduce((a, x) => a + x.unpriced, 0),
    byConfidence: group(lines, (l) => l.basis ?? 'Unpriced').sort((a, b) => basisRank(a.key) - basisRank(b.key)),
    byColor: group(lines, (l) => l.card.color).sort((a, b) => b.value - a.value),
    byRarity: group(lines, (l) => l.rarity).sort((a, b) => rarityRank(a.key) - rarityRank(b.key)),
  };
}

function tradeExtras(lines: Line[]): Extra[] {
  const bySlug = new Map<string, Line[]>();
  for (const line of lines) {
    const group = bySlug.get(line.card.slug);
    if (group) group.push(line);
    else bySlug.set(line.card.slug, [line]);
  }
  const extras: Extra[] = [];
  for (const [slug, ls] of bySlug) {
    let spare = ls.reduce((a, l) => a + l.entry.qty, 0) - COPY_LIMIT;
    if (spare <= 0) continue;
    const copies = spare;
    let value = 0;
    let unpriced = 0;
    for (const l of [...ls].sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity))) {
      const take = Math.min(spare, l.entry.qty);
      if (l.unit == null) unpriced += take;
      else value += l.unit * take;
      spare -= take;
      if (!spare) break;
    }
    extras.push({ slug, card: BY_SLUG.get(slug)!, copies, value, unpriced });
  }
  extras.sort((a, b) => b.value - a.value || a.card.display.localeCompare(b.card.display));

  return extras;
}

export function sortLines(lines: Line[], key: SortKey): Line[] {
  const byName = (a: Line, b: Line) => a.card.display.localeCompare(b.card.display);
  const cmp: Record<SortKey, (a: Line, b: Line) => number> = {
    total: (a, b) => (b.total ?? -1) - (a.total ?? -1) || byName(a, b),
    unit: (a, b) => (b.unit ?? -1) - (a.unit ?? -1) || byName(a, b),
    qty: (a, b) => b.entry.qty - a.entry.qty || byName(a, b),
    name: byName,
  };
  return [...lines].sort(cmp[key]);
}

/** CSV of the lines. Amounts are internal CAD; pass toCur/label to export in another display currency. */
export function toCsv(lines: Line[], toCur: (cadAmount: number) => number = (n) => n, label = 'CAD'): string {
  const rows = [['Card', 'Set', 'Number', 'Rarity', 'Qty', `Unit ${label}`, `Total ${label}`, 'Price basis', 'Priced from']];
  for (const l of lines)
    rows.push([
      l.card.display,
      l.printing?.set ?? '',
      l.printing?.num ?? '',
      l.rarity,
      String(l.entry.qty),
      l.unit == null ? '' : toCur(l.unit).toFixed(2), // unknown stays blank, never 0
      l.total == null ? '' : toCur(l.total).toFixed(2),
      l.basis ?? 'Unpriced',
      l.sourcePrintingId && l.sourcePrintingId !== l.entry.printingId ? printingLabel(l.sourcePrintingId, false) : '',
    ]);
  return rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n');
}
