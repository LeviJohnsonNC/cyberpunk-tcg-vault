import { autobuild } from './autobuild';
import { planUpgrades } from './upgrade';
import type { DeckTask, DeckTaskResponse } from './deckTask';

self.addEventListener('message', ({ data }: MessageEvent<DeckTask>) => {
  let response: DeckTaskResponse;
  try {
    response = { result: data.type === 'build'
      ? autobuild(data.owned, data.options)
      : planUpgrades(data.input) };
  } catch { response = { error: 'Calculation failed' }; }
  self.postMessage(response);
});
