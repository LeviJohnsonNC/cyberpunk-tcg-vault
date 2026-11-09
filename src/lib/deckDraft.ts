import { BY_SLUG, CARDS, type Card } from './data';
import { COPY_MAX } from './decks';
import { newId, type Deck } from './store';

export type DeckZone = 'cards' | 'sideboard';
export type DeckDraft = { deck: Deck; dirty: boolean };

export const totalCopies = (cards: Record<string, number>) => Object.values(cards).reduce((total, count) => total + count, 0);
export const newDeck = (): Deck => ({ id: newId(), name: 'New crew', legends: [], cards: {}, sideboard: {}, notes: '', updatedAt: '' });

export function addDeckCard(deck: Deck, card: Card, zone: DeckZone): { deck: Deck; destination: DeckZone | 'crew' } | { error: string } {
  if (card.type === 'Legend') {
    if (deck.legends.includes(card.slug)) return { error: 'Legend already in crew' };
    if (deck.legends.length >= 3) return { error: 'Crew already has 3 Legends. Remove one first.' };
    return { deck: { ...deck, legends: [...deck.legends, card.slug] }, destination: 'crew' };
  }

  const qty = deck[zone][card.slug] ?? 0;
  const other = zone === 'cards' ? deck.sideboard : deck.cards;
  if (qty + (other[card.slug] ?? 0) >= COPY_MAX) return { error: 'Max 3 copies across Main and Sideboard' };
  return { deck: { ...deck, [zone]: { ...deck[zone], [card.slug]: qty + 1 } }, destination: zone };
}

const key = (owner: string) => `cptv.builderDraft.v1:${owner}`;

export function readDeckDraft(owner: string): DeckDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key(owner));
    if (raw) {
      const draft = JSON.parse(raw) as DeckDraft;
      if (draft.deck?.id && typeof draft.deck.name === 'string' && Array.isArray(draft.deck.legends) && draft.deck.cards && draft.deck.sideboard) return draft;
    }
  } catch {
    // Recovery is optional when browser storage is unavailable.
  }
}

export function rememberDeckDraft(owner: string, draft: DeckDraft) {
  try {
    sessionStorage.setItem(key(owner), JSON.stringify(draft));
  } catch {
    // A regular deck save is still available.
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cardNames = new Map<string, Card>();
for (const card of CARDS) {
  cardNames.set(normalize(card.display), card);
  if (!cardNames.has(normalize(card.name))) cardNames.set(normalize(card.name), card);
}

export function readDeckText(text: string) {
  const deck = newDeck();
  let zone: DeckZone = 'cards';
  const unknown: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      const label = line.slice(2).trim();
      if (/^sideboard(?:\s*[:(·]|\s+\d|$)/i.test(label)) zone = 'sideboard';
      else if (/^main(?: deck)?(?:\s*[:(·]|\s+\d|$)/i.test(label)) zone = 'cards';
      else if (!/^legends?(?:\s*[:(·]|\s+\d|$)/i.test(label) && deck.name === 'New crew' && label) deck.name = label.slice(0, 80);
      continue;
    }
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty = match ? Number(match[1]) : 1;
    const name = (match?.[2] ?? line).replace(/\s*\(.*\)\s*$/, '');
    const card = cardNames.get(normalize(name));
    if (!card || !Number.isSafeInteger(qty) || qty < 1) { unknown.push(line); continue; }
    if (card.type === 'Legend') {
      if (!deck.legends.includes(card.slug)) deck.legends.push(card.slug);
    } else {
      deck[zone][card.slug] = (deck[zone][card.slug] ?? 0) + qty;
    }
  }
  return { deck, unknown };
}

export function formatDeckText(deck: Deck) {
  const lines = [`// ${deck.name}`, '// Legends', ...deck.legends.map((slug) => `1 ${BY_SLUG.get(slug)?.display ?? slug}`), '// Main'];
  const main = Object.entries(deck.cards).sort(([a], [b]) => (BY_SLUG.get(a)?.cost ?? 0) - (BY_SLUG.get(b)?.cost ?? 0));
  for (const [slug, qty] of main) lines.push(`${qty} ${BY_SLUG.get(slug)?.display ?? slug}`);
  if (totalCopies(deck.sideboard)) {
    lines.push('// Sideboard');
    for (const [slug, qty] of Object.entries(deck.sideboard)) lines.push(`${qty} ${BY_SLUG.get(slug)?.display ?? slug}`);
  }
  return lines.join('\n');
}
