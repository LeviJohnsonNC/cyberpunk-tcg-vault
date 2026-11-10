import { validate } from '../decks';
import type { Deck } from '../store';
import type { MatchDeck } from './protocol';

type Draft = Pick<Deck, 'name' | 'legends' | 'cards' | 'sideboard'>;

export function prepareMatchDeck(draft: Draft): MatchDeck {
  const check = validate(draft);
  if (!check.legal) throw new Error(`${draft.name}: ${check.issues.join('. ')}`);
  return {
    name: draft.name,
    legends: [...draft.legends],
    mainDeck: Object.entries(draft.cards).flatMap(([slug, count]) => Array<string>(count).fill(slug)),
  };
}
