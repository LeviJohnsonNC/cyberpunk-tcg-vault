import { BY_SLUG, CARDS, COLORS, RECOMMENDED } from '../data';
import { readDeckText, totalCopies } from '../deckDraft';
import { matchDeckIssues } from './matchDeck';
import type { Deck } from '../store';

export const IMPORT_LIMIT = 128_000;
export const DEFAULT_PLAY_DECK_KEY = 'curated:heist-reloaded';

export const curatedOpponents = RECOMMENDED.map(list => ({
  key: `curated:${list.id}`, label: list.archetype, category: { meta: 'Community meta', budget: 'Budget', brew: 'Brew' }[list.kind],
  deck: { id: `rival:${list.id}`, name: list.name, legends: [...list.legends], cards: { ...list.cards }, sideboard: {}, notes: list.summary, updatedAt: '' } as Deck,
}));
export function deckColors(deck: Deck) {
  return COLORS.filter(color => deck.legends.some(slug => BY_SLUG.get(slug)?.color === color));
}
/** Validate the full supplied list. Sideboards are checked, but never shuffled into best-of-one play. */
export function opponentIssues(deck: Deck) { return matchDeckIssues(deck); }
export const deckSize = (deck: Deck) => `${deck.legends.length} Legends · ${totalCopies(deck.cards)} main${totalCopies(deck.sideboard) ? ` · ${totalCopies(deck.sideboard)} sideboard` : ''}`;

const normalize = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const ambiguousNames = new Set(CARDS.filter(card => CARDS.some(other => other.slug !== card.slug && normalize(other.name) === normalize(card.name))).map(card => normalize(card.name)));
/** Opponent imports must not quietly pick a card variant or drop a line from the supplied list. */
export function readOpponentText(text: string) {
  if (text.length > IMPORT_LIMIT) return { issues: ['This list is too large. Use a text decklist under 128 KB.'] };
  const { deck, unknown } = readDeckText(text);
  const issues = unknown.map(line => `Unrecognized line: ${line}`);
  const seenLegends = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const name = (match?.[2] ?? line).replace(/\s*\([^()]*\)\s*$/, '');
    if (ambiguousNames.has(normalize(name))) issues.push(`Specify the full card name and subtitle: ${name}`);
    const card = CARDS.find(card => normalize(card.display) === normalize(name));
    if (card?.type === 'Legend') {
      if (seenLegends.has(card.slug)) issues.push(`Duplicate Legend line: ${name}`);
      seenLegends.add(card.slug);
    }
    if (card?.type === 'Legend' && match && Number(match[1]) !== 1) issues.push(`Use one copy of each Legend: ${name}`);
  }
  if (deck.name === 'New crew') deck.name = 'Imported rival';
  return { deck, issues: [...new Set([...issues, ...opponentIssues(deck)])] };
}
