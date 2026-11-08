// Deterministic "build from my vault" engine. Pure, no network, no randomness.
// Ratings + roles: src/curated/card-ratings.json. Rules: src/lib/decks.ts.
import ratingsJson from '../curated/card-ratings.json';
import { BY_SLUG, CARDS, fitsRam, ramLimits, refPrice, type Card, type Color } from './data';
import { COPY_MAX, MAIN_MIN, validate } from './decks';

export type Role =
  | 'legend' | 'early' | 'body' | 'finisher' | 'removal' | 'quick' | 'draw' | 'tempo'
  | 'gear' | 'blocker' | 'gigs' | 'eddie' | 'recursion' | 'sweeper';
export type Style = 'balanced' | 'aggro' | 'control';

interface Rating { power: number; roles: Role[] }
const RATINGS = (ratingsJson as unknown as { cards: Record<string, Rating> }).cards;
export const rating = (slug: string): Rating => RATINGS[slug] ?? { power: 3, roles: [] };

export interface BuildOptions {
  colors?: Color[]; // allowed colours (empty/undefined = any)
  style?: Style;
  mustInclude?: string[]; // up to 2 slugs (Legends or cards) the user wants in the deck
  results?: number; // how many distinct builds to return (default 3)
}

export interface Upgrade {
  slug: string;
  add: number;
  replaces: string | null;
  gain: number; // score improvement estimate
  unit: number; // CAD per copy
}

export interface Build {
  legends: string[];
  cards: Record<string, number>;
  score: number;
  colors: Color[];
  stats: { units: number; sellable: number; removal: number; early: number; topEnd: number; avgCost: number };
  highlights: string[]; // top cards by contribution
  notes: string[]; // plain-language composition notes
  upgrades: Upgrade[];
}

export type BuildResult =
  | { ok: true; builds: Build[]; considered: number }
  | { ok: false; reason: 'need-legends'; message: string; suggestions: { slug: string; unit: number }[] }
  | { ok: false; reason: 'not-enough-cards'; message: string; bestShortfall: number };

const TARGET = { sellableMin: 20, unitsMin: 16, unitsMax: 22, earlyMin: 6, topEndMax: 9, removalWant: 4 };
const STYLE_W: Record<Style, Partial<Record<Role, number>>> = {
  balanced: {},
  aggro: { early: 1.2, body: 0.6, finisher: 0.4, removal: -0.3, draw: -0.4, blocker: -0.4 },
  control: { removal: 1.1, quick: 1, draw: 0.7, blocker: 0.5, sweeper: 0.8, early: -0.4 },
};

/** Legend-specific synergy bonus for a card. Kept small and explainable. */
function synergy(card: Card, legends: string[]): number {
  let b = 0;
  const t = card.traits;
  const text = card.text;
  for (const l of legends) {
    switch (l) {
      case 'saburo-arasaka-stubborn-patriarch':
        if (card.type === 'Unit' && t.includes('Arasaka')) b += card.power === 9 ? 3 : 1.5;
        break;
      case 'yorinobu-arasaka-embracing-destruction':
        if (card.type === 'Unit' && t.includes('Arasaka')) b += 1;
        break;
      case 'hanako-arasaka-daughter-of-the-emperor':
      case 'padre-man-of-the-cross':
        if (/value-pair/.test(text)) b += 1.5;
        break;
      case 'panam-palmer-nomad-cavalry':
        if (card.type === 'Gear') b += 0.7;
        if (t.includes('Nomad')) b += 1;
        break;
      case 'goro-takemura-vengeful-bodyguard':
        if (card.type === 'Unit' && (card.cost ?? 9) <= 4) b += 0.5;
        break;
      case 'river-ward-detective-on-the-hunt':
      case 'viktor-vektor-sit-down-and-relax':
        if (card.type === 'Gear' && (card.cost ?? 9) <= 2) b += 1.5;
        break;
      case 'dum-dum-maelstrom-triggerman':
      case 'royce-psycho-on-the-edge':
        if (card.type === 'Gear') b += 1;
        break;
      case 'johnny-silverhand-rocking-renegade':
        if (t.includes('Rocker')) b += 2;
        break;
      case 'v-streetkid':
      case 'judy-a-lvarez-braindance-maestro':
        if (t.includes('Braindance')) b += 1.5;
        break;
      case 'alt-cunningham-soulkiller-architect':
        if (card.type === 'Program') b += 1;
        if (/min Gig/.test(text)) b += 0.5;
        break;
      case 'jackie-welles-pour-one-out-for-me':
        if (card.color === 'Blue' && (card.type === 'Unit' || card.type === 'Gear')) b += 0.7;
        if (/min Gig/.test(text)) b += 1;
        break;
      case 'lucyna-kushinada-fresh-beginnings':
        if (/min Gig/.test(text)) b += 0.7;
        break;
      case 'evelyn-parker-beautiful-enigma':
        if (card.type === 'Unit' && (t.includes('Corpo') || t.includes('Ganger'))) b += 1;
        break;
      case 'v-corporate-exile':
        if (/Go Solo/.test(text)) b += 1.5;
        if (card.slug === 'dying-night-v-s-pistol') b += 1;
        break;
    }
  }
  return b;
}

const isEarly = (c: Card, r: Rating) => c.type === 'Unit' && (c.cost ?? 9) <= 3 && ((c.power ?? 0) > 0 || r.roles.includes('blocker'));
const isTopEnd = (c: Card) => (c.cost ?? 0) >= 6;

function cardScore(c: Card, legends: string[], style: Style): number {
  const r = rating(c.slug);
  let s = r.power;
  for (const role of r.roles) s += STYLE_W[style][role] ?? 0;
  return s + synergy(c, legends);
}

interface Pick { slug: string; n: number; score: number }

/** Greedy fill under composition targets. Returns null if the pool can't reach 40 cards. */
function fill(pool: { card: Card; max: number; score: number }[], forced: string[]): { picks: Pick[]; total: number } | null {
  const counts = new Map<string, number>();
  const st = { n: 0, units: 0, sellable: 0, early: 0, topEnd: 0, removal: 0 };
  const add = (p: (typeof pool)[number]) => {
    counts.set(p.card.slug, (counts.get(p.card.slug) ?? 0) + 1);
    st.n++;
    const r = rating(p.card.slug);
    if (p.card.type === 'Unit') st.units++;
    if (p.card.sellable) st.sellable++;
    if (isEarly(p.card, r)) st.early++;
    if (isTopEnd(p.card)) st.topEnd++;
    if (r.roles.includes('removal')) st.removal++;
  };
  for (const f of forced) {
    const p = pool.find((x) => x.card.slug === f);
    if (p) add(p);
  }
  const capacity = pool.reduce((a, p) => a + p.max, 0);
  if (capacity < MAIN_MIN) return null;
  while (st.n < MAIN_MIN) {
    let best: (typeof pool)[number] | null = null;
    let bestV = -Infinity;
    const left = MAIN_MIN - st.n;
    for (const p of pool) {
      const have = counts.get(p.card.slug) ?? 0;
      if (have >= p.max) continue;
      const r = rating(p.card.slug);
      // Consistency: prefer more copies of cards already in the list (real decks run 2-3 of their best cards).
      let v = p.score - have * 0.1 + (have > 0 ? 0.6 : 0);
      const unit = p.card.type === 'Unit';
      if (p.card.sellable && st.sellable < TARGET.sellableMin) v += (TARGET.sellableMin - st.sellable) / left > 0.6 ? 4 : 1.2;
      if (unit && st.units < TARGET.unitsMin) v += (TARGET.unitsMin - st.units) / left > 0.6 ? 4 : 1;
      if (unit && st.units >= TARGET.unitsMax) v -= 4;
      if (!unit && st.n - st.units >= MAIN_MIN - TARGET.unitsMin) v -= 4;
      if (isEarly(p.card, r) && st.early < TARGET.earlyMin) v += 1.5;
      if (isTopEnd(p.card) && st.topEnd >= TARGET.topEndMax) v -= 3;
      if (r.roles.includes('removal') && st.removal < TARGET.removalWant) v += 0.8;
      if (v > bestV) {
        bestV = v;
        best = p;
      }
    }
    if (!best) return null;
    add(best);
  }
  const picks = [...counts.entries()].map(([slug, n]) => ({ slug, n, score: pool.find((p) => p.card.slug === slug)!.score }));
  return { picks, total: picks.reduce((a, p) => a + p.score * p.n, 0) };
}

function compositionPenalty(cards: Record<string, number>): { penalty: number; stats: Build['stats']; notes: string[] } {
  let units = 0, sellable = 0, removal = 0, early = 0, topEnd = 0, cost = 0, n = 0;
  for (const [slug, q] of Object.entries(cards)) {
    const c = BY_SLUG.get(slug)!;
    const r = rating(slug);
    n += q;
    cost += (c.cost ?? 0) * q;
    if (c.type === 'Unit') units += q;
    if (c.sellable) sellable += q;
    if (r.roles.includes('removal')) removal += q;
    if (isEarly(c, r)) early += q;
    if (isTopEnd(c)) topEnd += q;
  }
  const notes: string[] = [];
  let penalty = 0;
  if (sellable < 18) { penalty += (18 - sellable) * 3; notes.push(`Only ${sellable} sellable cards, so Eddies may run short.`); }
  if (units < TARGET.unitsMin) { penalty += (TARGET.unitsMin - units) * 2; notes.push(`Light on Units (${units}).`); }
  if (early < 4) { penalty += (4 - early) * 2; notes.push(`Few cheap Units (${early}), so the early game is slow.`); }
  if (removal < 2) { penalty += (2 - removal) * 2; notes.push(`Little removal (${removal}).`); }
  if (topEnd > TARGET.topEndMax) { penalty += (topEnd - TARGET.topEndMax) * 2; notes.push(`Top-heavy: ${topEnd} cards cost 6+.`); }
  return { penalty, stats: { units, sellable, removal, early, topEnd, avgCost: n ? cost / n : 0 }, notes };
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) return void out.push([...acc]);
    for (let i = start; i < arr.length; i++) rec(i + 1, [...acc, arr[i]]);
  };
  rec(0, []);
  return out;
}

function upgradesFor(build: { legends: string[]; cards: Record<string, number> }, owned: Map<string, number>, style: Style, allowed: Set<Color> | null): Upgrade[] {
  const lim = ramLimits(build.legends);
  const included = Object.entries(build.cards).map(([slug, n]) => ({ slug, n, score: cardScore(BY_SLUG.get(slug)!, build.legends, style) }));
  included.sort((a, b) => a.score - b.score);
  const weakest = [...included];
  const out: Upgrade[] = [];
  const candidates = CARDS.filter(
    (c) => c.type !== 'Legend' && c.legal === 'legal' && c.text && fitsRam(c, lim) && (!allowed || allowed.has(c.color)),
  )
    .map((c) => ({ c, score: cardScore(c, build.legends, style), room: COPY_MAX - (build.cards[c.slug] ?? 0) }))
    .filter((x) => x.room > 0 && (owned.get(x.c.slug) ?? 0) < COPY_MAX)
    .sort((a, b) => b.score - a.score);
  for (const cand of candidates) {
    if (out.length >= 5) break;
    const victim = weakest.find((w) => w.score < cand.score - 1 && w.slug !== cand.c.slug);
    if (!victim) break;
    const add = Math.min(cand.room, victim.n, 2);
    out.push({ slug: cand.c.slug, add, replaces: victim.slug, gain: Math.round((cand.score - victim.score) * add * 10) / 10, unit: refPrice(cand.c.slug) });
    victim.n -= add;
    if (victim.n <= 0) weakest.splice(weakest.indexOf(victim), 1);
  }
  return out;
}

export function autobuild(owned: Map<string, number>, opts: BuildOptions = {}): BuildResult {
  const style = opts.style ?? 'balanced';
  const allowed = opts.colors && opts.colors.length ? new Set(opts.colors) : null;
  const must = (opts.mustInclude ?? []).slice(0, 2).filter((s) => BY_SLUG.has(s));
  const mustLegends = must.filter((s) => BY_SLUG.get(s)!.type === 'Legend');
  const mustCards = must.filter((s) => BY_SLUG.get(s)!.type !== 'Legend');

  const ownedLegends = CARDS.filter(
    (c) => c.type === 'Legend' && c.ram != null && c.legal === 'legal' && (owned.get(c.slug) ?? 0) > 0 && (!allowed || allowed.has(c.color)),
  );
  if (ownedLegends.length < 3) {
    const suggestions = CARDS.filter((c) => c.type === 'Legend' && c.ram != null && (owned.get(c.slug) ?? 0) === 0 && (!allowed || allowed.has(c.color)))
      .map((c) => ({ slug: c.slug, unit: refPrice(c.slug), v: rating(c.slug).power / Math.max(0.5, refPrice(c.slug)) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5)
      .map(({ slug, unit }) => ({ slug, unit }));
    return {
      ok: false,
      reason: 'need-legends',
      message: `A deck needs 3 different Legends${allowed ? ' in your chosen colours' : ''}. You have ${ownedLegends.length}.`,
      suggestions,
    };
  }

  const trios = combos(ownedLegends.map((c) => c.slug), 3).filter((t) => mustLegends.every((m) => t.includes(m)));
  const ownedCards = CARDS.filter((c) => c.type !== 'Legend' && c.legal === 'legal' && c.text && (owned.get(c.slug) ?? 0) > 0 && (!allowed || allowed.has(c.color)));
  let bestShortfall = Infinity;
  // Pass 1 (cheap): build each crew's legal pool and an optimistic score bound.
  const candidates: { legends: string[]; pool: { card: Card; max: number; score: number }[]; bound: number }[] = [];
  for (const legends of trios) {
    const lim = ramLimits(legends);
    const pool = ownedCards.filter((c) => fitsRam(c, lim)).map((card) => ({ card, max: Math.min(COPY_MAX, owned.get(card.slug) ?? 0), score: cardScore(card, legends, style) }));
    if (mustCards.some((m) => !pool.some((p) => p.card.slug === m))) continue; // crew can't legally run a must-include
    const capacity = pool.reduce((a, p) => a + p.max, 0);
    if (capacity < MAIN_MIN) {
      bestShortfall = Math.min(bestShortfall, MAIN_MIN - capacity);
      continue;
    }
    let left = MAIN_MIN;
    let bound = legends.reduce((a, l) => a + rating(l).power, 0) * 1.5;
    for (const p of [...pool].sort((x, y) => y.score - x.score)) {
      if (left <= 0) break;
      const n = Math.min(p.max, left);
      bound += p.score * n;
      left -= n;
    }
    candidates.push({ legends, pool, bound });
  }
  // Pass 2 (full greedy fill) only for the most promising crews. Keeps big collections instant.
  candidates.sort((x, y) => y.bound - x.bound);
  const results: Build[] = [];
  for (const { legends, pool } of candidates.slice(0, 60)) {
    const filled = fill(pool, mustCards);
    if (!filled) continue;
    const cards = Object.fromEntries(filled.picks.map((p) => [p.slug, p.n]));
    const comp = compositionPenalty(cards);
    const legendScore = legends.reduce((a, l) => a + rating(l).power, 0) * 1.5;
    const colors = [...new Set([...legends, ...Object.keys(cards)].map((s) => BY_SLUG.get(s)!.color))] as Color[];
    results.push({
      legends,
      cards,
      score: Math.round((filled.total + legendScore - comp.penalty) * 10) / 10,
      colors,
      stats: comp.stats,
      highlights: filled.picks.sort((a, b) => b.score - a.score).slice(0, 4).map((p) => p.slug),
      notes: comp.notes,
      upgrades: [],
    });
  }

  if (!results.length) {
    return {
      ok: false,
      reason: 'not-enough-cards',
      message: Number.isFinite(bestShortfall)
        ? `Not enough legal cards yet: your best Legend trio is ${bestShortfall} card${bestShortfall === 1 ? '' : 's'} short of 40.`
        : 'No Legend trio can legally run your must-include cards.',
      bestShortfall: Number.isFinite(bestShortfall) ? bestShortfall : 0,
    };
  }

  // Pick the best builds, preferring diversity: skip a build sharing 2+ Legends with one already chosen.
  results.sort((a, b) => b.score - a.score);
  const want = opts.results ?? 3;
  const chosen: Build[] = [];
  for (const r of results) {
    if (chosen.length >= want) break;
    if (chosen.some((c) => c.legends.filter((l) => r.legends.includes(l)).length >= 2)) continue;
    chosen.push(r);
  }
  for (const r of results) {
    if (chosen.length >= want) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  chosen.sort((a, b) => b.score - a.score);
  for (const b of chosen) {
    b.upgrades = upgradesFor(b, owned, style, allowed);
    // Defensive: never hand back an illegal deck.
    if (!validate({ legends: b.legends, cards: b.cards, sideboard: {} }).legal) throw new Error('autobuild produced an illegal deck');
  }
  return { ok: true, builds: chosen, considered: trios.length };
}
