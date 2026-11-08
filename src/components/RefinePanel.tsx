// "Refine with AI" (Phase 3): sends one auto-built deck to /api/refine-deck.
// The model only proposes; the server repairs and validates, so anything shown here is legal and owned.
import { useEffect, useRef, useState } from 'react';
import { BY_SLUG, cad, refPrice } from '../lib/data';
import type { Build, Style } from '../lib/autobuild';
import { useStore } from '../lib/store';

export interface RefineResult {
  legends: string[];
  cards: Record<string, number>;
  summary: string;
  plan: string[];
  mulligan: string;
  swaps: { out: string | null; in: string; why: string }[];
  buy: { slug: string; why: string }[];
  repaired: { dropped: string[]; toppedUp: number };
  remaining: number | null;
  unlimited: boolean;
}

const CACHE_KEY = 'cptv.refine.v1';
const name = (s: string | null) => (s ? BY_SLUG.get(s)?.name ?? s : '');

function cacheGet(key: string): RefineResult | null {
  try {
    return (JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, RefineResult>)[key] ?? null;
  } catch {
    return null;
  }
}
function cachePut(key: string, r: RefineResult) {
  try {
    const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, RefineResult>;
    all[key] = r;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: no cache */
  }
}

export function refineKey(b: Build, style: Style, must: string[]) {
  const cards = Object.entries(b.cards).sort().map(([s, n]) => `${s}:${n}`).join(',');
  return [b.legends.join('+'), style, must.join('+'), cards].join('|');
}

export function RefinePanel({
  build,
  style,
  must,
  onOpen,
  onOpenDeck,
  onClose,
}: {
  build: Build;
  style: Style;
  must: string[];
  onOpen: (slug: string) => void;
  onOpenDeck: (r: RefineResult) => void;
  onClose: () => void;
}) {
  const { session, owned } = useStore();
  const key = refineKey(build, style, must);
  const [state, setState] = useState<{ status: 'loading' | 'done' | 'error'; result?: RefineResult; error?: string; retry?: boolean }>(() => {
    const hit = cacheGet(key);
    return hit ? { status: 'done', result: hit } : { status: 'loading' };
  });
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    ref.current?.focus({ preventScroll: true });
  }, [key]);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await fetch('/api/refine-deck', {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ legends: build.legends, baseline: build.cards, owned: Object.fromEntries(owned), style, mustInclude: must }),
        });
        const data = (await r.json().catch(() => ({}))) as RefineResult & { error?: string };
        if (!r.ok) {
          const fallback: Record<number, string> = {
            401: 'Sign in to refine decks with AI.',
            429: "You've used today's AI refinements. They reset at midnight UTC.",
            503: 'AI refinement is not set up on this server yet.',
          };
          setState({ status: 'error', retry: !fallback[r.status], error: data.error ?? fallback[r.status] ?? `Something went wrong (${r.status}). Your build is unchanged.` });
          return;
        }
        cachePut(key, data);
        setState({ status: 'done', result: data });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error', retry: true, error: 'Could not reach the server. Check your connection and try again.' });
      }
    })();
    return () => ctl.abort();
    // owned/session are read at request time; re-running on their identity would double-spend a use
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state.status]);

  const r = state.result;
  const buyTotal = r ? r.buy.reduce((a, b) => a + refPrice(b.slug), 0) : 0;
  const changed = r
    ? Object.keys({ ...r.cards, ...build.cards }).reduce((a, s) => a + Math.abs((r.cards[s] ?? 0) - (build.cards[s] ?? 0)), 0) / 2
    : 0;

  return (
    <section ref={ref} tabIndex={-1} className="refine panel" aria-live="polite" aria-busy={state.status === 'loading'} aria-labelledby="refine-title">
      <div className="panel-title" id="refine-title">
        AI refinement <span className="aside">{build.legends.map(name).join(' · ')}</span>
      </div>

      {state.status === 'loading' && (
        <div className="refine-loading">
          <span className="loader" />
          <p className="tiny muted" style={{ margin: 0 }}>Reading your pool and tuning the list. This takes 10 to 30 seconds.</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="callout y">
          <p style={{ margin: '0 0 8px' }}>{state.error}</p>
          <div className="row">
            {state.retry && <button className="btn quiet sm" onClick={() => setState({ status: 'loading' })}>Try again</button>}
            <button className="btn quiet sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {r && state.status === 'done' && (
        <div className="refine-body">
          <div className="refine-main">
            {r.summary && <p className="refine-summary">{r.summary}</p>}
            {r.plan.length > 0 && (
              <>
                <div className="label">Game plan</div>
                <ol className="refine-list">{r.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </>
            )}
            {r.mulligan && (
              <p className="tiny"><span className="label">Mulligan</span> {r.mulligan}</p>
            )}
          </div>
          <div className="refine-side">
            <div className="label">Swaps ({changed} {changed === 1 ? 'card' : 'cards'} changed)</div>
            {r.swaps.length === 0 ? (
              <p className="tiny muted">No swaps worth making. The auto-build already fits your pool.</p>
            ) : (
              <ul className="refine-swaps">
                {r.swaps.map((s, i) => (
                  <li key={i}>
                    <div>
                      {s.out && <><a href="#" className="out" onClick={(e) => { e.preventDefault(); onOpen(s.out!); }}>{name(s.out)}</a> <span aria-label="becomes">→</span> </>}
                      <a href="#" className="in" onClick={(e) => { e.preventDefault(); onOpen(s.in); }}>{name(s.in)}</a>
                    </div>
                    {s.why && <div className="tiny muted">{s.why}</div>}
                  </li>
                ))}
              </ul>
            )}
            {r.buy.length > 0 && (
              <>
                <div className="label">Worth buying <span className="num">{cad(buyTotal)}</span></div>
                <ul className="refine-swaps">
                  {r.buy.map((b) => (
                    <li key={b.slug}>
                      <div>
                        <a href="#" onClick={(e) => { e.preventDefault(); onOpen(b.slug); }}>{name(b.slug)}</a> <span className="num">{cad(refPrice(b.slug))}</span>
                      </div>
                      {b.why && <div className="tiny muted">{b.why}</div>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="refine-foot">
            {(r.repaired.dropped.length > 0 || r.repaired.toppedUp > 0) && (
              <p className="tiny weak" style={{ margin: 0 }}>
                Fixed the AI&apos;s list before showing it:{' '}
                {[...r.repaired.dropped.slice(0, 4), r.repaired.toppedUp ? `${r.repaired.toppedUp} copies added back to reach 40` : '']
                  .filter(Boolean)
                  .join('; ')}
                .
              </p>
            )}
            <div className="row">
              <button className="btn sm" onClick={() => onOpenDeck(r)}>Open refined deck</button>
              <button className="btn quiet sm" onClick={onClose}>Close</button>
              <span className="spacer" />
              <span className="tiny muted">
                {r.unlimited ? 'Unlimited refinements' : r.remaining != null ? `${r.remaining} AI ${r.remaining === 1 ? 'refinement' : 'refinements'} left today` : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
