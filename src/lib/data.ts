import cardsJson from '../data/cards.json';
import pricesJson from '../data/prices.json';
import decksJson from '../data/decks.json';
import { NETDECK_CARDS } from './printingArt';

export type Color = 'Red' | 'Yellow' | 'Green' | 'Blue' | 'Colorless';
export type CardType = 'Unit' | 'Gear' | 'Program' | 'Legend';

export interface Printing {
  id: string;
  set: string;
  num: string;
  rarity: string;
  artist: string | null;
}

export interface Card {
  id: string;
  slug: string;
  name: string;
  sub: string | null;
  display: string;
  color: Color;
  type: CardType;
  cost: number | null;
  power: number | null;
  ram: number | null;
  traits: string[];
  keywords: string[];
  rarity: string;
  sellable: boolean;
  text: string;
  flavor: string | null;
  artist: string | null;
  legal: string;
  printings: Printing[];
}

/** Exact TCGplayer quotes for one printing (USD). Mid price is deliberately not used. */
export interface PrintingQuote {
  market: number | null;
  low: number | null;
  finish: string | null;
  url: string | null;
}

interface PriceFile {
  version: number;
  updatedAt: string;
  source: string;
  fx: { usdToCad: number; asOf: string };
  printings: Record<string, PrintingQuote>;
  /** Verified equivalent Retail printing id -> its Beta twin (same card, rarity and collector number). */
  pairs: Record<string, string>;
}

export interface RecommendedDeck {
  id: string;
  name: string;
  kind: 'budget' | 'meta' | 'brew';
  source: string;
  base?: string;
  colors: Color[];
  archetype: string;
  legends: string[];
  cards: Record<string, number>;
  confidence: string;
  summary: string;
  plan: string[];
  mulligan: string;
  keyCards: { slug: string; why: string }[];
  weaknesses: string;
}

export const CARDS = cardsJson as unknown as Card[];
export const PRICES = pricesJson as unknown as PriceFile;
export const RECOMMENDED = decksJson as unknown as RecommendedDeck[];
export const FX = PRICES.fx.usdToCad;

export const BY_SLUG = new Map(CARDS.map((c) => [c.slug, c]));
export const PRINTING_INDEX = new Map<string, { card: Card; printing: Printing }>();
for (const c of CARDS) for (const p of c.printings) PRINTING_INDEX.set(p.id, { card: c, printing: p });

export const COLORS: Color[] = ['Yellow', 'Blue', 'Red', 'Green'];
export const TYPES: CardType[] = ['Unit', 'Gear', 'Program', 'Legend'];
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Secret', 'Nova Rare', 'Iconic Legend', 'Iconic Other', 'Iconic Secret'];
export const rarityRank = (r: string) => {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 99 : i;
};

const BASE_SETS = [
  'Welcome to Night City — Retail',
  'The Heist — Retail Starter Deck',
  'Embracing Power — Retail Starter Deck',
  'Welcome to Night City — Beta',
];

/** Default printing for a card: base-rarity retail booster print, else starter, else first. */
export function defaultPrinting(card: Card): Printing {
  for (const s of BASE_SETS) {
    const p = card.printings.find((x) => x.set === s && x.rarity === card.rarity);
    if (p) return p;
  }
  return card.printings[0];
}

export function imageUrl(slug: string): string {
  return `${NETDECK_CARDS}/${slug}/image`;
}

// ---------- pricing ----------
// Two different questions, answered separately:
// - valueHolding(printingId): what is this copy I own worth? Exact market, then a Beta proxy for a
//   verified Retail/Beta pair, then the exact lowest listing. Otherwise unknown (null). A printing
//   never borrows another printing's price except through a verified pair.
// - acquireQuote(slug): what would one playable copy cost to buy? The cheapest direct quote on a
//   named printing (market first, then lowest listing). Proxies never count here.
// All amounts are internal CAD; format them with money() from ./currency.

export type HoldingBasis = 'Market' | 'Beta proxy' | 'Low listing';
export type QuoteBasis = 'Market' | 'Low listing';

export interface Valuation {
  cad: number;
  basis: HoldingBasis;
  /** The printing whose quote this is: the holding itself, or its Beta twin for a proxy. */
  sourcePrintingId: string;
  url: string | null;
}

export interface AcquireQuote {
  cad: number;
  basis: QuoteBasis;
  printingId: string;
  url: string | null;
}

const toCad = (usd: number) => usd * FX;

export function valueHolding(printingId: string): Valuation | null {
  const own = PRICES.printings[printingId];
  if (own?.market != null) return { cad: toCad(own.market), basis: 'Market', sourcePrintingId: printingId, url: own.url };
  const twinId = PRICES.pairs[printingId];
  const twin = twinId ? PRICES.printings[twinId] : undefined;
  // Thin market: an unsold Retail printing with only an optimistic listing is valued at its
  // verified Beta twin's market price when that's lower (or when there's no listing at all).
  if (twin?.market != null && (own?.low == null || twin.market < own.low))
    return { cad: toCad(twin.market), basis: 'Beta proxy', sourcePrintingId: twinId, url: twin.url };
  if (own?.low != null) return { cad: toCad(own.low), basis: 'Low listing', sourcePrintingId: printingId, url: own.url };
  return null;
}

const acquireCache = new Map<string, AcquireQuote | null>();
export function acquireQuote(slug: string): AcquireQuote | null {
  if (acquireCache.has(slug)) return acquireCache.get(slug)!;
  const card = BY_SLUG.get(slug);
  let best: AcquireQuote | null = null;
  for (const basis of ['Market', 'Low listing'] as const) {
    for (const p of card?.printings ?? []) {
      const q = PRICES.printings[p.id];
      const usd = basis === 'Market' ? q?.market : q?.low;
      if (usd == null) continue;
      if (!best || toCad(usd) < best.cad) best = { cad: toCad(usd), basis, printingId: p.id, url: q!.url };
    }
    if (best) break; // a market quote beats any listing
  }
  acquireCache.set(slug, best);
  return best;
}

/** Test hook: quotes are memoised per card. */
export const _clearQuoteCache = () => acquireCache.clear();

/** Consistent printing label used everywhere: "WNC Retail #001 · Epic". */
export function printingLabel(printingId: string, withRarity = true): string {
  const hit = PRINTING_INDEX.get(printingId);
  if (!hit) return 'Printing unspecified';
  const { printing } = hit;
  const set = shortSet(printing.set).replace(' · ', ' ');
  return `${set} #${printing.num}${withRarity ? ` · ${printing.rarity}` : ''}`;
}

// ---------- printing identity ----------
// A holding is keyed by printing id. When the printing isn't known (a scan can read the name but
// not Retail vs Beta), it's stored under a stable per-card id so different cards never collide.
// Unspecified copies count toward playable ownership but have no holding value.
export const MAX_PRINTING_COPIES = 999;
export const UNSPECIFIED = 'unspecified:';
export const unspecifiedId = (slug: string) => `${UNSPECIFIED}${slug}`;
export const isUnspecified = (printingId: string) => printingId.startsWith(UNSPECIFIED);

/** A stored or imported printing id, checked against the card: valid printing, else the card's unspecified id. */
export function normalizePrinting(slug: string, printingId: string | null | undefined): string {
  if (printingId && PRINTING_INDEX.get(printingId)?.card.slug === slug) return printingId;
  return unspecifiedId(slug);
}

/** The card's base-rarity printing in the main Retail or Beta release (booster set, else its starter deck). */
export function editionPrinting(slug: string, edition: 'Retail' | 'Beta'): Printing | undefined {
  const card = BY_SLUG.get(slug);
  if (!card) return undefined;
  const sets = [`Welcome to Night City — ${edition}`, `The Heist — ${edition} Starter Deck`, `Embracing Power — ${edition} Starter Deck`];
  for (const set of sets) {
    const p = card.printings.find((x) => x.set === set && x.rarity === card.rarity);
    if (p) return p;
  }
  return undefined;
}

export const BASIS_CLASS: Record<HoldingBasis, string> = { Market: 'market', 'Beta proxy': 'proxy', 'Low listing': 'low' };

export function shortSet(s: string): string {
  return s
    .replace('Welcome to Night City', 'WNC')
    .replace(' Starter Deck', ' SD')
    .replace(/ — /g, ' · ');
}

export function ramLimits(legendSlugs: string[]): Record<string, number> {
  const lim: Record<string, number> = {};
  for (const s of legendSlugs) {
    const c = BY_SLUG.get(s);
    if (c?.type === 'Legend' && c.legal === 'legal' && c.ram) lim[c.color] = (lim[c.color] ?? 0) + c.ram;
  }
  return lim;
}

export function fitsRam(card: Card, lim: Record<string, number>): boolean {
  if (card.type === 'Legend') return true;
  return (card.ram ?? 0) <= (lim[card.color] ?? 0);
}

/** Render rules text tokens like {Quick} as styled keyword spans (returns HTML-safe segments). */
export function textSegments(text: string): { kw?: string; t?: string }[] {
  const out: { kw?: string; t?: string }[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ kw: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

export function searchCards(q: string, pool: Card[] = CARDS): Card[] {
  const s = q.trim().toLowerCase();
  if (!s) return pool;
  const terms = s.split(/\s+/);
  return pool.filter((c) => {
    const hay = `${c.display} ${c.traits.join(' ')} ${c.text} ${c.type} ${c.color}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
