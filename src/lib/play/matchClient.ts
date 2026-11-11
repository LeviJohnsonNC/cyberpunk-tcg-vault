import type { DeckDraft } from '../deckDraft';
import type { Deck } from '../store';
import { prepareMatchDeck } from './matchDeck';
import type { MatchAction, MatchResponse, MatchSnapshot, Move, RivalSkill } from './protocol';

async function connectPlayMatch(scope: string, initialAction: MatchAction) {
  const worker = new Worker(new URL('./match.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (snapshot: MatchSnapshot) => void; reject: (error: Error) => void }>();
  let requestId = 0;
  let closed = false;

  function close(message = 'The match was closed.') {
    closed = true;
    worker.terminate();
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  }

  worker.addEventListener('message', ({ data }: MessageEvent<MatchResponse>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if ('error' in data) request.reject(new Error(data.error));
    else request.resolve(data.snapshot);
  });
  worker.addEventListener('error', () => close('Play Mode could not load its engine.'));
  worker.addEventListener('messageerror', () => close('Play Mode could not read the engine response.'));

  function send(action: MatchAction) {
    return new Promise<MatchSnapshot>((resolve, reject) => {
      if (closed) return reject(new Error('The match was closed.'));
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, action, scope });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  try {
    const opening = await send(initialAction);
    return {
      opening,
      move: ({ matchId, view }: MatchSnapshot, move: Move) => send({ type: 'move', matchId, stateID: view.stateID, move }),
      rematch: ({ matchId, view }: MatchSnapshot) => send({ type: 'rematch', matchId, stateID: view.stateID }),
      close: () => close(),
    };
  } catch (error) {
    close();
    throw error;
  }
}

export function openPlayMatch(scope: string, draft: DeckDraft, rival: Deck, replaceMatchId?: string, rivalSkill?: RivalSkill) {
  const setup = { player: prepareMatchDeck(draft.deck), rival: prepareMatchDeck(rival), rivalSkill };
  return connectPlayMatch(scope, { type: 'start', setup, draft, replaceMatchId });
}

export function resumePlayMatch(scope: string) {
  return connectPlayMatch(scope, { type: 'resume' });
}
