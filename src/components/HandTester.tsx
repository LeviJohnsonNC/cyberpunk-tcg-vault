// Test hand / Compare hands. A modal over the current screen so the builder draft or planner
// state underneath is untouched. Works on snapshots of the lists passed in; never writes
// decks or the collection. Sample hands are random; "Opening hand odds" are exact.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BY_SLUG } from '../lib/data';
import { validate } from '../lib/decks';
import {
  ANY_SELLABLE, deckStats, draw, keep, mulligan, newTrial, openingOdds, pct, ppDiff, randomSeed, seeded, testIssues,
  type Rng, type Trial,
} from '../lib/handtest';
import { Bars, CardImg } from './bits';

export interface TestDeck {
  /** Column label, e.g. "Starting deck" or "Upgrade". */
  label: string;
  name: string;
  legends: string[];
  cards: Record<string, number>;
  sideboard?: Record<string, number>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function useTrials(decks: TestDeck[]) {
  const rngs = useRef<Rng[]>(decks.map(() => seeded(randomSeed())));
  const deal = (i: number) => (testIssues(decks[i]).length ? null : newTrial(decks[i].cards, rngs.current[i]));
  const [trials, setTrials] = useState<(Trial | null)[]>(() => decks.map((_, i) => deal(i)));
  const update = (i: number, f: (t: Trial, rng: Rng) => Trial) =>
    setTrials((prev) => prev.map((t, j) => (j === i && t ? f(t, rngs.current[i]) : t)));
  return {
    trials,
    keep: (i: number) => update(i, keep),
    mulligan: (i: number) => update(i, mulligan),
    draw: (i: number) => update(i, draw),
    reset: (i?: number) => setTrials((prev) => prev.map((t, j) => (i === undefined || i === j ? deal(j) : t))),
  };
}

export function HandTester({ decks, onClose }: { decks: TestDeck[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const compare = decks.length > 1;
  const { trials, ...act } = useTrials(decks);
  const [tab, setTab] = useState(0);
  const [inspect, setInspect] = useState<string | null>(null);
  // In a comparison, start on the card the upgrade changes most; sellable odds are near 100% in most lists.
  const [target, setTarget] = useState(() => {
    if (decks.length < 2) return ANY_SELLABLE;
    const [a, b] = decks;
    const changed = [...new Set([...Object.keys(a.cards), ...Object.keys(b.cards)])]
      .filter((s) => BY_SLUG.get(s) && BY_SLUG.get(s)!.type !== 'Legend')
      .map((s) => ({ s, d: Math.abs((b.cards[s] ?? 0) - (a.cards[s] ?? 0)) }))
      .filter((x) => x.d > 0)
      .sort((x, y) => y.d - x.d || x.s.localeCompare(y.s));
    return changed[0]?.s ?? ANY_SELLABLE;
  });
  const inspectClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    if (inspect) inspectClose.current?.focus();
  }, [inspect]);

  const stats = useMemo(() => decks.map((d) => deckStats(d.cards)), [decks]);
  const status = useMemo(() => decks.map((d) => validate({ legends: d.legends, cards: d.cards, sideboard: d.sideboard ?? {} })), [decks]);
  const issues = useMemo(() => decks.map((d) => testIssues(d)), [decks]);

  // Cards to ask about: everything in either main deck, by name.
  const choices = useMemo(() => {
    const slugs = new Set(decks.flatMap((d) => Object.keys(d.cards).filter((s) => BY_SLUG.get(s) && BY_SLUG.get(s)!.type !== 'Legend')));
    return [...slugs].map((s) => BY_SLUG.get(s)!).sort((a, b) => a.display.localeCompare(b.display));
  }, [decks]);
  const odds = decks.map((d) => openingOdds(d.cards, target));
  const targetName = target === ANY_SELLABLE ? 'any sellable card' : BY_SLUG.get(target)?.display ?? target;

  const close = () => {
    ref.current?.close();
    onClose();
  };

  const inspected = inspect ? BY_SLUG.get(inspect) : null;

  return (
    <dialog
      ref={ref}
      className="al-dialog tone-accent ht-dialog"
      aria-labelledby="ht-title"
      onCancel={(e) => {
        e.preventDefault();
        if (inspect) setInspect(null);
        else close();
      }}
    >
      <div className="ht-body">
        <header className="ht-head">
          <div>
            <div className="al-eyebrow">{compare ? 'Compare hands' : 'Test hand'}</div>
            <h2 id="ht-title">{compare ? `${decks[0].name} vs upgrade` : decks[0].name || 'Untitled deck'}</h2>
            <p className="tiny muted">Six-card openers with one mulligan, as in the official setup. Legends and sideboard stay out of the draw pile. Nothing here changes your decks or collection.</p>
          </div>
          <button className="btn ghost sm" onClick={close} autoFocus>Close</button>
        </header>

        {compare && (
          <div className="ht-tabs" role="tablist" aria-label="Deck">
            {decks.map((d, i) => (
              <button key={d.label} role="tab" id={`ht-tab-${i}`} aria-controls={`ht-col-${i}`} aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className={`ht-cols ${compare ? 'two' : ''}`}>
          {decks.map((d, i) => {
            const t = trials[i];
            const s = stats[i];
            return (
              <section
                key={d.label}
                id={`ht-col-${i}`}
                className={`ht-col ${tab === i ? 'active' : ''}`}
                role={compare ? 'tabpanel' : undefined}
                aria-labelledby={compare ? `ht-tab-${i}` : undefined}
                aria-label={compare ? undefined : d.label}
              >
                <div className="ht-col-head">
                  <span className="label">{d.label}</span>
                  <span className={`status-tag ${status[i].legal ? 'legal' : 'draft'}`}>{status[i].legal ? 'Legal' : 'Draft'}</span>
                  <span className="mono tiny muted">{plural(s.n, 'card')}</span>
                </div>
                {d.legends.length > 0 && (
                  <p className="tiny muted ht-legends">Legends, not in the pile: {d.legends.map((l) => BY_SLUG.get(l)?.name ?? l).join(', ')}</p>
                )}

                {issues[i].length > 0 || !t ? (
                  <div className="share-note bad" role="alert">
                    <p>Can't deal a hand yet:</p>
                    <ul>{issues[i].map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                ) : (
                  <>
                    <div className="ht-state" aria-live="polite">
                      <b>{t.phase === 'deciding' ? 'Opening hand' : t.mulliganed ? 'Mulliganed to a new six' : 'Kept'}</b>
                      <span className="mono tiny muted">
                        {plural(t.hand.length, 'card')} in hand · {t.library.length} left in deck
                      </span>
                    </div>
                    <ol className="ht-hand" aria-label={`${d.label} hand`}>
                      {t.hand.map((slug, k) => {
                        const c = BY_SLUG.get(slug)!;
                        return (
                          <li key={`${k}-${slug}`}>
                            <button className="ht-card" onClick={() => setInspect(slug)} aria-label={`${c.display}${k >= t.opening ? ', drawn' : ''}. Cost ${c.cost ?? 0}. Inspect.`}>
                              <CardImg slug={slug} alt="" />
                              {k >= t.opening && <span className="ht-drawn">Draw {k - t.opening + 1}</span>}
                              <span className="ht-name">{c.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="row ht-controls">
                      {t.phase === 'deciding' ? (
                        <>
                          <button className="btn" onClick={() => act.keep(i)}>Keep hand</button>
                          <button className="btn quiet" onClick={() => act.mulligan(i)}>Mulligan</button>
                        </>
                      ) : (
                        <button className="btn" onClick={() => act.draw(i)} disabled={!t.library.length}>
                          {t.library.length ? 'Draw 1' : 'Deck is empty'}
                        </button>
                      )}
                      {!compare && <button className="btn ghost" onClick={() => act.reset(i)}>New trial</button>}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>

        {compare && (
          <div className="row ht-both">
            <button className="btn ghost" onClick={() => act.reset()}>New trial for both</button>
          </div>
        )}

        <section className="ht-section" aria-labelledby="ht-shape">
          <h3 id="ht-shape" className="group-h">Deck shape</h3>
          <div className={`ht-shape ${compare ? 'two' : ''}`}>
            {decks.map((d, i) => (
              <div key={d.label} className="ht-shape-col">
                {compare && <div className="label">{d.label}</div>}
                <Bars data={stats[i].curve} />
                <div className="stat-line">
                  Avg cost <b>{stats[i].avgCost.toFixed(2)}</b> · Units <b>{stats[i].units}</b> · Sellable <b>{stats[i].sellable}</b>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ht-section" aria-labelledby="ht-odds">
          <h3 id="ht-odds" className="group-h">Opening hand odds</h3>
          <p className="tiny muted">Exact chance of at least one copy in a fresh six-card opener, calculated from deck size and copies. Not from the sample hands above.</p>
          <label className="ht-pick">
            <span className="label">Card</span>
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value={ANY_SELLABLE}>Any sellable card</option>
              {choices.map((c) => <option key={c.slug} value={c.slug}>{c.display}</option>)}
            </select>
          </label>
          <table className="data ht-odds-table">
            <caption className="sr-only">Opening hand odds for {targetName}</caption>
            <thead>
              <tr>
                <th scope="col">Deck</th>
                <th scope="col" className="num">Copies</th>
                <th scope="col" className="num">In opener</th>
                <th scope="col" className="num">With mulligan</th>
              </tr>
            </thead>
            <tbody>
              {decks.map((d, i) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td className="num">{odds[i].copies}<span className="muted"> / {odds[i].deckSize}</span></td>
                  <td className="num"><b>{pct(odds[i].opening)}</b></td>
                  <td className="num">{pct(odds[i].mulligan)}</td>
                </tr>
              ))}
              {compare && (
                <tr className="ht-diff">
                  <th scope="row">Change</th>
                  <td className="num">{odds[1].copies - odds[0].copies >= 0 ? '+' : '−'}{Math.abs(odds[1].copies - odds[0].copies)}</td>
                  <td className="num"><b>{ppDiff(odds[0].opening, odds[1].opening)}</b></td>
                  <td className="num">{ppDiff(odds[0].mulligan, odds[1].mulligan)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="tiny muted">"With mulligan" assumes you mulligan only when the first six miss.</p>
        </section>
      </div>

      {inspected && (
        <div className="ht-inspect" role="group" aria-label={`${inspected.display} details`}>
          <div className="ht-inspect-card">
            <CardImg slug={inspected.slug} alt={inspected.display} />
            <div>
              <h3>{inspected.display}</h3>
              <p className="mono tiny muted">
                {inspected.type} · Cost {inspected.cost ?? 0}
                {inspected.power != null ? ` · Power ${inspected.power}` : ''}
                {inspected.ram != null ? ` · RAM ${inspected.ram}` : ''}
                {inspected.sellable ? ' · Sellable' : ''}
              </p>
              {inspected.text && <p className="ht-text">{inspected.text}</p>}
              <button ref={inspectClose} className="btn sm" onClick={() => setInspect(null)}>Back to hand</button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
