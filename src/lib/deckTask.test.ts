import { describe, expect, it, vi } from 'vitest';
import { startDeckTask, type DeckTask } from './deckTask';

function setup() {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: undefined, onerror: undefined, onmessageerror: undefined } as unknown as Worker;
  const receive = vi.fn();
  const fail = vi.fn();
  const task: DeckTask = { type: 'build', owned: new Map([['example', 3]]), options: {} };
  const cancel = startDeckTask(task, receive, fail, () => worker);
  return { worker, receive, fail, cancel, task };
}

describe('deck task lifecycle', () => {
  it('sends structured collection input and releases a completed worker', () => {
    const { worker, task, receive, fail } = setup();
    expect(worker.postMessage).toHaveBeenCalledWith(task);
    const result = { ok: true, builds: [], considered: 0 };
    worker.onmessage!({ data: { result } } as MessageEvent);
    expect(receive).toHaveBeenCalledWith(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
  });
  it('cancels computation and ignores late replies after settings change or unmount', () => {
    const { worker, receive, fail, cancel } = setup();
    cancel();
    worker.onmessage!({ data: { result: {} } } as MessageEvent);
    worker.onerror!({} as ErrorEvent);
    expect(worker.terminate).toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
  it.each(['onerror', 'onmessageerror'] as const)('reports %s once and stops the worker', (event) => {
    const { worker, fail } = setup();
    (worker[event] as (event: unknown) => void)({});
    (worker[event] as (event: unknown) => void)({});
    expect(fail).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('handles unavailable workers without synchronously calculating on the UI thread', () => {
    const fail = vi.fn();
    startDeckTask({ type: 'build', owned: new Map(), options: {} }, vi.fn(), fail, () => { throw new Error('blocked'); });
    expect(fail).toHaveBeenCalledOnce();
  });
});
