// Price Book: reference implementation of the Afterlife design language.
// See docs/design-system.md. Uses only semantic tokens (src/theme.css) and pricebook.css.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { VaultSelect } from '../components/VaultSelect';
import { BASIS_CLASS, PRICES, printingLabel } from '../lib/data';
import { getCurrency, money, moneyOr, toDisplay } from '../lib/currency';
import { buildPriceBook, sortLines, toCsv, type Basis, type Group, type Line, type SortKey } from '../lib/pricebook';
import { useStore } from '../lib/store';
import { CardImg } from '../components/bits';
import { PrintingArt } from '../components/PrintingArt';
import { Masthead, MetricStrip } from '../components/ui';
import './pricebook.css';

const COLOR_VAR: Record<string, string> = {
  Yellow: 'var(--color-card-yellow)',
  Blue: 'var(--color-card-blue)',
  Red: 'var(--color-card-red)',
  Green: 'var(--color-card-green)',
};
const rarityClass = (r: string) =>
  r === 'Epic' ? 'epic' : r === 'Rare' ? 'rare' : /Secret|Iconic|Nova/.test(r) ? 'top' : 'base';
type OpenHolding = (slug: string, printingId?: string, identify?: boolean, opener?: HTMLElement) => void;
const holdingSorts: { value: SortKey; label: string }[] = [
  { value: 'total', label: 'Total value' },
  { value: 'unit', label: 'Unit price' },
  { value: 'qty', label: 'Quantity' },
  { value: 'name', label: 'Name' },
];

function BasisTag({ basis, from }: { basis: Basis | null; from?: string | null }) {
  if (!basis) return <span className="pb-tag" title="No quote for this exact printing">Unpriced</span>;
  return (
    <span className={`pb-tag basis-${BASIS_CLASS[basis]}`} title={from ? `Priced from ${printingLabel(from, false)}` : undefined}>
      {basis}
    </span>
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

function Marquee({ top, loading, hasCards, onOpen, goAdd }: {
  top: Line | null; loading: boolean; hasCards: boolean; onOpen: OpenHolding; goAdd: () => void;
}) {
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
          <h2 className="pb-marquee-name">{hasCards ? 'No priced holdings yet' : 'Nothing on the books'}</h2>
          <p className="pb-marquee-sub">{hasCards ? 'Your holdings appear below. Their value is pending a quote.' : 'Add cards and your most valuable one headlines here.'}</p>
          {!hasCards && <button className="btn quiet" onClick={goAdd}>Add cards</button>}
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
          <span className="num">{money(top.unit!)}</span>
          <span className="pb-marquee-basis">{top.basis ?? 'Unpriced'}</span>
          <span className="sr-only"> per copy</span>
        </p>
      </div>
      <Skyline />
      <button className="pb-marquee-card" onClick={(event) => onOpen(card.slug, top.printing?.id, undefined, event.currentTarget)} aria-label={`Open ${card.display}`}>
        {top.printing ? <PrintingArt slug={card.slug} printingId={top.printing.id} alt="" pocket /> : <CardImg slug={card.slug} alt="" priority />}
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
            <span className="pb-bk-value num">
              {g.unpriced === g.count ? 'Unpriced' : money(g.value)}
              {g.unpriced > 0 && g.unpriced < g.count && <span className="pb-dim"> +{g.unpriced}</span>}
            </span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

/* ---------- page ---------- */
export function PriceBook({ mobile, onOpen, goAdd }: { mobile: boolean; onOpen: OpenHolding; goAdd: () => void }) {
  const { entries, collectionReady, collectionError, retryCollection } = useStore();
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const pb = useMemo(() => buildPriceBook(entries), [entries]);
  const sorted = useMemo(() => sortLines(pb.lines, sortBy), [pb.lines, sortBy]);
  const loading = !collectionReady && !collectionError;
  const currency = getCurrency();
  const headline = {
    label: 'Total value',
    context: collectionReady ? `${currency} · ${pb.count} ${pb.count === 1 ? 'card' : 'cards'}${pb.unpriced ? ` · ${pb.unpriced} unpriced` : ''}` : currency,
    value: !collectionReady ? '—' : pb.count && !pb.pricedCount ? 'Unpriced' : money(pb.total),
  };
  const valuationDetails = [
    { label: 'Average / card', context: pb.unpriced ? 'Near Mint · priced cards' : 'Near Mint', value: !collectionReady ? '—' : pb.count && !pb.pricedCount ? 'Unpriced' : money(pb.average) },
    {
      label: 'Trade bait',
      context: `${pb.extrasCopies} extra ${pb.extrasCopies === 1 ? 'copy' : 'copies'}${pb.extrasUnpriced ? ` · ${pb.extrasUnpriced} unpriced` : ''}`,
      value: !collectionReady ? '—' : pb.extrasCopies && pb.extrasUnpriced === pb.extrasCopies ? 'Unpriced' : money(pb.extrasValue),
    },
  ];

  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(sorted, (n) => toDisplay(n), getCurrency())], { type: 'text/csv' }));
    a.download = `cyberpunk-tcg-pricebook-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const updated = new Date(PRICES.updatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '');

  return (
    <div className="pb">
      <div className="pb-hero">
        <Masthead
          size="hero"
          eyebrow="The Afterlife / Night Market"
          title={<>Price <br />Book</>}
          sub={<>Near Mint prices <span className="sep" aria-hidden="true">◆</span> {getCurrency()}</>}
        />
        <div className="pb-valuation">
          <MetricStrip items={mobile ? [headline] : [headline, ...valuationDetails]} />
          {mobile && collectionReady && pb.count > 0 && (
            <details className="pb-valuation-details">
              <summary>More valuation details</summary>
              <dl>{valuationDetails.map(({ label, context, value }) => <div key={label}>
                <dt>{label}</dt><dd><strong>{value}</strong> <span>{context}</span></dd>
              </div>)}</dl>
            </details>
          )}
        </div>
        {!collectionError && (!mobile || pb.top) && <Marquee top={pb.top} loading={loading} hasCards={pb.count > 0} onOpen={onOpen} goAdd={goAdd} />}
      </div>

      <div className="pb-body">
        <section className="pb-holdings" aria-labelledby="pb-holdings-title">
          <header className="pb-holdings-head">
            <h2 id="pb-holdings-title" tabIndex={-1}>Holdings {collectionReady && <span className="pb-count">{pb.count} {pb.count === 1 ? 'card' : 'cards'}</span>}</h2>
            <div className="pb-controls">
              <label className="sr-only" htmlFor="pb-sort">Sort holdings</label>
              <VaultSelect id="pb-sort" className="pb-select" value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}
                options={mobile ? holdingSorts : holdingSorts.map(({ value, label }) => ({ value, label: `Sort: ${label.toLowerCase()}` }))} />
              <button className="pb-btn" onClick={exportCsv} disabled={!collectionReady || !pb.lines.length}>
                <span aria-hidden="true">↓</span> Export CSV
              </button>
            </div>
          </header>

          {collectionError ? (
            <div className="pb-empty" role="alert">
              <p>Couldn’t load your holdings.</p><button className="pb-btn" onClick={retryCollection}>Try again</button>
            </div>
          ) : loading ? (
            <div className="pb-rows" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="pb-skel pb-skel-row" />)}
            </div>
          ) : pb.lines.length === 0 ? (
            <div className="pb-empty">
              <p>Add a card to see its printing, quantity, and latest available price here.</p>
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
                <div key={l.entry.printingId} className="pb-row" role="row" onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('a')) return;
                  onOpen(l.card.slug, l.printing?.id, !l.printing, event.currentTarget.querySelector('button.pb-name') ?? undefined);
                }}>
                  <span role="cell" className="pb-id">
                    <CardImg slug={l.card.slug} className="pb-thumb" alt="" />
                    <span className="pb-id-text">
                      <button className="pb-name" aria-label={`Open ${l.card.display}, ${printingLabel(l.entry.printingId, false)}`}
                        onClick={(event) => { event.stopPropagation(); onOpen(l.card.slug, l.printing?.id, !l.printing, event.currentTarget); }}>{l.card.name}</button>
                      {l.card.sub && <span className="pb-sub">{l.card.sub}</span>}
                      <span className="pb-print">{printingLabel(l.entry.printingId, false)}</span>
                      <span className="pb-meta-compact">
                        <span className={`pb-rarity r-${rarityClass(l.rarity)}`}>{l.rarity}</span>{l.unit != null && ` · ${money(l.unit)} each`}
                      </span>
                    </span>
                  </span>
                  <span role="cell" className="pb-c-rarity"><span className={`pb-rarity r-${rarityClass(l.rarity)}`}>{l.rarity}</span></span>
                  <span role="cell" className="pb-c-qty num r"><span className="pb-x" aria-hidden="true">×</span>{l.entry.qty}</span>
                  <span role="cell" className={`pb-c-unit num r ${l.unit == null ? 'pb-dim' : ''}`}>{moneyOr(l.unit)}</span>
                  <span role="cell" className={`pb-c-total num r ${l.total == null ? 'pb-dim' : ''}`}>{moneyOr(l.total)}</span>
                  <span role="cell" className="pb-c-basis">
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" aria-label={`${l.basis} price on TCGplayer`}>
                        <BasisTag basis={l.basis} from={l.sourcePrintingId !== l.entry.printingId ? l.sourcePrintingId : null} />
                      </a>
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
                    <button onClick={() => onOpen(x.slug)}>{x.card.display}</button> ×{x.copies}{' '}
                    <span className="num">{x.unpriced === x.copies ? 'Unpriced' : money(x.value)}</span>
                    {x.unpriced > 0 && x.unpriced < x.copies && <span className="pb-dim"> + {x.unpriced} unpriced</span>}
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
            fill={(k) => (k in BASIS_CLASS ? `var(--color-basis-${BASIS_CLASS[k as Basis]})` : 'var(--color-divider)')}
          >
            <details className="pb-disclosure">
              <summary>What these labels mean</summary>
              <dl>
                <dt><span className="pb-tag basis-market">Market</span></dt>
                <dd>Recent TCGplayer sales for this exact printing.</dd>
                <dt><span className="pb-tag basis-proxy">Beta proxy</span></dt>
                <dd>This Retail printing has no sales yet, only a higher listing or none, so its verified Beta twin's market price stands in. Hover the tag to see which printing.</dd>
                <dt><span className="pb-tag basis-low">Low listing</span></dt>
                <dd>No recent sales for this exact printing, so its cheapest current listing is used.</dd>
                <dt><span className="pb-tag">Unpriced</span></dt>
                <dd>No quote for this exact printing (common for promos and event cards). It isn't counted in totals, and it never borrows another printing's price.</dd>
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
