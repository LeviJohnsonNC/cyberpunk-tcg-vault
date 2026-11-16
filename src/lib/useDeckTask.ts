import { useEffect, useState } from 'react';
import { startDeckTask, type DeckTask, type DeckTaskResult } from './deckTask';

/** Pass a memoized task. Results belong to that exact input, never the previous settings. */
export function useDeckTask<T extends DeckTask>(task: T | null) {
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState<{
    task: T; attempt: number; result?: DeckTaskResult<T>; error?: string;
  }>();
  useEffect(() => {
    if (!task) return;
    return startDeckTask(task,
      (result) => setCompleted({ task, attempt, result }),
      (error) => setCompleted({ task, attempt, error }));
  }, [task, attempt]);
  const current = completed?.task === task && completed?.attempt === attempt ? completed : undefined;
  return {
    result: current?.result,
    error: current?.error,
    pending: !!task && !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
