// Price Book: reference implementation of the Afterlife design language.
// See docs/design-system.md. Uses only semantic tokens (src/theme.css) and pricebook.css.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PRICES, imageUrl, shortSet } from '../lib/data';
import { getCurrency, money, toDisplay } from '../lib/currency';
import { buildPriceBook, sortLines, toCsv, type Basis, type Group, type Line, type SortKey } from '../lib/pricebook';
import { useStore } from '../lib/store';
import { Masthead, MetricStrip } from '../components/ui';
import './pricebook.css';

const BASIS_CLASS: Record<string, string> = { Market: 'market', 'Beta proxy': 'proxy', 'Low listing': 'low' };
const COLOR_VAR: Record<string, string> = {
  Yellow: 'var(--color-card-yellow)',
  Blue: 'var(--color-card-blue)',
  Red: 'var(--color-card-red)',
  Green: 'var(--color-card-green)',
};
const rarityClass = (r: string) =>
  r === 'Epic' ? 'epic' : r === 'Rare' ? 'rare' : /Secret|Iconic|Nova/.test(r) ? 'top' : 'base';

function BasisTag({ basis }: { basis: Basis | null }) {
  if (!basis) return <span className="pb-tag">Unpriced</span>;
  return <span className={`pb-tag basis-${BASIS_CLASS[basis]}`}>{basis}</span>;
}

function Thumb({ slug, className }: { slug: string; className: string }) {
  const [err, setErr] = useState(false);
  return err ? (
    <span className={`${className} pb-noart`} aria-hidden="true">No art</span>
  ) : (
    <img className={className} src={imageUrl(slug)} alt="" loading="lazy" onError={() => setErr(true)} />
  );
}

/* ---------- marquee ---------- */
function Skyline() {
  return (
    <svg className="pb-skyline" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 160V96h34V70h22v26h18V40h30v56h16V82h26V54h12V30h24v24h10v42h28V64h20v32h18V48h34v48h14V20h26v76h22V60h18v36h30V76h24V44h28v52h20V66h26v94z" />
      <path className="far" d="M0 160v-30h50v-22h40v22h60v-40h30v40h80v-28h50v28h70v-46h40v46h90v-20h50v20h40v30z" />
    </svg>
  );
}

function Marquee({ top, loading, onOpen, goAdd }: { top: Line | null; loading: boolean; onOpen: (s: string) => void; goAdd: () => void }) {
  const [artErr, setArtErr] = useState(false);
  if (loading) {
    return (
      <section className="pb-marquee is-loading" aria-busy="true" aria-label="Most valuable card, loading">
        <span className="pb-ticket">Most valuable card</span>
        <div className="pb-marquee-copy">
          <div className="pb-skel" style={{ width: '60%', height: 52 }} />
          <div className="pb-skel" style={{ width: '35%', height: 18, marginTop: 10 }} />
        </div>
        <Skyline />
      </section>
    );
  }
  if (!top) {
    return (
      <section className="pb-marquee is-empty" aria-label="Most valuable card">
        <span className="pb-ticket">Most valuable card</span>
        <div className="pb-marquee-copy">
          <h2 className="pb-marquee-name">Nothing on the books</h2>
          <p className="pb-marquee-sub">Add cards and your most valuable one headlines here.</p>
          <button className="btn quiet" onClick={goAdd}>Add cards</button>
        </div>
        <Skyline />
      </section>
    );
  }
  const { card } = top;
  return (
    <section className="pb-marquee" aria-label="Most valuable card">
      <span className="pb-ticket">Most valuable card</span>
      <div className="pb-marquee-copy">
        <h2 className="pb-marquee-name">{card.name}</h2>
        {card.sub && <p className="pb-marquee-sub">{card.sub}</p>}
        <p className="pb-marquee-price">
          <span className="num">{money(top.unit)}</span>
          <span className="pb-marquee-basis">{top.basis ?? 'Unpriced'}</span>
          <span className="sr-only"> per copy</span>
        </p>
      </div>
      <Skyline />
      <button className="pb-marquee-card" onClick={() => onOpen(card.slug)} aria-label={`Open ${card.display}`}>
        {artErr ? (
          <span className="pb-marquee-noart">{card.name}</span>
        ) : (
          <img src={imageUrl(card.slug)} alt="" onError={() => setArtErr(true)} />
        )}
      </button>
    </section>
  );
}

/* ---------- breakdown rail ---------- */
function Breakdown({ title, groups, total, fill, children }: { title: string; groups: Group[]; total: number; fill: (k: string) => string; children?: ReactNode }) {
  const max = Math.max(0.01, ...groups.map((g) => g.value));
  return (
    <section className="pb-breakdown" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span className="pb-unit">{getCurrency()}</span>
      </header>
      {groups.length === 0 && <p className="pb-dim">Nothing to break down yet.</p>}
      <ul>
        {groups.map((g) => (
          <li key={g.key}>
            <span className="pb-bk-label">
              {g.key} <span className="pb-dim">×{g.count}</span>
            </span>
            <span className="pb-bar" role="img" aria-label={`${Math.round((g.value / (total || 1)) * 100)}% of value`}>
              <span style={{ width: `${(g.value / max) * 100}%`, background: fill(g.key) } as CSSProperties} />
            </span>
            <span className="pb-bk-value num">{money(g.value)}</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

/* ---------- page ---------- */
export function PriceBook({ onOpen, goAdd }: { onOpen: (slug: string) => void; goAdd: () => void }) {
  const { entries, syncing } = useStore();
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const pb = useMemo(() => buildPriceBook(entries), [entries]);
  const sorted = useMemo(() => sortLines(pb.lines, sortBy), [pb.lines, sortBy]);
  const loading = syncing && entries.length === 0;

  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(sorted, (n) => toDisplay(n), getCurrency())], { type: 'text/csv' }));
    a.download = `cyberpunk-tcg-pricebook-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const updated = new Date(PRICES.updatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="pb">
      <div className="pb-hero">
        <Masthead
          size="hero"
          eyebrow="The Afterlife / Night Market"
          title={<>Price <br />Book</>}
          sub={<>Near Mint prices <span className="sep" aria-hidden="true">◆</span> {getCurrency()}</>}
        />
        <Marquee top={pb.top} loading={loading} onOpen={onOpen} goAdd={goAdd} />
      </div>

      <MetricStrip
        items={[
          { label: 'Total value', context: `${pb.count} cards`, value: money(pb.total) },
          { label: 'Average / card', context: 'Near Mint', value: money(pb.average) },
          { label: 'Trade bait', context: `${pb.extrasCopies} extra ${pb.extrasCopies === 1 ? 'copy' : 'copies'}`, value: money(pb.extrasValue) },
        ]}
      />

      <div className="pb-body">
        <section className="pb-holdings" aria-labelledby="pb-holdings-title">
          <header className="pb-holdings-head">
            <h2 id="pb-holdings-title">Holdings <span className="pb-count">{pb.count} cards</span></h2>
            <div className="pb-controls">
              <label className="sr-only" htmlFor="pb-sort">Sort holdings</label>
              <select id="pb-sort" className="pb-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
                <option value="total">Sort: total value</option>
                <option value="unit">Sort: unit price</option>
                <option value="qty">Sort: quantity</option>
                <option value="name">Sort: name</option>
              </select>
              <button className="pb-btn" onClick={exportCsv} disabled={!pb.lines.length}>
                <span aria-hidden="true">↓</span> Export CSV
              </button>
            </div>
          </header>

          {loading ? (
            <div className="pb-rows" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="pb-skel pb-skel-row" />)}
            </div>
          ) : pb.lines.length === 0 ? (
            <div className="pb-empty">
              <p>No cards priced yet. Add cards by search or photo and they'll show up here with live prices.</p>
              <button className="pb-btn" onClick={goAdd}>Add cards</button>
            </div>
          ) : (
            <div className="pb-rows" role="table" aria-label="Holdings" aria-rowcount={sorted.length + 1}>
              <div className="pb-row pb-row-head" role="row">
                <span role="columnheader">Card</span>
                <span role="columnheader">Rarity</span>
                <span role="columnheader" className="r">Qty</span>
                <span role="columnheader" className="r">Unit</span>
                <span role="columnheader" className="r">Total</span>
                <span role="columnheader">Basis</span>
              </div>
              {sorted.map((l) => (
                <div key={l.entry.printingId} className="pb-row" role="row" onClick={() => onOpen(l.card.slug)}>
                  <span role="cell" className="pb-id">
                    <Thumb slug={l.card.slug} className="pb-thumb" />
                    <span className="pb-id-text">
                      <button className="pb-name" onClick={(e) => { e.stopPropagation(); onOpen(l.card.slug); }}>{l.card.name}</button>
                      {l.card.sub && <span className="pb-sub">{l.card.sub}</span>}
                      <span className="pb-print">{l.printing ? `${shortSet(l.printing.set)} #${l.printing.num}` : 'Unknown printing'}</span>
                      <span className="pb-meta-compact">
                        <span className={`pb-rarity r-${rarityClass(l.rarity)}`}>{l.rarity}</span> · {money(l.unit)} each
                      </span>
                    </span>
                  </span>
                  <span role="cell" className="pb-c-rarity"><span className={`pb-rarity r-${rarityClass(l.rarity)}`}>{l.rarity}</span></span>
                  <span role="cell" className="pb-c-qty num r"><span className="pb-x" aria-hidden="true">×</span>{l.entry.qty}</span>
                  <span role="cell" className="pb-c-unit num r">{money(l.unit)}</span>
                  <span role="cell" className="pb-c-total num r">{money(l.total)}</span>
                  <span role="cell" className="pb-c-basis" onClick={(e) => e.stopPropagation()}>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" title="View on TCGplayer"><BasisTag basis={l.basis} /></a>
                    ) : (
                      <BasisTag basis={l.basis} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {pb.extras.length > 0 && (
            <footer className="pb-trade">
              <h3>Trade binder <span className="pb-dim">copies beyond the 3-per-deck limit</span></h3>
              <ul>
                {pb.extras.map((x) => (
                  <li key={x.slug}>
                    <button onClick={() => onOpen(x.slug)}>{x.card.display}</button> ×{x.copies} <span className="num">{money(x.unit * x.copies)}</span>
                  </li>
                ))}
              </ul>
            </footer>
          )}
        </section>

        <aside className="pb-rail" aria-label="Value breakdown">
          <Breakdown
            title="Price confidence"
            groups={pb.byConfidence}
            total={pb.total}
            fill={(k) => `var(--color-basis-${BASIS_CLASS[k] ?? 'low'})`}
          >
            <details className="pb-disclosure">
              <summary>What these labels mean</summary>
              <dl>
                <dt><span className="pb-tag basis-market">Market</span></dt>
                <dd>Recent TCGplayer sales for this exact printing.</dd>
                <dt><span className="pb-tag basis-proxy">Beta proxy</span></dt>
                <dd>The Retail printing hasn't sold yet (Retail launched Nov 6, 2026), so the identical Beta printing's market price stands in.</dd>
                <dt><span className="pb-tag basis-low">Low listing</span></dt>
                <dd>No sales anywhere, so the cheapest current listing is used. It never outranks a known market price for the same card.</dd>
              </dl>
            </details>
          </Breakdown>
          <Breakdown title="By color" groups={pb.byColor} total={pb.total} fill={(k) => COLOR_VAR[k] ?? 'var(--color-text-muted)'} />
          <Breakdown title="By rarity" groups={pb.byRarity} total={pb.total} fill={() => 'var(--color-accent)'} />
          <p className="pb-source">
            Source: {PRICES.source}, in USD. CAD uses 1 USD = {PRICES.fx.usdToCad.toFixed(4)} CAD. Updated {updated}.
          </p>
        </aside>
      </div>
    </div>
  );
}
