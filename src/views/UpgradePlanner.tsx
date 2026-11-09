// Budget Upgrade Planner: starting deck + budget -> up to three legal upgrade options.
// Read-only: never writes the collection or the source deck. Works signed out and in demo mode.
import { useDeferredValue, useMemo, useState } from 'react';
import { Masthead } from '../components/ui';
import { CardImg } from '../components/bits';
import { BY_SLUG } from '../lib/data';
import { getCurrency, money } from '../lib/currency';
import { newId, useStore } from '../lib/store';
import { STARTERS } from '../lib/starters';
import { openInBuilder, readUpgradeSource, type UpgradeSource } from '../lib/handoff';
import { LENS_LABEL, planUpgrades, type Change, type FinishCost, type PlanOption, type BudgetStatus } from '../lib/upgrade';

const PRESETS = [0, 10, 25] as const;
type Preset = (typeof PRESETS)[number] | 'custom';
const BASIS_CLASS: Record<string, string> = { Market: 'market', 'Beta proxy': 'proxy', 'Low listing': 'low' };
const name = (slug: string) => BY_SLUG.get(slug)?.name ?? slug;
const sub = (slug: string) => {
  const c = BY_SLUG.get(slug);
  return c && c.display !== c.name ? c.display.slice(c.name.length).replace(/^[:\s]+/, '') : undefined;
};

function sourcesFrom(handed: UpgradeSource | null, decks: ReturnType<typeof useStore>['decks']): UpgradeSource[] {
  const list: UpgradeSource[] = [];
  if (handed) list.push(handed);
  for (const s of STARTERS) list.push({ name: `${s.name} (starter)`, kind: 'starter', legends: s.legends, cards: s.cards });
  for (const d of decks) if (d.legends.length === 3) list.push({ name: d.name, kind: 'saved', legends: d.legends, cards: d.cards });
  // de-duplicate identical lists (the handed-off deck may also be a starter or saved deck)
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.name}|${JSON.stringify(s.cards)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Budgets are entered in the display currency, so they're formatted as-is (not converted). */
const fmtBudget = (b: number) => `$${Number.isInteger(b) ? b : b.toFixed(2)} ${getCurrency()}`;

function StatusBadge({ status, budget, cost }: { status: BudgetStatus; budget: number; cost: FinishCost }) {
  if (status === 'within') return <span className="up-status ok">Within {fmtBudget(budget)}</span>;
  if (status === 'over') return <span className="up-status over">Over {fmtBudget(budget)}</span>;
  return (
    <span className="up-status unknown">
      Can&apos;t confirm: {cost.unpriced} unpriced {cost.unpriced === 1 ? 'copy' : 'copies'}
    </span>
  );
}

function CostLine({ cost, label }: { cost: FinishCost; label: string }) {
  const copies = cost.lines.reduce((a, l) => a + l.buy, 0);
  return (
    <p className="up-cost">
      <span className="label">{label}</span>{' '}
      <b className="num">{money(cost.knownCad)}</b> <span className="muted">{getCurrency()}</span>
      {copies > 0 && <span className="muted"> · {copies} {copies === 1 ? 'copy' : 'copies'} to buy</span>}
      {cost.unpriced > 0 && <span className="weak"> · plus {cost.unpriced} unpriced</span>}
      <span className="up-fine">Card prices before tax and shipping.</span>
    </p>
  );
}

function ChangeRow({ c, kind, onOpen, cost }: { c: Change; kind: 'add' | 'cut'; onOpen: (s: string) => void; cost?: FinishCost }) {
  const qty = Math.abs(c.to - c.from);
  const line = cost?.lines.find((l) => l.slug === c.slug);
  return (
    <li className={`up-row ${kind}`}>
      <span className="up-qty num" aria-label={`${kind === 'add' ? 'add' : 'cut'} ${qty}`}>{kind === 'add' ? '+' : '−'}{qty}</span>
      <button className="up-card" onClick={() => onOpen(c.slug)}>
        <CardImg slug={c.slug} alt="" />
        <span className="up-name">
          <b>{name(c.slug)}</b>
          {sub(c.slug) && <span className="muted">{sub(c.slug)}</span>}
          <span className="up-count muted">{c.from} → {c.to} in deck</span>
        </span>
      </button>
      {kind === 'add' && (
        <span className="up-tags">
          {c.ownedAdded > 0 && <span className="up-chip own">Own {c.ownedAdded}</span>}
          {c.buyAdded > 0 && <span className="up-chip buy">Buy {c.buyAdded}</span>}
          {c.buyAdded > 0 && line?.quote && (
            <span className="up-price">
              <span className="num">{money(line.quote.cad)}</span> ea{' '}
              <span className={`pb-tag basis-${BASIS_CLASS[line.quote.basis] ?? 'low'}`}>{line.quote.basis}</span>
            </span>
          )}
          {c.buyAdded > 0 && line && !line.quote && <span className="pb-tag">Unpriced</span>}
        </span>
      )}
    </li>
  );
}

function OptionCard({ o, budget, onOpen, onUse }: { o: PlanOption; budget: number; onOpen: (s: string) => void; onUse: () => void }) {
  const total = Object.values(o.cards).reduce((a, b) => a + b, 0);
  return (
    <article className="panel up-option" aria-label={o.lenses.map((l) => LENS_LABEL[l]).join(' and ')}>
      <header className="up-option-head">
        <h3>{o.lenses.map((l) => LENS_LABEL[l]).join(' · ')}</h3>
        <span className="badge">+{o.gain} power</span>
        <span className="badge">{o.swaps} {o.swaps === 1 ? 'swap' : 'swaps'}</span>
        <span className="spacer" />
        <StatusBadge status={o.status} budget={budget} cost={o.cost} />
      </header>
      {o.reasons.length > 0 && (
        <ul className="up-reasons">
          {o.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <div className="up-compare">
        <section aria-label="Cuts">
          <div className="label">Cut</div>
          <ul className="up-list">{o.cuts.map((c) => <ChangeRow key={c.slug} c={c} kind="cut" onOpen={onOpen} />)}</ul>
        </section>
        <section aria-label="Adds">
          <div className="label">Add</div>
          <ul className="up-list">{o.adds.map((c) => <ChangeRow key={c.slug} c={c} kind="add" onOpen={onOpen} cost={o.cost} />)}</ul>
        </section>
      </div>
      <CostLine cost={o.cost} label="Cost to finish this deck" />
      <div className="row up-actions">
        <button className="btn" onClick={onUse}>Open upgraded copy</button>
        <details className="up-preview">
          <summary>Preview full list ({total})</summary>
          <ul>
            {Object.entries(o.cards)
              .sort((a, b) => name(a[0]).localeCompare(name(b[0])))
              .map(([s, n]) => <li key={s}><span className="num">{n}</span> {name(s)}{sub(s) ? `: ${sub(s)}` : ''}</li>)}
          </ul>
        </details>
      </div>
    </article>
  );
}

export function UpgradePlanner({ onOpen }: { onOpen: (slug: string) => void }) {
  const { owned, decks, demo } = useStore();
  const [handed] = useState(readUpgradeSource);
  const sources = useMemo(() => sourcesFrom(handed, decks), [handed, decks]);
  const [idx, setIdx] = useState(0);
  const source = sources[Math.min(idx, sources.length - 1)];
  const [preset, setPreset] = useState<Preset>(() => (handed?.budget != null && (PRESETS as readonly number[]).includes(handed.budget) ? (handed.budget as Preset) : 0));
  const [custom, setCustom] = useState('15');
  const [locks, setLocks] = useState<Set<string>>(new Set());
  const currency = getCurrency(); // App re-renders on toggle; the preset amount stays, eligibility recalculates
  const customNum = Math.max(0, Math.min(9999, Number(custom) || 0));
  const budget = preset === 'custom' ? customNum : preset;
  const deferredBudget = useDeferredValue(budget);

  const plan = useMemo(
    () => (source ? planUpgrades({ legends: source.legends, cards: source.cards, owned, budget: deferredBudget, currency, locks }) : null),
    [source, owned, deferredBudget, currency, locks],
  );
  const stale = deferredBudget !== budget;

  const toggleLock = (slug: string) =>
    setLocks((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const openOption = (o: PlanOption) => {
    if (!source) return;
    const changes = [
      ...o.cuts.map((c) => `-${c.from - c.to} ${name(c.slug)}`),
      ...o.adds.map((c) => `+${c.to - c.from} ${name(c.slug)}${c.buyAdded ? ` (buy ${c.buyAdded})` : ''}`),
    ].join(', ');
    openInBuilder({
      id: newId(),
      name: `${source.name.replace(/ \(starter\)$/, '')} (upgraded)`.slice(0, 80),
      legends: [...source.legends],
      cards: { ...o.cards },
      sideboard: {},
      notes: `Upgraded from ${source.name} with the planner (${o.lenses.map((l) => LENS_LABEL[l]).join(', ')}, ${currency} ${budget} budget).\nChanges: ${changes}.`,
      updatedAt: '',
    });
  };

  if (!source)
    return (
      <div className="upgrade">
        <Masthead eyebrow="The Afterlife / Upgrade planner" title="Upgrade" sub="Pick a deck to improve" />
        <div className="callout y">Build or load a deck with three Legends in the Deck Builder, or log a starter deck, then come back here.</div>
      </div>
    );

  const deckCards = Object.entries(source.cards).sort((a, b) => name(a[0]).localeCompare(name(b[0])));

  return (
    <div className="upgrade">
      <Masthead
        eyebrow="The Afterlife / Upgrade planner"
        title="Upgrade"
        sub={<>{source.name} <span className="sep" aria-hidden="true">◆</span> budget in {currency}</>}
      />

      <section className="panel hot up-controls" aria-label="Planner settings">
        <label className="up-field">
          <span className="label">Starting deck</span>
          <select className="select" value={Math.min(idx, sources.length - 1)} onChange={(e) => { setIdx(Number(e.target.value)); setLocks(new Set()); }}>
            {sources.map((s, i) => (
              <option key={i} value={i}>
                {s.name}
                {s.kind === 'generated' ? ' (auto-built)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="up-field">
          <span className="label" id="budget-label">Budget ({currency})</span>
          <div className="up-presets" role="group" aria-labelledby="budget-label">
            {PRESETS.map((p) => (
              <button key={p} className="chip" aria-pressed={preset === p} onClick={() => setPreset(p)}>${p}</button>
            ))}
            <button className="chip" aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>Custom</button>
            {preset === 'custom' && (
              <label className="up-custom">
                <span className="sr-only">Custom budget in {currency}</span>$
                <input className="input" type="number" min={0} max={9999} step={1} inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
                <span className="muted">{currency}</span>
              </label>
            )}
          </div>
        </div>
        <p className="up-help tiny muted">
          {budget === 0 ? 'At $0 every copy must already be in your collection.' : `Spend up to ${fmtBudget(budget)} on cards you don't own.`} Legends stay fixed. Your collection is never changed.
          {demo && ' Using the demo collection.'}
        </p>
      </section>

      {plan && (
        <section className="panel up-base" aria-label="Starting point">
          <div className="row">
            <span className="label">Starting point</span>
            <span className="badge">Power {plan.base.score}</span>
            {!plan.base.legal && <span className="up-status over">Not legal yet</span>}
            <span className="spacer" />
            <StatusBadge status={plan.base.status} budget={budget} cost={plan.base.cost} />
          </div>
          {!plan.base.legal && <p className="tiny weak" style={{ margin: '6px 0 0' }}>{plan.base.issues.join(' · ')}</p>}
          <CostLine cost={plan.base.cost} label="Cost to finish as listed" />
          <details className="up-locks">
            <summary>Lock cards {locks.size > 0 ? `(${locks.size} locked)` : '(keep a card at its current count)'}</summary>
            <div className="up-lock-grid">
              {source.legends.map((l) => (
                <span key={l} className="up-lock fixed">{name(l)} <span className="muted">Legend, fixed</span></span>
              ))}
              {deckCards.map(([s, n]) => (
                <button key={s} className="up-lock" aria-pressed={locks.has(s)} onClick={() => toggleLock(s)}>
                  <span className="num">{n}</span> {name(s)} <span className="up-lock-state">{locks.has(s) ? 'Locked' : 'Lock'}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

      {plan && plan.notes.length > 0 && (
        <div className="callout y up-notes" role="status">
          {plan.notes.map((n) => <p key={n}>{n}</p>)}
          {!plan.options.length && budget === 0 && (
            <div className="row">
              <button className="btn sm" onClick={() => setPreset(10)}>See what $10 {currency} buys</button>
            </div>
          )}
        </div>
      )}

      <div className={`up-options ${stale ? 'is-stale' : ''}`} aria-busy={stale} aria-live="polite">
        {plan?.options.map((o) => (
          <OptionCard key={o.lenses.join()} o={o} budget={budget} onOpen={onOpen} onUse={() => openOption(o)} />
        ))}
      </div>
    </div>
  );
}
