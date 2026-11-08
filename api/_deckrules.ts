// Server-side deck rules + repair for AI output. Mirrors src/lib/decks.ts validate()
// (api/_deckrules.test.ts checks they agree). Pure: no network.
import { API_CARDS, type ApiCard } from './_carddata.js';

export const MAIN_MIN = 40;
export const MAIN_MAX = 50;
export const COPY_MAX = 3;

export const CARD = new Map<string, ApiCard>(API_CARDS.map((c) => [c.slug, c]));
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_NAME = new Map<string, ApiCard>();
for (const c of API_CARDS) {
  BY_NAME.set(norm(c.display), c);
  if (!BY_NAME.has(norm(c.name))) BY_NAME.set(norm(c.name), c);
}

/** Resolve a model-written card name ("Psycho Squad", "Viktor Vektor - Sit Down and Relax") to a card. */
export function resolveName(name: string): ApiCard | undefined {
  return BY_NAME.get(norm(name)) ?? BY_NAME.get(norm(name.replace(/\s+-\s+/, ': ')));
}

export function ramLimits(legends: string[]): Record<string, number> {
  const lim: Record<string, number> = {};
  for (const s of legends) {
    const c = CARD.get(s);
    if (c) lim[c.color] = (lim[c.color] ?? 0) + c.ram;
  }
  return lim;
}

export const fits = (c: ApiCard, lim: Record<string, number>) => c.type === 'Legend' || c.ram <= (lim[c.color] ?? 0);

export function validateDeck(legends: string[], cards: Record<string, number>): string[] {
  const issues: string[] = [];
  const lim = ramLimits(legends);
  if (legends.length !== 3 || new Set(legends).size !== 3 || !legends.every((l) => CARD.get(l)?.type === 'Legend')) issues.push('legends');
  const n = Object.values(cards).reduce((a, b) => a + b, 0);
  if (n < MAIN_MIN || n > MAIN_MAX) issues.push(`size:${n}`);
  for (const [s, q] of Object.entries(cards)) {
    const c = CARD.get(s);
    if (!c || c.type === 'Legend') issues.push(`unknown:${s}`);
    else if (!fits(c, lim)) issues.push(`ram:${s}`);
    if (q > COPY_MAX || q < 1 || !Number.isInteger(q)) issues.push(`copies:${s}`);
  }
  return issues;
}

export interface RepairResult {
  cards: Record<string, number>;
  dropped: string[]; // model picks we had to remove, with reason
  toppedUp: number; // copies added from the baseline to reach 40
}

/**
 * Turn model output into a legal deck the user can actually build:
 * keep only known, owned, RAM-legal cards; clamp copies to min(owned, 3);
 * top up to 40 from the baseline list (then the rest of the pool); trim to 50.
 */
export function repair(
  legends: string[],
  picks: { name: string; qty: number }[],
  owned: Record<string, number>,
  baseline: Record<string, number>,
): RepairResult {
  const lim = ramLimits(legends);
  const cards: Record<string, number> = {};
  const dropped: string[] = [];
  const cap = (slug: string) => Math.min(COPY_MAX, owned[slug] ?? 0);
  for (const p of picks) {
    const c = resolveName(String(p.name ?? ''));
    const qty = Math.max(0, Math.floor(Number(p.qty) || 0));
    if (!c) { dropped.push(`${p.name} (unknown card)`); continue; }
    if (c.type === 'Legend') continue;
    if (!fits(c, lim)) { dropped.push(`${c.display} (over RAM)`); continue; }
    const room = cap(c.slug) - (cards[c.slug] ?? 0);
    if (room <= 0) { dropped.push(`${c.display} (not owned)`); continue; }
    const take = Math.min(qty, room);
    if (take < qty) dropped.push(`${c.display} (only ${cap(c.slug)} usable)`);
    if (take > 0) cards[c.slug] = (cards[c.slug] ?? 0) + take;
  }
  let total = Object.values(cards).reduce((a, b) => a + b, 0);
  let toppedUp = 0;
  const topUp = (order: string[], limit: (s: string) => number) => {
    for (const s of order) {
      while (total < MAIN_MIN && (cards[s] ?? 0) < Math.min(limit(s), cap(s)) && CARD.get(s) && fits(CARD.get(s)!, lim)) {
        cards[s] = (cards[s] ?? 0) + 1;
        total++;
        toppedUp++;
      }
      if (total >= MAIN_MIN) return;
    }
  };
  // Restore baseline counts first, then allow extra copies, then the wider pool.
  if (total < MAIN_MIN) topUp(Object.keys(baseline), (s) => baseline[s]);
  if (total < MAIN_MIN) topUp(Object.keys(baseline), cap);
  if (total < MAIN_MIN) topUp(Object.keys(owned), cap);
  if (total > MAIN_MAX) {
    // Trim copies that weren't in the baseline first, then anything.
    const order = Object.keys(cards).sort((a, b) => (baseline[a] ? 1 : 0) - (baseline[b] ? 1 : 0));
    for (const s of order) {
      while (total > MAIN_MAX && cards[s] > 0) {
        cards[s]--;
        total--;
      }
      if (cards[s] === 0) delete cards[s];
      if (total <= MAIN_MAX) break;
    }
  }
  return { cards, dropped, toppedUp };
}
