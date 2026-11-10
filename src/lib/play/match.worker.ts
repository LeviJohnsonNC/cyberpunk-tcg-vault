import { updateSavedMatch } from './matchStorage';
import { createMatchController } from './workerController';
import type { ScopedMatchRequest } from './protocol';

self.addEventListener('message', async ({ data }: MessageEvent<ScopedMatchRequest>) => {
  const { id, action, scope } = data;
  try {
    const response = await updateSavedMatch(scope, (previous) => {
      if (action.type === 'start' && previous?.summary.matchId !== action.replaceMatchId) {
        return { response: { id, error: 'A different match was saved in another tab. Reload before starting a new match.' } };
      }
      if (action.type !== 'start' && previous && previous.version !== 1) {
        return { response: { id, error: 'This saved match is from a different version of Play Mode.' } };
      }
      const controller = createMatchController(action.type === 'start' ? undefined : previous);
      const response = controller.respond(data);
      const saved = 'snapshot' in response && action.type !== 'resume' ? controller.save(response.snapshot) : undefined;
      return { response, saved };
    });
    self.postMessage(response);
  } catch {
    self.postMessage({ id, error: 'Play Mode couldn’t access this browser’s match storage. Try again with browser storage enabled.' });
  }
});
