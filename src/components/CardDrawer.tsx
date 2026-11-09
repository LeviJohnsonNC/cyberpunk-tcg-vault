import { Fragment, useEffect, useRef, useState } from 'react';
import { BY_SLUG, acquireQuote, defaultPrinting, editionPrinting, printingLabel, valueHolding, type Card, type Valuation } from '../lib/data';
import { estimateText, money } from '../lib/currency';
import { useStore, type Entry } from '../lib/store';
import { Pip, RarityBadge, Rules } from './bits';
import { PrintingArt } from './PrintingArt';

/** Move some or all copies of an unverified holding to a real printing, in one save. */
function MoveCopies({ card, entry }: { card: Card; entry: Entry }) {
  const { movePrinting, quantityPending, collectionReady } = useStore();
  const [to, setTo] = useState(() => editionPrinting(card.slug, 'Retail')?.id ?? card.printings[0].id);
  const [n, setN] = useState(entry.qty);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const qty = Math.max(1, Math.min(entry.qty, n || 1));
  const go = async () => {
    if (lock.current) return; // double-clicks and retries can't move twice
    lock.current = true;
    setBusy(true);
    await movePrinting(card.slug, entry.printingId, to, qty);
    setBusy(false);
    lock.current = false;
  };
  return (
    <div className="drawer-move">
      <label className="sr-only" htmlFor={`mv-n-${entry.printingId}`}>Copies to move</label>
      <input id={`mv-n-${entry.printingId}`} className="input" type="number" min={1} max={entry.qty} value={qty} onChange={(e) => setN(+e.target.value)} />
      <span className="tiny muted">of {entry.qty} to</span>
      <label className="sr-only" htmlFor={`mv-to-${entry.printingId}`}>Printing</label>
      <select id={`mv-to-${entry.printingId}`} className="select" value={to} onChange={(e) => setTo(e.target.value)}>
        {card.printings.map((p) => <option key={p.id} value={p.id}>{printingLabel(p.id)}</option>)}
      </select>
      <button className="btn sm" onClick={go} disabled={busy || !collectionReady || quantityPending(entry.printingId) || quantityPending(to)}>{busy ? 'Moving…' : 'Move'}</button>
    </div>
  );
}

function PrintingValue({ value }: { value: Valuation | null }) {
  if (!value) return <span className="muted">Unpriced</span>;
  const proxy = value.basis === 'Beta proxy';
  const price = money(value.cad);
  return (
    <span className="drawer-value">
      {value.url ? <a href={value.url} target="_blank" rel="noreferrer" aria-label={`${price} on TCGplayer${proxy ? ' (Beta reference)' : ''}`}>{price}</a> : <span>{price}</span>}
      {proxy && <span className="pb-tag basis-proxy" title={`Priced from ${printingLabel(value.sourcePrintingId, false)}`}>Beta proxy</span>}
      {value.basis === 'Low listing' && <span className="tiny muted">Low listing</span>}
    </span>
  );
}

function CardDetails({ card, onClose, initialPrinting, identify }: { card: Card; onClose: () => void; initialPrinting?: string; identify?: boolean }) {
  const { slug } = card;
  const { entries, setQty, collectionReady, quantityPending } = useStore();
  const [printingId, setPrintingId] = useState(() => initialPrinting ?? defaultPrinting(card).id);
  const preview = useRef<HTMLSelectElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const printingsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = drawer.current;
    dialog?.showModal();
    if (identify) printingsHeading.current?.focus();
    return () => dialog?.close();
  }, [identify]);
  const close = () => {
    drawer.current?.close();
    onClose();
  };
  const printing = card.printings.find((p) => p.id === printingId) ?? defaultPrinting(card);
  const value = valueHolding(printing.id);
  const qtyOf = (pid: string) => entries.find((e) => e.printingId === pid)?.qty ?? 0;
  const notes = new Map(entries.filter((e) => e.slug === slug && e.note).map((e) => [e.printingId, e.note]));
  const buy = acquireQuote(slug);
  const owned = card.printings.reduce((a, p) => a + qtyOf(p.id), 0);
  // Value of the copies you own, printing by printing (unknowns counted, never guessed).
  const mine = card.printings
    .map((p) => ({ q: qtyOf(p.id), v: valueHolding(p.id) }))
    .concat(entries.filter((e) => e.slug === slug && !card.printings.some((p) => p.id === e.printingId)).map((e) => ({ q: e.qty, v: null })))
    .filter((x) => x.q > 0)
    .reduce((a, x) => ({ knownCad: a.knownCad + (x.v ? x.v.cad * x.q : 0), unpriced: a.unpriced + (x.v ? 0 : x.q), copies: a.copies + x.q }), { knownCad: 0, unpriced: 0, copies: 0 });
  // Holdings without a verified printing (scanned "Printing unspecified", or an id the catalog no longer has).
  const loose = entries.filter((e) => e.slug === slug && !card.printings.some((p) => p.id === e.printingId));
  const ownedAll = owned + loose.reduce((a, e) => a + e.qty, 0);

  return (
    <dialog
      ref={drawer}
      className="drawer"
      aria-labelledby="card-drawer-title"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget && e.clientX < e.currentTarget.getBoundingClientRect().left) close();
      }}
    >
        <button className="iconbtn close" onClick={close} aria-label="Close">×</button>
        <div className="card-detail">
          <div className="drawer-preview">
            <label className="drawer-preview-select">
              <span className="label">Viewing printing</span>
              <select ref={preview} className="select" value={printing.id} onChange={(e) => setPrintingId(e.target.value)}>
                {card.printings.map((p) => <option key={p.id} value={p.id}>{printingLabel(p.id, false)}</option>)}
              </select>
            </label>
            <PrintingArt slug={slug} printingId={printing.id} alt={`${card.display}, ${printingLabel(printing.id)}`} />
          </div>
          <div className="drawer-summary">
            <div className="drawer-heading">
              <div className="label accent">{card.type} · #{printing.num}</div>
              <h2 className="drawer-title" id="card-drawer-title">{card.name}</h2>
              {card.sub && <div className="drawer-sub">{card.sub}</div>}
            </div>
            <div className="drawer-selected-price" aria-live="polite">
              <span className="label">Value per copy</span>
              <PrintingValue value={value} />
              <span className="tiny muted">{qtyOf(printing.id)} owned in this printing</span>
            </div>
            <dl className="kv">
              <dt>Color</dt><dd><Pip color={card.color} /></dd>
              <dt>Cost</dt><dd>{card.cost ?? '—'} {card.cost != null && '€$'}</dd>
              <dt>{card.type === 'Gear' ? 'Bonus' : 'Power'}</dt><dd>{card.power != null ? (card.type === 'Gear' ? `+${card.power}` : card.power) : '—'}</dd>
              <dt>RAM</dt><dd>{card.ram ?? '—'}</dd>
              <dt>Traits</dt><dd>{card.traits.join(' · ') || '—'}</dd>
              <dt>Set</dt><dd>{printing.set}</dd>
              <dt>Rarity</dt><dd><RarityBadge r={printing.rarity} /></dd>
              <dt>Sellable</dt><dd>{card.sellable ? 'Yes' : 'No'}</dd>
              <dt>Artist</dt><dd>{printing.artist ?? '—'}</dd>
            </dl>
            <div className="rules"><Rules text={card.text} /></div>
            <div className="drawer-prices">
              {mine.copies > 0 && (
                <div className="row">
                  <span className="label">Your {mine.copies === 1 ? 'copy' : `${mine.copies} copies`} across all printings</span>
                  <b className="price-line"><span className="big">{mine.unpriced === mine.copies ? 'Unpriced' : estimateText(mine).replace(/ unpriced cop(y|ies)$/, ' unpriced')}</span></b>
                </div>
              )}
              <div className="row">
                <span className="label">Cheapest printing to buy</span>
                {buy ? (
                  <>
                    <b className="price-line"><span className="big">{money(buy.cad)}</span></b>
                    {buy.basis === 'Low listing' && <span className="tiny muted">Low listing</span>}
                    <span className="tiny muted">{printingLabel(buy.printingId, false)}</span>
                    {buy.url && <a href={buy.url} target="_blank" rel="noreferrer" className="tiny">TCGplayer ↗</a>}
                  </>
                ) : (
                  <span className="muted">Unpriced: no printing has a quote yet</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <hr className="cut" />
        <h3 className="panel-title" ref={printingsHeading} tabIndex={-1}>{identify && loose.length ? 'Identify printing' : 'Printings'} <span className="aside">You own {ownedAll}</span></h3>
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th className="nosort">Printing</th><th className="nosort hide-sm">Rarity</th>
                <th className="nosort num">Value</th><th className="nosort">Owned</th>
              </tr>
            </thead>
            <tbody>
              {loose.map((e) => (
                <Fragment key={e.printingId}>
                  <tr className="unspec-row" style={{ cursor: 'default' }}>
                    <td colSpan={3} className="unspec-label">
                      <b>Printing unspecified</b> <span className="muted tiny">counts for decks, unpriced</span>
                      {e.note && <div className="drawer-note"><b>Note</b> · {e.note}</div>}
                    </td>
                    <td>
                      <span className="qty">
                        <button className="iconbtn minus" disabled={!collectionReady || quantityPending(e.printingId)} onClick={() => setQty(slug, e.printingId, e.qty - 1)} aria-label="Remove an unspecified copy">−</button>
                        <b>{e.qty}</b>
                        <button className="iconbtn" disabled={!collectionReady || quantityPending(e.printingId) || e.qty >= 999} onClick={() => setQty(slug, e.printingId, e.qty + 1)} aria-label="Add an unspecified copy">+</button>
                      </span>
                    </td>
                  </tr>
                  <tr className="unspec-row" style={{ cursor: 'default' }}>
                    <td colSpan={4} style={{ paddingTop: 0 }}>
                      <MoveCopies card={card} entry={e} />
                    </td>
                  </tr>
                </Fragment>
              ))}
              {card.printings.map((p) => {
                const v = valueHolding(p.id);
                const q = qtyOf(p.id);
                return (
                  <tr key={p.id} className={p.id === printing.id ? 'drawer-printing selected' : 'drawer-printing'}>
                    <td className="mono tiny">
                      <button
                        className="drawer-printing-choice"
                        aria-pressed={p.id === printing.id}
                        onClick={() => { setPrintingId(p.id); preview.current?.focus(); }}
                      >
                        {p.set} #{p.num}
                      </button>
                      {notes.get(p.id) && <div className="drawer-note"><b>Note</b> · {notes.get(p.id)}</div>}
                    </td>
                    <td className="hide-sm"><RarityBadge r={p.rarity} /></td>
                    <td className="num"><PrintingValue value={v} /></td>
                    <td>
                      <span className="qty">
                        <button className="iconbtn minus" onClick={() => setQty(slug, p.id, q - 1)} disabled={!collectionReady || quantityPending(p.id) || q === 0} aria-label={`Remove a ${printingLabel(p.id, false)} copy`}>−</button>
                        <b>{q}</b>
                        <button className="iconbtn" disabled={!collectionReady || quantityPending(p.id) || q >= 999} onClick={() => setQty(slug, p.id, q + 1)} aria-label={`Add a ${printingLabel(p.id, false)} copy`}>+</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </dialog>
  );
}

export function CardDrawer({ slug, printingId, identify, onClose }: { slug: string; printingId?: string; identify?: boolean; onClose: () => void }) {
  const card = BY_SLUG.get(slug);
  return card && <CardDetails key={slug} card={card} initialPrinting={printingId} identify={identify} onClose={onClose} />;
}
