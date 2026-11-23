import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import type { CoachLesson, CoachPlan, CoachRequest, CoachSource } from '../lib/play/coachTypes';
import './ask-coach.css';

type Result = { plan: CoachPlan; lesson?: CoachLesson };
function readLesson(key: string): Result | undefined {
  try {
    const stored = JSON.parse(sessionStorage.getItem('cptv.coach.v2') || 'null');
    if (
      stored?.key === key &&
      stored.result?.plan?.steps?.length &&
      typeof stored.result?.lesson?.explanation === 'string'
    )
      return stored.result;
  } catch {
    /* The table also works without session storage. */
  }
}

function requestPlan(request: CoachRequest, signal: AbortSignal) {
  return new Promise<CoachPlan>((resolve, reject) => {
    const worker = new Worker(new URL('../lib/play/coach.worker.ts', import.meta.url), { type: 'module' });
    const close = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      close();
      reject(new Error('The position changed.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      close();
      if (data.plan) resolve(data.plan);
      else reject(new Error(data.error || 'Could not plan this turn.'));
    };
    worker.onerror = () => {
      close();
      reject(new Error('The coach could not open the game engine.'));
    };
    worker.onmessageerror = () => {
      close();
      reject(new Error('The coach could not read the table.'));
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      close();
      reject(error);
    }
  });
}

export function AskCoach({
  source,
  matchId,
  stateID,
  disabled,
  scope,
}: {
  source: () => CoachSource;
  matchId: string;
  stateID: number;
  disabled: boolean;
  scope: string;
}) {
  const key = JSON.stringify([scope, matchId, stateID]);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const running = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | undefined>(() => readLesson(key));
  const [status, setStatus] = useState('');
  const [retry, setRetry] = useState(false);
  const [working, setWorking] = useState(false);
  const heading = useId();
  useEffect(
    () => () => {
      running.current?.abort();
    },
    []
  );
  const focus = result?.plan.focus;
  useEffect(() => {
    const table = trigger.current?.closest('[data-match-id]');
    if (!focus || !table) return;
    const marked = Array.from(
      table.querySelectorAll<HTMLElement>('[data-card-id],[data-board-card],[data-move]')
    ).filter(
      (el) =>
        focus.cards.includes(el.dataset.boardCard ?? el.dataset.cardId ?? '') ||
        (!focus.cards.length && el.dataset.move === focus.move)
    );
    marked.forEach((el) => {
      el.dataset.coachPick = 'true';
    });
    return () =>
      marked.forEach((el) => {
        delete el.dataset.coachPick;
      });
  }, [focus]);
  async function ask() {
    if (!dialog.current?.open) dialog.current?.showModal();
    if (running.current || (result && !retry)) return;
    const task = new AbortController();
    running.current = task;
    setWorking(true);
    setRetry(false);
    let plan = result?.plan;
    try {
      if (!plan) {
        setStatus('Reading the table…');
        plan = await requestPlan({ source: source(), matchId, stateID }, task.signal);
        if (task.signal.aborted) return;
        setResult({ plan });
      }
      if (plan.forced) {
        setStatus('');
        return;
      }
      const session = supabase && (await supabase.auth.getSession()).data.session;
      if (task.signal.aborted) return;
      if (!session) {
        setStatus('Sign in for an additional Gemini lesson on this position.');
        return;
      }
      setStatus('Gemini is explaining this line…');
      const payload = {
        steps: plan.steps,
        alternative: plan.alternative,
        continuation: plan.continuation,
        facts: plan.facts.slice(0, 32),
      };
      // Keep the line and its branches intact on crowded boards; trim supplemental card text first.
      while (payload.facts.length && JSON.stringify(payload).length > 19500) payload.facts.pop();
      const response = await fetch('/api/ask-coach', {
        method: 'POST',
        signal: task.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (response.status === 429 || response.status === 401) {
          setStatus(
            response.status === 429
              ? 'Today’s Gemini allowance is used up. Your turn plan is ready.'
              : 'Sign in again for the Gemini lesson.'
          );
          return;
        }
        throw new Error('Gemini is unavailable. Your turn plan is ready.');
      }
      const lesson: CoachLesson = await response.json();
      if (typeof lesson?.explanation !== 'string' || typeof lesson.watchFor !== 'string')
        throw new Error('Gemini could not finish the lesson.');
      if (task.signal.aborted) return;
      const complete = { plan, lesson };
      setResult(complete);
      setStatus('');
      try {
        sessionStorage.setItem('cptv.coach.v2', JSON.stringify({ key, result: complete }));
      } catch {
        /* In-memory caching still works. */
      }
    } catch (error) {
      if (!task.signal.aborted) {
        setStatus(error instanceof Error ? error.message : 'The coach is temporarily unavailable.');
        setRetry(true);
      }
    } finally {
      if (!task.signal.aborted) {
        running.current = null;
        setWorking(false);
      }
    }
  }
  const plan = result?.plan;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn quiet coach-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => void ask()}
      >
        Ask Coach
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <dialog ref={dialog} className="al-dialog coach-dialog" aria-labelledby={heading}>
            <header>
              <h2 id={heading}>Your turn plan</h2>
              <form method="dialog">
                <button type="submit" className="btn quiet">
                  Back to table
                </button>
              </form>
            </header>
            {plan && (
              <>
                <section className="coach-next">
                  <h3>Play now</h3>
                  <strong>{plan.steps[0].title}</strong>
                  <p>{plan.steps[0].why}</p>
                </section>
                {plan.steps.length > 1 && (
                  <section>
                    <h3>Then play</h3>
                    <ol>
                      {plan.steps.slice(1).map((s, i) => (
                        <li key={i}>
                          <strong>{s.title}</strong>
                          <p>{s.why}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {plan.alternative && (
                  <section>
                    <h3>Another option</h3>
                    <strong>{plan.alternative.title}</strong>
                    <p>{plan.alternative.why}</p>
                  </section>
                )}
                {!!plan.continuation.length && (
                  <section>
                    <h3>As the turn unfolds</h3>
                    <ul>
                      {plan.continuation.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {result.lesson && (
                  <section className="coach-lesson">
                    <h3>Gemini’s lesson</h3>
                    <p>{result.lesson.explanation}</p>
                    <h3>What to watch for</h3>
                    <p>{result.lesson.watchFor}</p>
                  </section>
                )}
              </>
            )}
            <p role="status" className="coach-status">
              {status}
            </p>
            {retry && (
              <button className="btn quiet" disabled={working} onClick={() => void ask()}>
                {plan ? 'Retry Gemini lesson' : 'Retry turn plan'}
              </button>
            )}
          </dialog>,
          document.body
        )}
    </>
  );
}
