// Pure deck helpers: legality, recommended-deck completion. No React.
import { BY_SLUG, RECOMMENDED, acquireQuote, fitsRam, ramLimits, type AcquireQuote, type RecommendedDeck } from './data';
import type { Deck } from './store';

export const MAIN_MIN = 40;
export const MAIN_MAX = 50;
export const COPY_MAX = 3;
export const SIDEBOARD_SIZE = 7;

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(16).slice(2)}`;

export function deckFromRecommended(id: string): Deck | null {
  const r = RECOMMENDED.find((d) => d.id === id);
  if (!r) return null;
  return { id: newId(), name: r.name, legends: [...r.legends], cards: { ...r.cards }, sideboard: {}, notes: r.summary, updatedAt: '' };
}

export function validate(d: Pick<Deck, 'legends' | 'cards' | 'sideboard'>) {
  const lim = ramLimits(d.legends);
  const n = sum(d.cards);
  const side = sum(d.sideboard);
  const issues: string[] = [];
  const passes: string[] = [];
  const legendsOk = d.legends.length === 3 && new Set(d.legends).size === 3 && d.legends.every((s) => BY_SLUG.get(s)?.type === 'Legend');
  if (!legendsOk) issues.push(`Needs exactly 3 different Legends (has ${d.legends.length})`);
  else passes.push('3 unique Legends');
  if (n < MAIN_MIN || n > MAIN_MAX) issues.push(`Main deck must be ${MAIN_MIN} to ${MAIN_MAX} cards (has ${n})`);
  else passes.push(`${n} card main deck`);
  const over = Object.entries(d.cards).filter(([s, q]) => q + (d.sideboard[s] ?? 0) > COPY_MAX);
  if (over.length) issues.push(`Max ${COPY_MAX} copies: ${over.map(([s]) => BY_SLUG.get(s)?.name ?? s).join(', ')}`);
  else passes.push('Copy limits OK');
  const unknown = Object.keys({ ...d.cards, ...d.sideboard }).filter((s) => !BY_SLUG.has(s));
  if (unknown.length) issues.push(`Unknown cards: ${unknown.join(', ')}`);
  const ramBad = Object.keys({ ...d.cards, ...d.sideboard }).filter((s) => {
    const c = BY_SLUG.get(s);
    return c && !fitsRam(c, lim);
  });
  if (ramBad.length) issues.push(`Over RAM limit: ${ramBad.map((s) => BY_SLUG.get(s)?.name).join(', ')}`);
  else passes.push('All cards fit RAM');
  if (side !== 0 && side !== SIDEBOARD_SIZE) issues.push(`Sideboard must be exactly ${SIDEBOARD_SIZE} for Bo3 (has ${side})`);
  else if (side === SIDEBOARD_SIZE) passes.push(`${SIDEBOARD_SIZE} card sideboard (Bo3 ready)`);
  return { lim, n, side, issues, passes, legal: issues.length === 0 };
}

export interface PurchaseLine {
  slug: string;
  buy: number; // copies to buy
  quote: AcquireQuote | null; // null = unpriced
}

/** What buying the missing copies costs. Shared by Meta Intel, the Deck Builder and the planner. */
export interface PurchaseEstimate {
  knownCad: number; // priced lines only
  unpriced: number; // copies with no quote
  copies: number; // all copies to buy
  lines: PurchaseLine[];
}

/** Cost to acquire everything in `need` (slug -> copies) beyond what `owned` covers. */
export function purchaseEstimate(need: Record<string, number>, owned: Map<string, number>): PurchaseEstimate {
  const lines: PurchaseLine[] = [];
  let knownCad = 0;
  let unpriced = 0;
  let copies = 0;
  for (const [slug, n] of Object.entries(need)) {
    const buy = n - Math.min(n, owned.get(slug) ?? 0);
    if (buy <= 0) continue;
    const quote = acquireQuote(slug);
    if (quote) knownCad += quote.cad * buy;
    else unpriced += buy;
    copies += buy;
    lines.push({ slug, buy, quote });
  }
  lines.sort((a, b) => (b.quote ? b.quote.cad * b.buy : Infinity) - (a.quote ? a.quote.cad * a.buy : Infinity) || a.slug.localeCompare(b.slug));
  return { knownCad, unpriced, copies, lines };
}

/** Legends + main deck as one need map (the requirement the planner, builder and Meta Intel share). */
export function deckNeed(deck: Pick<RecommendedDeck, 'legends' | 'cards'>): Record<string, number> {
  const need: Record<string, number> = { ...deck.cards };
  for (const l of deck.legends) need[l] = (need[l] ?? 0) + 1;
  return need;
}

export interface Completion {
  have: number;
  total: number;
  pct: number; // 0-100, rounded down so 99.x never shows as 100
  estimate: PurchaseEstimate;
}

/** How much of a deck (Legends + main) a collection covers, and what the rest costs. */
export function completion(deck: Pick<RecommendedDeck, 'legends' | 'cards'>, owned: Map<string, number>): Completion {
  const need = deckNeed(deck);
  let have = 0;
  let total = 0;
  for (const [slug, n] of Object.entries(need)) {
    have += Math.min(n, owned.get(slug) ?? 0);
    total += n;
  }
  return { have, total, pct: total ? Math.floor((have / total) * 100) : 0, estimate: purchaseEstimate(need, owned) };
}

/** Sort key for "cheapest to finish": complete estimates first by cost, incomplete ones after. */
export function costRank(e: PurchaseEstimate): number {
  return e.unpriced > 0 ? 1e9 + e.knownCad : e.knownCad;
}

export type BuildFilter = 'all' | 'close' | 'owned';
export const CLOSE_THRESHOLD = 80;

export function matchesFilter(c: Completion, f: BuildFilter): boolean {
  if (f === 'owned') return c.have === c.total;
  if (f === 'close') return c.pct >= CLOSE_THRESHOLD;
  return true;
}
