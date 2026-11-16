import type { BuildOptions, BuildResult } from './autobuild';
import type { PlanInput, Plan } from './upgrade';

export type DeckTask =
  | { type: 'build'; owned: Map<string, number>; options: BuildOptions }
  | { type: 'upgrade'; input: PlanInput };
export type DeckTaskResult<T extends DeckTask> = T extends { type: 'build' } ? BuildResult : Plan;
export type DeckTaskResponse = { result: BuildResult | Plan } | { error: string };

/** Each job owns its worker. Cancelling also stops the calculation, not just its reply. */
export function startDeckTask<T extends DeckTask>(
  task: T,
  receive: (result: DeckTaskResult<T>) => void,
  fail: (message: string) => void,
  create = () => new Worker(new URL('./deck.worker.ts', import.meta.url), { type: 'module' }),
) {
  let worker: Worker | undefined;
  let active = true;
  const stop = () => { active = false; worker?.terminate(); };
  const error = () => {
    if (!active) return;
    stop();
    fail('Could not calculate suggestions. Please try again.');
  };
  try {
    worker = create();
    worker.onmessage = ({ data }: MessageEvent<DeckTaskResponse>) => {
      if (!active) return;
      if ('error' in data) { error(); return; }
      stop();
      receive(data.result as DeckTaskResult<T>);
    };
    worker.onerror = error;
    worker.onmessageerror = error;
    worker.postMessage(task);
  } catch { error(); }
  return stop;
}
