import cardsJson from '../data/cards.json';
import pricesJson from '../data/prices.json';
import decksJson from '../data/decks.json';

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

export interface PricePoint {
  usd: number;
  src: string;
  finish: string;
  url: string;
  printingId?: string;
  set?: string;
}

interface PriceFile {
  updatedAt: string;
  source: string;
  fx: { usdToCad: number; asOf: string };
  ref: Record<string, PricePoint>;
  printings: Record<string, PricePoint>;
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
  return `https://api.netdeck.gg/api/cards/cyberpunk/${slug}/image`;
}

/** Unit price in CAD for a specific printing, falling back to the card's reference price. */
export function priceFor(slug: string, printingId?: string): { cad: number; point: PricePoint } | null {
  const pp = printingId ? PRICES.printings[printingId] : undefined;
  const ref = PRICES.ref[slug];
  // A printing with no sales (just a listing) is capped by the card's reference market price,
  // so a single optimistic listing on a two-day-old product doesn't inflate the vault.
  const point = pp && (pp.src === 'market' || !ref || pp.usd <= ref.usd) ? pp : ref ?? pp;
  if (!point) return null;
  return { cad: point.usd * FX, point };
}

export function refPrice(slug: string): number {
  const p = PRICES.ref[slug];
  return p ? p.usd * FX : 0;
}

export function priceConfidence(point: PricePoint): { label: string; tone: 'ok' | 'warn' | 'low' } {
  if (point.src === 'beta-proxy' || point.set?.includes('Beta')) return { label: 'Beta proxy', tone: 'warn' };
  if (point.src === 'market') return { label: 'Market', tone: 'ok' };
  return { label: 'Low listing', tone: 'low' };
}


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
    if (c && c.ram) lim[c.color] = (lim[c.color] ?? 0) + c.ram;
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
