// Test hand: opening-hand trials and exact opening odds. Pure and deterministic given an RNG,
// runs entirely in the browser, never touches the collection or saved decks.
// Setup follows the official gameplay guide: shuffle the main deck (Legends stay out), draw 6,
// one optional mulligan that shuffles the whole hand back and draws 6 new cards.
import { BY_SLUG, type Card } from './data';

export const HAND_SIZE = 6;
export const COST_BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

// ---------- deck stats (shared with the Deck Builder) ----------

export interface DeckStats {
  n: number;
  curve: { label: string; value: number }[];
  avgCost: number;
  units: number;
  gear: number;
  programs: number;
  sellable: number;
}

/** Main-deck stats exactly as the Deck Builder counts them. Unknown slugs are ignored. */
export function deckStats(cards: Record<string, number>): DeckStats {
  const main = Object.entries(cards)
    .map(([s, n]) => ({ c: BY_SLUG.get(s), n }))
    .filter((x): x is { c: Card; n: number } => !!x.c && x.n > 0);
  const count = (f: (c: Card) => boolean) => main.filter((x) => f(x.c)).reduce((a, x) => a + x.n, 0);
  const n = count(() => true);
  return {
    n,
    curve: COST_BUCKETS.map((k) => ({
      label: k === 7 ? '7+' : String(k),
      value: count((c) => (k === 7 ? (c.cost ?? 0) >= 7 : (c.cost ?? 0) === k)),
    })),
    avgCost: n ? main.reduce((a, x) => a + (x.c.cost ?? 0) * x.n, 0) / n : 0,
    units: count((c) => c.type === 'Unit'),
    gear: count((c) => c.type === 'Gear'),
    programs: count((c) => c.type === 'Program'),
    sellable: count((c) => c.sellable),
  };
}

// ---------- readiness ----------

/** Why a list can't be tested yet. Legality is separate: drafts are fine. */
export function testIssues(d: { cards: Record<string, number> }): string[] {
  const out: string[] = [];
  const unknown = Object.keys(d.cards).filter((s) => !BY_SLUG.has(s));
  if (unknown.length) out.push(`Card data missing for: ${unknown.join(', ')}. Remove or re-add them in the Deck Builder.`);
  const legends = Object.keys(d.cards).filter((s) => BY_SLUG.get(s)?.type === 'Legend');
  if (legends.length) out.push('Legends are in the main deck list. Move them to the Legends slots.');
  const bad = Object.entries(d.cards).filter(([, n]) => !Number.isInteger(n) || n < 0);
  if (bad.length) out.push('Some quantities are not whole numbers.');
  const n = Object.entries(d.cards).filter(([s]) => BY_SLUG.get(s) && BY_SLUG.get(s)!.type !== 'Legend').reduce((a, [, q]) => a + Math.max(0, q), 0);
  if (n < HAND_SIZE) out.push(`Add at least ${HAND_SIZE} main-deck cards to deal a hand (this list has ${n}).`);
  return out;
}

// ---------- randomness ----------

export type Rng = () => number;

/** Small seeded PRNG (mulberry32) so trials are reproducible in tests. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32);
};

/** One entry per physical copy, in a stable order. */
export function expand(cards: Record<string, number>): string[] {
  return Object.keys(cards)
    .sort()
    .flatMap((s) => Array<string>(Math.max(0, Math.floor(cards[s]))).fill(s));
}

/** Fisher-Yates. Returns a new array. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- a trial ----------

export type Phase = 'deciding' | 'playing';

export interface Trial {
  /** Remaining draw pile, top first. */
  library: string[];
  /** Cards in hand, in the order they arrived. The first `opening` are the opening hand. */
  hand: string[];
  opening: number;
  phase: Phase; // deciding = keep or mulligan; playing = kept (or mulliganed) and drawing
  mulliganed: boolean;
}

export function newTrial(cards: Record<string, number>, rng: Rng): Trial {
  const library = shuffle(expand(cards), rng);
  const hand = library.splice(0, HAND_SIZE);
  return { library, hand, opening: hand.length, phase: 'deciding', mulliganed: false };
}

export function keep(t: Trial): Trial {
  return t.phase === 'deciding' ? { ...t, phase: 'playing' } : t;
}

/** One mulligan: the whole hand goes back, shuffle, draw 6. After it, the hand is kept. */
export function mulligan(t: Trial, rng: Rng): Trial {
  if (t.phase !== 'deciding' || t.mulliganed) return t;
  const library = shuffle([...t.library, ...t.hand], rng);
  const hand = library.splice(0, HAND_SIZE);
  return { library, hand, opening: hand.length, phase: 'playing', mulliganed: true };
}

export function draw(t: Trial): Trial {
  if (t.phase !== 'playing' || !t.library.length) return t;
  return { ...t, library: t.library.slice(1), hand: [...t.hand, t.library[0]] };
}

// ---------- exact odds ----------

/**
 * Chance that a fresh hand of `hand` cards from a deck of `deckSize` contains at least one of
 * `copies` matching cards. Hypergeometric, sampling without replacement:
 * 1 - C(N-K, n) / C(N, n), computed as a product to stay exact for small decks.
 */
export function atLeastOne(deckSize: number, copies: number, hand = HAND_SIZE): number {
  const N = Math.max(0, Math.floor(deckSize));
  const K = Math.max(0, Math.min(N, Math.floor(copies)));
  const n = Math.min(hand, N);
  if (K === 0 || n === 0) return 0;
  if (N - K < n) return 1;
  let miss = 1;
  for (let i = 0; i < n; i++) miss *= (N - K - i) / (N - i);
  return 1 - miss;
}

/** With the one mulligan taken only when the first hand misses: the second hand is a fresh draw. */
export const withMulligan = (p: number) => 1 - (1 - p) ** 2;

export const ANY_SELLABLE = '__sellable__';

/** Matching copies in a main deck for a target: a card slug or ANY_SELLABLE. */
export function matchCount(cards: Record<string, number>, target: string): number {
  if (target === ANY_SELLABLE) return deckStats(cards).sellable;
  const c = BY_SLUG.get(target);
  return c && c.type !== 'Legend' ? Math.max(0, cards[target] ?? 0) : 0;
}

export interface OddsRow {
  copies: number;
  deckSize: number;
  opening: number; // P(at least one in a fresh six-card opener)
  mulligan: number; // P(at least one, mulliganing a miss)
}

export function openingOdds(cards: Record<string, number>, target: string): OddsRow {
  const deckSize = deckStats(cards).n;
  const copies = matchCount(cards, target);
  const opening = atLeastOne(deckSize, copies);
  return { copies, deckSize, opening, mulligan: withMulligan(opening) };
}

export const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
/** Percentage-point difference, signed. */
export const ppDiff = (a: number, b: number) => {
  const d = (b - a) * 100;
  if (Math.abs(d) < 0.05) return '±0.0 pts';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts`;
};
