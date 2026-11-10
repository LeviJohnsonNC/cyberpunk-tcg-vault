// Budget Upgrade Planner engine. Pure and deterministic, no network, no AI.
// Starts from a deck (starter, saved or auto-built) and proposes legal swaps scored with the same
// card ratings, Legend synergy and composition penalty the auto-builder uses (src/lib/autobuild.ts).
//
// Rules the search never breaks:
// - Legends are fixed (changing them changes the deck's colours and plan; that's auto-build's job).
// - Every option passes validate(): RAM per colour, 3-copy cap, 40-50 cards.
// - Locked cards keep at least their current quantity.
// - The budget covers everything needed to finish the proposed deck, including copies the
//   starting list was already missing. At a $0 budget every copy must already be owned.
// - A purchase without a price quote is never added by the search; if the starting list already
//   needs one, the option reports it and is never confirmed as within budget.
import { BY_SLUG, CARDS, acquireQuote, fitsRam, ramLimits, type AcquireQuote, type Card } from './data';
import { cardScore, compositionPenalty, rating, scoreDeck, synergy, type Style } from './autobuild';
import { COPY_MAX, MAIN_MAX, MAIN_MIN, deckNeed, legendNames, purchaseEstimate, validate, type PurchaseEstimate } from './decks';
import { money, toDisplay, type Currency } from './currency';

export type Lens = 'strongest' | 'fewest' | 'value';
export const LENS_LABEL: Record<Lens, string> = { strongest: 'Strongest', fewest: 'Fewest changes', value: 'Best value' };

/** The planner prices purchases with the app-wide acquisition estimator, so search, budget
 * eligibility and the displayed cost always use the same quote (and the same printing). */
export type Quote = AcquireQuote;
export const quoteFor = (slug: string): Quote | null => acquireQuote(slug);

export type FinishCost = PurchaseEstimate;

/** What it costs to finish a deck (Legends + main) from a collection. Same requirement as Meta Intel and the Deck Builder. */
export function finishCost(legends: string[], cards: Record<string, number>, owned: Map<string, number>): FinishCost {
  return purchaseEstimate(deckNeed({ legends, cards }), owned);
}

export type BudgetStatus = 'within' | 'over' | 'unknown';

/** Budget is in the display currency; costs are internal CAD. Compared in whole cents. */
export function budgetStatus(cost: FinishCost, budget: number, currency: Currency): BudgetStatus {
  const cents = Math.round(toDisplay(cost.knownCad, currency) * 100);
  if (cents > Math.round(budget * 100)) return 'over';
  return cost.unpriced > 0 ? 'unknown' : 'within';
}

export interface Change {
  slug: string;
  from: number;
  to: number;
  ownedAdded: number; // added copies already in the collection
  buyAdded: number; // added copies that must be bought
}

export interface PlanOption {
  lenses: Lens[];
  cards: Record<string, number>;
  score: number;
  gain: number; // score improvement over the starting deck
  adds: Change[];
  cuts: Change[];
  swaps: number; // copies changed
  cost: FinishCost;
  status: BudgetStatus;
  reasons: string[];
}

export interface PlanInput {
  legends: string[];
  cards: Record<string, number>;
  owned: Map<string, number>;
  budget: number; // display currency
  currency: Currency;
  locks?: Set<string>; // card slugs; Legends are always fixed
  style?: Style;
}

export interface Plan {
  ok: boolean;
  base: { score: number; cost: FinishCost; status: BudgetStatus; legal: boolean; issues: string[] };
  options: PlanOption[];
  /** Plain-language reasons when no improvement is possible, or limits worth knowing. */
  notes: string[];
}

// Every changed copy costs a little, so all lenses keep the deck's identity and skip near-even swaps.
const CHURN = 0.8;
const LAMBDA_SWAP = 3.5; // "fewest changes": each changed copy must earn this much more on top
const MU_VALUE = 2.5; // "best value": each display-currency unit spent must earn this much score
const EPS_PRICE = 0.05; // price breaks near-ties: a change must earn 0.05 per dollar (or CAD) it costs

interface Ctx {
  legends: string[];
  owned: Map<string, number>;
  budget: number;
  currency: Currency;
  minQty: Record<string, number>;
  pool: Card[]; // legal, RAM-fitting, non-Legend cards
  scoreOf: Map<string, number>;
  style: Style;
}

const deckSize = (cards: Record<string, number>) => Object.values(cards).reduce((a, b) => a + b, 0);

/** Cost (display currency) of buying the copies of `slug` beyond what's owned, at quantity q. Infinity if unpriced. */
function buyCost(ctx: Ctx, slug: string, q: number): number {
  const buy = Math.max(0, q - (ctx.owned.get(slug) ?? 0));
  if (!buy) return 0;
  const quote = quoteFor(slug);
  return quote ? toDisplay(quote.cad, ctx.currency) * buy : Infinity;
}

function objective(ctx: Ctx, lens: Lens, cards: Record<string, number>, base: Record<string, number>, spend: number): number {
  let v = 0;
  for (const [slug, q] of Object.entries(cards)) v += (ctx.scoreOf.get(slug) ?? 0) * q;
  v -= compositionPenalty(cards).penalty;
  let changed = 0;
  for (const s of new Set([...Object.keys(cards), ...Object.keys(base)])) changed += Math.max(0, (cards[s] ?? 0) - (base[s] ?? 0));
  v -= changed * (CHURN + (lens === 'fewest' ? LAMBDA_SWAP : 0));
  if (lens === 'value') v -= spend * MU_VALUE;
  return v - spend * EPS_PRICE;
}

/** Spend (display currency) for the main deck's copies that must be bought, ignoring unpriced copies already in base. */
function spendOf(ctx: Ctx, cards: Record<string, number>): number {
  let total = 0;
  for (const [slug, q] of Object.entries(cards)) {
    const c = buyCost(ctx, slug, q);
    if (Number.isFinite(c)) total += c;
  }
  return total;
}

/** Hill-climb with one-copy swaps (and adds while under 40) for one lens. */
function climb(ctx: Ctx, lens: Lens, start: Record<string, number>, legendSpend: number, from = start): Record<string, number> {
  const cards = { ...from };
  const affordable = (spend: number) => Math.round((spend + legendSpend) * 100) <= Math.round(ctx.budget * 100);
  let current = objective(ctx, lens, cards, start, spendOf(ctx, cards));
  for (let step = 0; step < 120; step++) {
    let best: { out: string | null; inn: string; v: number } | null = null;
    const size = deckSize(cards);
    const outs: (string | null)[] = size < MAIN_MIN ? [null] : Object.keys(cards).filter((s) => cards[s] > (ctx.minQty[s] ?? 0));
    for (const inn of ctx.pool.map((c) => c.slug)) {
      const have = cards[inn] ?? 0;
      if (have >= COPY_MAX) continue;
      // Never introduce an unpriced purchase.
      if (!Number.isFinite(buyCost(ctx, inn, have + 1))) continue;
      for (const out of outs) {
        if (out === inn) continue;
        const next = { ...cards, [inn]: have + 1 };
        if (out) {
          next[out] -= 1;
          if (next[out] === 0) delete next[out];
        }
        const spend = spendOf(ctx, next);
        if (!affordable(spend)) continue;
        const v = objective(ctx, lens, next, start, spend);
        if (v > (best?.v ?? current) + 1e-9) best = { out, inn, v };
      }
    }
    if (!best) break;
    cards[best.inn] = (cards[best.inn] ?? 0) + 1;
    if (best.out) {
      cards[best.out] -= 1;
      if (cards[best.out] === 0) delete cards[best.out];
    }
    current = best.v;
  }
  return cards;
}

function diff(ctx: Ctx, base: Record<string, number>, next: Record<string, number>) {
  const adds: Change[] = [];
  const cuts: Change[] = [];
  for (const slug of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const from = base[slug] ?? 0;
    const to = next[slug] ?? 0;
    if (to > from) {
      const owned = ctx.owned.get(slug) ?? 0;
      const ownedAdded = Math.max(0, Math.min(to, owned) - Math.min(from, owned));
      adds.push({ slug, from, to, ownedAdded, buyAdded: to - from - ownedAdded });
    } else if (to < from) cuts.push({ slug, from, to, ownedAdded: 0, buyAdded: 0 });
  }
  const byScore = (a: Change, b: Change) => (ctx.scoreOf.get(b.slug) ?? 0) - (ctx.scoreOf.get(a.slug) ?? 0);
  adds.sort(byScore);
  cuts.sort((a, b) => -byScore(a, b));
  return { adds, cuts };
}

const ROLE_WORDS: Partial<Record<string, string>> = {
  removal: 'removal',
  early: 'an early Unit',
  draw: 'card draw',
  blocker: 'a Blocker',
  finisher: 'a finisher',
  sweeper: 'a board sweeper',
  quick: 'a Quick effect',
  gigs: 'Gig pressure',
};

/** One short line per key swap: what the add brings that the cut didn't. */
function reasonsFor(ctx: Ctx, adds: Change[], cuts: Change[]): string[] {
  const out: string[] = [];
  const cutQueue = cuts.flatMap((c) => Array(c.from - c.to).fill(c.slug) as string[]);
  for (const a of adds.slice(0, 3)) {
    const card = BY_SLUG.get(a.slug)!;
    const victim = cutQueue.shift();
    const bits: string[] = [];
    for (const l of ctx.legends) {
      if (synergy(card, [l]) > 0) {
        bits.push(`works with ${BY_SLUG.get(l)?.name}`);
        break;
      }
    }
    const newRoles = rating(a.slug).roles.filter((r) => ROLE_WORDS[r] && !(victim && rating(victim).roles.includes(r)));
    if (newRoles.length) bits.push(`adds ${ROLE_WORDS[newRoles[0]]}`);
    if (card.sellable && victim && !BY_SLUG.get(victim)?.sellable) bits.push('can be sold for Eddies');
    if (!bits.length) bits.push(victim && rating(a.slug).power > rating(victim).power ? 'a stronger card at its job' : 'rounds out the curve');
    const qty = a.to - a.from;
    out.push(`${qty > 1 ? `+${qty} ` : ''}${card.name}${victim ? ` over ${BY_SLUG.get(victim)?.name}` : ''}: ${bits.join(', ')}.`);
  }
  return out;
}

export function planUpgrades(input: PlanInput): Plan {
  const style = input.style ?? 'balanced';
  const legends = input.legends.filter((l) => BY_SLUG.get(l)?.type === 'Legend');
  const v0 = validate({ legends: input.legends, cards: input.cards, sideboard: {} });
  const baseCost = finishCost(input.legends, input.cards, input.owned);
  const base = {
    score: legends.length === 3 ? Math.round(scoreDeck(legends, input.cards, style) * 10) / 10 : 0,
    cost: baseCost,
    status: budgetStatus(baseCost, input.budget, input.currency),
    legal: v0.legal,
    issues: v0.issues,
  };
  if (legends.length !== 3 || legendNames(legends).size !== 3)
    return { ok: false, base, options: [], notes: ['Pick three different Legends in the Deck Builder first. The planner keeps Legends fixed.'] };

  const lim = ramLimits(legends);
  const pool = CARDS.filter((c) => c.type !== 'Legend' && c.legal === 'legal' && c.text && fitsRam(c, lim));
  const scoreOf = new Map(pool.map((c) => [c.slug, cardScore(c, legends, style)]));

  // Start from the legal part of the list: drop cards over RAM, unknown, or above the copy cap.
  const notes: string[] = [];
  const start: Record<string, number> = {};
  for (const [slug, q] of Object.entries(input.cards)) {
    if (!scoreOf.has(slug)) {
      notes.push(`${BY_SLUG.get(slug)?.name ?? slug} doesn't fit these Legends' RAM, so every option replaces it.`);
      continue;
    }
    start[slug] = Math.min(q, COPY_MAX);
  }
  const locks = input.locks ?? new Set<string>();
  const minQty: Record<string, number> = {};
  for (const s of locks) if (start[s]) minQty[s] = start[s];

  const ctx: Ctx = { legends, owned: input.owned, budget: input.budget, currency: input.currency, minQty, pool, scoreOf, style };
  // Legends are fixed, so any Legend purchase is part of every option's spend.
  const legendCost = finishCost(legends, {}, input.owned);
  const legendSpend = toDisplay(legendCost.knownCad, input.currency);
  if (legendCost.unpriced) notes.push('A Legend you need has no price yet, so no option can be confirmed as within budget.');

  // At a tight budget the starting list itself may be unaffordable. Climb from it anyway: the
  // search can only move toward cheaper lists, so first replace unaffordable missing copies with owned ones.
  const startSpend = spendOf(ctx, start) + legendSpend;
  const relaxed = Math.round(startSpend * 100) > Math.round(input.budget * 100);
  let seed = start;
  // Over 50 cards: trim the weakest extra copies first.
  while (deckSize(seed) > MAIN_MAX) {
    const weakest = Object.keys(seed)
      .filter((s) => seed[s] > (minQty[s] ?? 0))
      .sort((a, b) => (scoreOf.get(a) ?? 0) - (scoreOf.get(b) ?? 0))[0];
    if (!weakest) break;
    seed = { ...seed, [weakest]: seed[weakest] - 1 };
    if (!seed[weakest]) delete seed[weakest];
  }
  if (relaxed) {
    // Trade missing copies for owned ones until the list fits (or nothing owned is left to use).
    seed = { ...start };
    const ownedPool = pool.filter((c) => (input.owned.get(c.slug) ?? 0) > 0).map((c) => c.slug);
    for (let guard = 0; guard < 80; guard++) {
      if (Math.round((spendOf(ctx, seed) + legendSpend) * 100) <= Math.round(input.budget * 100)) break;
      // the costliest unowned copy that isn't locked at its minimum
      const victims = Object.keys(seed)
        .filter((s) => seed[s] > (minQty[s] ?? 0) && seed[s] > (input.owned.get(s) ?? 0))
        .sort((a, b) => (quoteFor(b)?.cad ?? 1e9) - (quoteFor(a)?.cad ?? 1e9));
      const repl = ownedPool
        .filter((s) => (seed[s] ?? 0) < Math.min(COPY_MAX, input.owned.get(s) ?? 0))
        .sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0))[0];
      if (!victims.length || !repl) break;
      seed[victims[0]] -= 1;
      if (!seed[victims[0]]) delete seed[victims[0]];
      seed[repl] = (seed[repl] ?? 0) + 1;
    }
  }
  if (relaxed && Math.round((spendOf(ctx, seed) + legendSpend) * 100) > Math.round(input.budget * 100))
    notes.push(
      Object.keys(minQty).length
        ? 'Even using every card you own, this list still needs purchases over budget. Locked cards you don’t own count toward that.'
        : 'Even using every card you own, this list still needs purchases over budget. The Legends or your collection are the limit.',
    );

  const fewest = climb(ctx, 'fewest', seed, legendSpend);
  const value = climb(ctx, 'value', seed, legendSpend);
  // Greedy search can stall after an early expensive swap, so "strongest" also restarts from the
  // other lenses' results and keeps the best score (ties go to the cheaper list). It can never
  // lose to another option that fits the same budget.
  const strongest = [seed, fewest, value]
    .map((from) => climb(ctx, 'strongest', seed, legendSpend, from))
    .map((cards) => ({ cards, score: scoreDeck(legends, cards, style), spend: spendOf(ctx, cards) }))
    .sort((a, b) => b.score - a.score || a.spend - b.spend)[0].cards;
  const raw: { lens: Lens; cards: Record<string, number> }[] = [
    { lens: 'strongest', cards: strongest },
    { lens: 'fewest', cards: fewest },
    { lens: 'value', cards: value },
  ];

  const key = (c: Record<string, number>) => Object.entries(c).sort().map(([s, n]) => `${s}:${n}`).join(',');
  const startKey = key(input.cards);
  const options: PlanOption[] = [];
  for (const r of raw) {
    const k = key(r.cards);
    if (k === startKey) continue;
    if (deckSize(r.cards) < MAIN_MIN) continue;
    const existing = options.find((o) => key(o.cards) === k);
    if (existing) {
      existing.lenses.push(r.lens);
      continue;
    }
    if (!validate({ legends, cards: r.cards, sideboard: {} }).legal) throw new Error('planner produced an illegal deck');
    const score = Math.round(scoreDeck(legends, r.cards, style) * 10) / 10;
    // An option must actually improve the deck, unless it makes an unaffordable list affordable.
    const cost = finishCost(legends, r.cards, input.owned);
    const status = budgetStatus(cost, input.budget, input.currency);
    const improves = score > base.score + 0.05 || (base.status === 'over' && status !== 'over') || !base.legal;
    if (!improves) continue;
    const { adds, cuts } = diff(ctx, input.cards, r.cards);
    options.push({
      lenses: [r.lens],
      cards: r.cards,
      score,
      gain: Math.round((score - base.score) * 10) / 10,
      adds,
      cuts,
      swaps: adds.reduce((a, c) => a + c.to - c.from, 0),
      cost,
      status,
      reasons: reasonsFor(ctx, adds, cuts),
    });
  }

  if (!options.length) notes.push(...explainNoOption(input, ctx, base.score, legendSpend));
  return { ok: options.length > 0, base, options, notes };
}

/** Why nothing better came out: budget, locks, or the collection itself. */
function explainNoOption(input: PlanInput, ctx: Ctx, baseScore: number, legendSpend: number): string[] {
  const start = Object.fromEntries(Object.entries(input.cards).filter(([s]) => ctx.scoreOf.has(s)));
  const better = (c: Ctx) => {
    const r = climb(c, 'strongest', start, legendSpend);
    return scoreDeck(ctx.legends, r, ctx.style) > baseScore + 0.05 ? r : null;
  };
  const noBudget = { ...ctx, budget: Infinity };
  const unlockedNoBudget = better({ ...noBudget, minQty: {} });
  if (!unlockedNoBudget) return ['This list is already the strongest these Legends can run with the cards rated so far. Nothing to change.'];
  const lockedNoBudget = better(noBudget);
  if (!lockedNoBudget) return ['Your locks are holding the cards that every upgrade would cut. Unlock a card to see options.'];
  // Budget is the blocker: name the cheapest add that would help.
  const adds = diff(ctx, start, lockedNoBudget).adds.filter((a) => a.buyAdded > 0);
  const cheapest = adds.map((a) => ({ a, q: quoteFor(a.slug) })).filter((x) => x.q).sort((x, y) => x.q!.cad - y.q!.cad)[0];
  const atZero = input.budget <= 0;
  const lead = atZero
    ? 'Every upgrade needs a card you don’t own yet, and at $0 every copy must already be in your collection.'
    : 'Every upgrade costs more than this budget.';
  return [cheapest ? `${lead} The cheapest useful buy is ${BY_SLUG.get(cheapest.a.slug)?.name} (${money(cheapest.q!.cad, input.currency)} each).` : lead];
}
