// Unlisted deck share links. The database side is migration 005: one frozen snapshot per saved
// deck behind a random token, readable only through get_shared_deck(token).
import { BY_SLUG } from './data';
import { COPY_MAX, MAIN_MAX, SIDEBOARD_SIZE, deckNeed, purchaseEstimate, validate, type PurchaseEstimate } from './decks';
import { supabase } from './supabase';
import type { Deck } from './store';

export const TOKEN_RE = /^[0-9a-f]{32}$/;

export interface Share {
  token: string;
  createdAt: string;
}

export interface SharedDeck {
  name: string;
  legends: string[];
  cards: Record<string, number>;
  sideboard: Record<string, number>;
  createdAt: string;
  /** Slugs in the snapshot this app doesn't know (newer data or a damaged row). Not shown or priced. */
  dropped: string[];
}

type DeckList = Pick<Deck, 'name' | 'legends' | 'cards' | 'sideboard'>;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Why a deck can't be published. A list that is merely unfinished is fine: it shares as a Draft. */
export function shareBlockers(d: DeckList): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Give the deck a name');
  const slugs = [...d.legends, ...Object.keys(d.cards), ...Object.keys(d.sideboard)];
  const unknown = slugs.filter((s) => !BY_SLUG.has(s));
  if (unknown.length) out.push(`Unknown cards: ${unknown.join(', ')}`);
  if (d.legends.length > 3 || d.legends.some((s) => BY_SLUG.get(s) && BY_SLUG.get(s)!.type !== 'Legend')) out.push('At most 3 Legends');
  const over = Object.keys({ ...d.cards, ...d.sideboard }).filter((s) => (d.cards[s] ?? 0) + (d.sideboard[s] ?? 0) > COPY_MAX);
  if (over.length) out.push(`More than ${COPY_MAX} copies: ${over.map((s) => BY_SLUG.get(s)?.name ?? s).join(', ')}`);
  if (sum(d.cards) > MAIN_MAX) out.push(`Main deck over ${MAIN_MAX} cards`);
  if (sum(d.sideboard) > SIDEBOARD_SIZE) out.push(`Sideboard over ${SIDEBOARD_SIZE} cards`);
  if (sum(d.cards) + d.legends.length === 0) out.push('Add some cards first');
  return out;
}

/** "Legal" when the deck passes every rule, otherwise "Draft" (shared for feedback). */
export function shareStatus(d: Pick<Deck, 'legends' | 'cards' | 'sideboard'>) {
  const v = validate(d);
  return { legal: v.legal, label: v.legal ? 'Legal' : 'Draft', issues: v.issues };
}

const cleanZone = (raw: unknown, dropped: Set<string>): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [s, q] of Object.entries(raw as Record<string, unknown>)) {
    if (!BY_SLUG.has(s) || BY_SLUG.get(s)!.type === 'Legend') { dropped.add(s); continue; }
    if (typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= COPY_MAX) out[s] = q;
  }
  return out;
};

/** Turn a row from get_shared_deck into a deck this app can render. Never trusts the row. */
export function sanitizeShared(row: { name?: unknown; legends?: unknown; cards?: unknown; sideboard?: unknown; created_at?: unknown }): SharedDeck {
  const dropped = new Set<string>();
  const legends = (Array.isArray(row.legends) ? row.legends : [])
    .filter((s): s is string => typeof s === 'string')
    .filter((s) => (BY_SLUG.get(s)?.type === 'Legend' ? true : (dropped.add(s), false)))
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, 3);
  return {
    name: (typeof row.name === 'string' && row.name.trim() ? row.name : 'Untitled deck').slice(0, 80),
    legends,
    cards: cleanZone(row.cards, dropped),
    sideboard: cleanZone(row.sideboard, dropped),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    dropped: [...dropped],
  };
}

export interface CompareRow {
  slug: string;
  main: number; // copies in Legends + main deck
  side: number;
  need: number;
  have: number; // owned copies allocated to this list (counted once across sections)
}

export interface Comparison {
  rows: CompareRow[];
  have: number;
  total: number;
  /** Legends + main deck: what it takes to play the deck. Matches Meta Intel and the planner. */
  play: PurchaseEstimate;
  /** The whole list including the sideboard. Its lines are the shopping list. */
  full: PurchaseEstimate;
  /** Extra copies the sideboard adds beyond the main deck's needs. */
  side: { copies: number; knownCad: number; unpriced: number };
  canBuild: boolean; // owns every Legend + main deck copy
}

export function compareDeck(d: Pick<Deck, 'legends' | 'cards' | 'sideboard'>, owned: Map<string, number>): Comparison {
  const playNeed = deckNeed(d);
  const fullNeed: Record<string, number> = { ...playNeed };
  for (const [s, n] of Object.entries(d.sideboard)) fullNeed[s] = (fullNeed[s] ?? 0) + n;
  const rows: CompareRow[] = Object.entries(fullNeed).map(([slug, need]) => ({
    slug,
    main: playNeed[slug] ?? 0,
    side: d.sideboard[slug] ?? 0,
    need,
    have: Math.min(need, owned.get(slug) ?? 0),
  }));
  const play = purchaseEstimate(playNeed, owned);
  const full = purchaseEstimate(fullNeed, owned);
  return {
    rows,
    have: rows.reduce((a, r) => a + r.have, 0),
    total: rows.reduce((a, r) => a + r.need, 0),
    play,
    full,
    side: { copies: full.copies - play.copies, knownCad: full.knownCad - play.knownCad, unpriced: full.unpriced - play.unpriced },
    canBuild: play.copies === 0,
  };
}

/** The link to post. /d/<token> serves a link preview, then opens the reader. */
export const shareUrl = (token: string, origin = window.location.origin) => `${origin}/d/${token}`;

/** A private, unsaved copy for the Deck Builder. */
export function copyForBuilder(s: SharedDeck, id: string): Deck {
  return { id, name: `Copy of ${s.name}`.slice(0, 80), legends: [...s.legends], cards: { ...s.cards }, sideboard: { ...s.sideboard }, notes: '', updatedAt: '' };
}

// ---------- Supabase calls ----------

const friendly = (msg: string) =>
  /publish_deck_share|get_shared_deck|deck_shares/.test(msg) && /(not find|does not exist)/i.test(msg)
    ? 'Sharing needs database migration 005.'
    : msg;

/** The owner's current share for a deck, or null. */
export async function getShare(deckId: string): Promise<{ share: Share | null; error?: string }> {
  if (!supabase) return { share: null, error: 'Sharing needs an account.' };
  const { data, error } = await supabase.from('deck_shares').select('token, created_at').eq('deck_id', deckId).maybeSingle();
  if (error) return { share: null, error: friendly(error.message) };
  return { share: data ? { token: data.token, createdAt: data.created_at } : null };
}

/** Publish the saved deck (or return its existing link). replace = new link, old one stops working. */
export async function publishShare(deckId: string, replace = false): Promise<{ share?: Share; error?: string }> {
  if (!supabase) return { error: 'Sharing needs an account.' };
  const { data, error } = await supabase.rpc('publish_deck_share', { p_deck_id: deckId, p_replace: replace });
  if (error) return { error: friendly(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) return { error: 'The server did not return a link.' };
  return { share: { token: row.token, createdAt: row.created_at } };
}

export async function revokeShare(deckId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Sharing needs an account.' };
  const { error } = await supabase.from('deck_shares').delete().eq('deck_id', deckId);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export type LoadResult = { deck: SharedDeck } | { missing: true } | { error: string };

/** Anyone can call this, signed in or not. */
export async function loadShared(token: string): Promise<LoadResult> {
  if (!TOKEN_RE.test(token)) return { missing: true };
  if (!supabase) return { error: 'This copy of Cyberpunk TCG Vault has no database connected.' };
  const { data, error } = await supabase.rpc('get_shared_deck', { p_token: token });
  if (error) return { error: friendly(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { deck: sanitizeShared(row) } : { missing: true };
}
