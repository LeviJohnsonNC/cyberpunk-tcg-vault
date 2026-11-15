import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { printingForVariant, printingVariant, printingVariants, type PrintingVariant } from '../lib/cardPrintingVariants';
import { getCurrency, money } from '../lib/currency';
import { BY_SLUG, MAX_PRINTING_COPIES, defaultPrinting, editionPrinting, printingLabel, valueHolding, type Card, type Printing } from '../lib/data';
import { useStore, type Entry } from '../lib/store';
import { Pip, RarityBadge, Rules } from './bits';
import { PrintingArt } from './PrintingArt';
import { VaultSelect } from './VaultSelect';
import './card-drawer.css';

const PrintingPriceHistory = lazy(() => import('./PrintingPriceHistory'));

function CopyControls({ slug, id, label, qty }: { slug: string; id: string; label: string; qty: number }) {
  const { setQty, collectionReady, quantityPending } = useStore();
  const pending = quantityPending(id);
  return (
    <span className="qty card-drawer-quantity" role="group" aria-label={`Copies owned of ${label}`} aria-busy={pending}>
      <button type="button" className="iconbtn" disabled={!collectionReady || pending || qty === 0}
        onClick={() => setQty(slug, id, qty - 1)} aria-label={`Remove a ${label} copy`}>−</button>
      <b aria-live="polite">{collectionReady ? qty : '—'}</b>
      <button type="button" className="iconbtn" disabled={!collectionReady || pending || qty >= MAX_PRINTING_COPIES}
        onClick={() => setQty(slug, id, qty + 1)} aria-label={`Add a ${label} copy`}>+</button>
    </span>
  );
}

function UnspecifiedPrinting({ card, entry, onMoved }: { card: Card; entry: Entry; onMoved: (id: string, sourceExhausted: boolean) => void }) {
  const { entries, movePrinting, quantityPending, collectionReady } = useStore();
  const [to, setTo] = useState(() => editionPrinting(card.slug, 'Retail')?.id ?? card.printings[0].id);
  const [n, setN] = useState(entry.qty);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const qty = Math.max(1, Math.min(entry.qty, Math.floor(n) || 1));
  const destinationQty = entries.find((holding) => holding.printingId === to)?.qty ?? 0;
  const atLimit = destinationQty + qty > MAX_PRINTING_COPIES;
  const disabled = busy || !collectionReady || atLimit || quantityPending(entry.printingId) || quantityPending(to);
  const move = async () => {
    if (disabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await movePrinting(card.slug, entry.printingId, to, qty)) onMoved(to, qty === entry.qty);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };

  return (
    <div className="card-drawer-unverified">
      <div className="card-drawer-unverified-head">
        <div>
          <strong>Printing unspecified</strong>
          <div className="card-drawer-note">Counts for decks · Unpriced</div>
          {entry.note && <p className="card-drawer-note">{entry.note}</p>}
        </div>
        <CopyControls slug={card.slug} id={entry.printingId} label="printing unspecified" qty={entry.qty} />
      </div>
      <div className="card-drawer-move">
        <label>
          <span className="card-drawer-label">Copies to move</span>
          <input className="input" type="number" min={1} max={entry.qty} value={qty} onChange={(event) => setN(+event.target.value)} />
        </label>
        <div>
          <span className="card-drawer-label">Move to</span>
          <VaultSelect aria-label="Move to printing" value={to} onValueChange={setTo}
            options={card.printings.map((p) => ({ value: p.id, label: printingLabel(p.id) }))} />
        </div>
        <button type="button" className="btn" onClick={move} disabled={disabled}>{busy ? 'Moving…' : 'Move'}</button>
      </div>
      {atLimit && <p className="card-drawer-note">This printing can hold up to {MAX_PRINTING_COPIES} copies.</p>}
    </div>
  );
}

function ArtworkViewer({ card, printing, onClose }: { card: Card; printing: Printing; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog ref={dialog} className="card-art-viewer" aria-label={`Artwork for ${card.display}`}
      onClose={(event) => { if (!event.currentTarget.open) onClose(); }}
      onCancel={(event) => event.stopPropagation()}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button type="button" className="iconbtn" aria-label="Close artwork" onClick={() => dialog.current?.close()}>×</button>
      <PrintingArt foil="inspection" slug={card.slug} printingId={printing.id} alt={`${card.display}, ${printingLabel(printing.id)}`} />
    </dialog>
  );
}

const pathLabel = (printing: Printing) => printingLabel(printing.id, false);

function CardDetails({ card, onClose, initialPrinting, identify }: { card: Card; onClose: () => void; initialPrinting?: string; identify?: boolean }) {
  const { slug } = card;
  const { entries, collectionReady } = useStore();
  const [printingId, setPrintingId] = useState(() => (card.printings.find((p) => p.id === initialPrinting) ?? defaultPrinting(card)).id);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const remembered = useRef<Partial<Record<PrintingVariant, string>>>({});
  const drawer = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const identifyHeading = useRef<HTMLHeadingElement>(null);
  const artworkTrigger = useRef<HTMLButtonElement>(null);
  const printing = card.printings.find((p) => p.id === printingId) ?? defaultPrinting(card);
  const variant = printingVariant(printing);
  const variants = printingVariants(card.printings);
  const options = card.printings.filter((p) => printingVariant(p) === variant);
  const value = valueHolding(printing.id);
  const holdings = entries.filter((entry) => entry.slug === slug);
  const owned = new Map(holdings.map((entry) => [entry.printingId, entry]));
  const total = holdings.reduce((sum, entry) => sum + entry.qty, 0);
  const loose = holdings.filter((entry) => !card.printings.some((p) => p.id === entry.printingId));
  const artAlt = `${card.display}, ${printingLabel(printing.id)}`;

  useEffect(() => {
    const node = drawer.current;
    node?.showModal();
    (identifyHeading.current ?? heading.current)?.focus({ preventScroll: true });
    return () => node?.close();
  }, []);

  const close = () => {
    drawer.current?.close();
    onClose();
  };
  const focusPreview = () => {
    drawer.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  };
  const select = (id: string) => {
    const next = card.printings.find((p) => p.id === id);
    if (!next) return;
    remembered.current[variant] = printing.id;
    remembered.current[printingVariant(next)] = id;
    setPrintingId(id);
  };
  const chooseVariant = (next: PrintingVariant) => {
    if (next === variant) return;
    const target = printingForVariant(card.printings, next, printing, remembered.current[next]);
    if (target) select(target.id);
  };
  const identification = loose.length > 0 && (
    <section className="card-drawer-identify" aria-labelledby="card-drawer-identify-title">
      <h3 ref={identify ? identifyHeading : undefined} id="card-drawer-identify-title" tabIndex={-1}>Identify printing</h3>
      {loose.map((entry) => <UnspecifiedPrinting key={entry.printingId} card={card} entry={entry}
        onMoved={(id, exhausted) => {
          select(id);
          if (exhausted) focusPreview();
        }} />)}
    </section>
  );

  return (
    <dialog ref={drawer} className="card-drawer" aria-labelledby="card-drawer-title"
      onCancel={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); close(); } }}
      onClick={(event) => {
        if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) close();
      }}>
      <header className="card-drawer-header">
        <div>
          <div className="card-drawer-label">{card.type}{card.color !== 'Colorless' && ` · ${card.color}`} · #{printing.num}</div>
          <h2 ref={heading} id="card-drawer-title" tabIndex={-1}>{card.display}</h2>
        </div>
        <button type="button" className="iconbtn card-drawer-close" onClick={close} aria-label="Close card details">×</button>
      </header>
      <div className="card-drawer-content">
        {identify && identification}
        {variants.length > 1 && (
          <div className="card-drawer-variants" data-many={variants.length > 3 || undefined} role="group" aria-label="Card version">
            {variants.map((v) => <button type="button" key={v} aria-pressed={variant === v} onClick={() => chooseVariant(v)}>{v}</button>)}
          </div>
        )}
        <div className="card-drawer-printing">
          <label className="card-drawer-label" htmlFor={card.printings.length > 1 ? 'card-drawer-printing' : undefined}>Printing</label>
          {card.printings.length > 1
            ? <VaultSelect id="card-drawer-printing" aria-label="Viewing printing" value={printing.id} onValueChange={select}
                options={options.map((p) => ({ value: p.id, label: pathLabel(p) }))} />
            : <p>{pathLabel(printing)}</p>}
        </div>
        <section className="card-drawer-preview" aria-label="Selected printing">
          <div className="card-drawer-art">
            <button ref={artworkTrigger} type="button" className="card-drawer-art-button" aria-label={`Enlarge artwork for ${artAlt}`}
              aria-haspopup="dialog" onClick={() => setArtworkOpen(true)}>
              <PrintingArt foil="standard" key={printing.id} slug={slug} printingId={printing.id} alt="" inline />
            </button>
          </div>
          <div className="card-drawer-holding">
            <div className="card-drawer-rarity"><span className="card-drawer-label">Rarity</span><RarityBadge r={printing.rarity} /></div>
            <div className="card-drawer-value" aria-live="polite">
              <span className="card-drawer-label">{value?.basis === 'Market' ? 'Market value' : value?.basis ?? 'Value'} · {getCurrency()}</span>
              <strong data-unpriced={!value || undefined}>{value ? money(value.cad) : 'Unpriced'}</strong>
              {value?.basis === 'Beta proxy' && <span className="card-drawer-note">From {printingLabel(value.sourcePrintingId, false)}</span>}
            </div>
            <div className="card-drawer-owned">
              <span className="card-drawer-label">You own</span>
              <CopyControls slug={slug} id={printing.id} label={pathLabel(printing)} qty={owned.get(printing.id)?.qty ?? 0} />
            </div>
            {value?.url && <a className="card-drawer-source" href={value.url} target="_blank" rel="noreferrer">
              <span aria-hidden="true">↗</span> {value.basis === 'Beta proxy' ? 'TCGplayer Beta reference' : 'View on TCGplayer'}
            </a>}
          </div>
        </section>
        <div className="card-drawer-comparison">
          <Suspense fallback={<section className="card-drawer-history" aria-label="Price history">
            <header className="card-drawer-section-head"><h3>Price History</h3><span>30 days</span></header>
            <p className="card-drawer-history-empty" role="status">Loading price history…</p>
          </section>}>
            <PrintingPriceHistory key={printing.id} id={printing.id} basis={value?.basis === 'Low listing' ? 'Low listing' : 'Market'} />
          </Suspense>
          <section className="card-drawer-printings" aria-labelledby="card-drawer-printings-title">
            {!identify && identification}
            <header className="card-drawer-section-head">
              <h3 id="card-drawer-printings-title">All Printings <span>({card.printings.length})</span></h3>
              {collectionReady && <span>{total} owned</span>}
            </header>
            <ul>
              {card.printings.map((p) => {
                const quote = valueHolding(p.id);
                const entry = owned.get(p.id);
                const group = printingVariant(p);
                return <li key={p.id}>
                  <button type="button" className="card-drawer-printing-row" aria-pressed={p.id === printing.id} onClick={() => {
                    select(p.id);
                    focusPreview();
                  }}>
                    <span className="card-drawer-row-name">
                      <strong>{pathLabel(p)}</strong>
                      <small>{group === p.rarity || p.rarity.startsWith(`${group} `) ? p.rarity : `${group} · ${p.rarity}`}</small>
                      {entry?.note && <small className="card-drawer-note">{entry.note}</small>}
                    </span>
                    <span className="card-drawer-row-value">
                      <span>{quote ? money(quote.cad) : 'Unpriced'}</span>
                      {quote && quote.basis !== 'Market' && <small>{quote.basis}</small>}
                    </span>
                    <span className="card-drawer-row-qty" aria-label={collectionReady ? `${entry?.qty ?? 0} owned` : 'Ownership unavailable'}>
                      {collectionReady ? entry?.qty ?? 0 : '—'}
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>;
              })}
            </ul>
          </section>
        </div>
        <details className="card-drawer-disclosure">
          <summary>Card Text</summary>
          <div className="rules">{card.text ? <Rules text={card.text} /> : 'No rules text.'}</div>
        </details>
        <details className="card-drawer-disclosure">
          <summary>Card Details</summary>
          <dl className="kv">
            <dt>Type</dt><dd>{card.type}</dd>
            <dt>Colour</dt><dd><Pip color={card.color} /></dd>
            <dt>Cost</dt><dd>{card.cost ?? '—'} {card.cost != null && '€$'}</dd>
            <dt>{card.type === 'Gear' ? 'Bonus' : 'Power'}</dt><dd>{card.power != null ? (card.type === 'Gear' ? `+${card.power}` : card.power) : '—'}</dd>
            <dt>RAM</dt><dd>{card.ram ?? '—'}</dd>
            <dt>Traits</dt><dd>{card.traits.join(' · ') || '—'}</dd>
            <dt>Set</dt><dd>{printing.set}</dd>
            <dt>Collector no.</dt><dd>#{printing.num}</dd>
            <dt>Rarity</dt><dd><RarityBadge r={printing.rarity} /></dd>
            <dt>Artist</dt><dd>{printing.artist ?? '—'}</dd>
            <dt>Sellable</dt><dd>{card.sellable ? 'Yes' : 'No'}</dd>
          </dl>
        </details>
      </div>
      {artworkOpen && <ArtworkViewer card={card} printing={printing} onClose={() => {
        setArtworkOpen(false);
        artworkTrigger.current?.focus({ preventScroll: true });
      }} />}
    </dialog>
  );
}

export function CardDrawer({ slug, printingId, identify, onClose }: { slug: string; printingId?: string; identify?: boolean; onClose: () => void }) {
  const card = BY_SLUG.get(slug);
  return card && <CardDetails key={`${slug}:${printingId ?? ''}:${!!identify}`} card={card} initialPrinting={printingId} identify={identify} onClose={onClose} />;
}
