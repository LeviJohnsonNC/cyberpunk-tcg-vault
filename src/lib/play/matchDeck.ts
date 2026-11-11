import { BY_SLUG } from '../data';
import { isEngineSupported } from './engineCards';
import { validate } from '../decks';
import type { Deck } from '../store';
import type { MatchDeck } from './protocol';

type Draft = Pick<Deck, 'name' | 'legends' | 'cards' | 'sideboard'>;

export function matchDeckIssues(draft: Draft) {
  const unsupported = [...new Set([...draft.legends, ...Object.keys(draft.cards).filter(slug => draft.cards[slug] > 0)])].filter(slug => !isEngineSupported(slug));
  return [...validate(draft).issues, ...(unsupported.length ? [`Not supported in Play Mode: ${unsupported.map(slug => BY_SLUG.get(slug)?.display ?? slug).join(', ')}`] : [])];
}

export function prepareMatchDeck(draft: Draft): MatchDeck {
  const issues = matchDeckIssues(draft);
  if (issues.length) throw new Error(`${draft.name}: ${issues.join('. ')}`);
  return {
    name: draft.name,
    legends: [...draft.legends],
    mainDeck: Object.entries(draft.cards).flatMap(([slug, count]) => Array<string>(count).fill(slug)),
  };
}
