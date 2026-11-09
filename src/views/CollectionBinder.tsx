import { PrintingArt } from '../components/PrintingArt';
import { compactPrintingLabel, type CollectionCard } from '../lib/collection';
import { money } from '../lib/currency';
import { printingLabel } from '../lib/data';
import { useStore } from '../lib/store';

export type OpenCollectionCard = (slug: string, printingId?: string, identify?: boolean) => void;

export function CollectionQuantity({ item, onOpen, pocket = false }: {
  item: CollectionCard;
  onOpen: OpenCollectionCard;
  pocket?: boolean;
}) {
  const { setQty, quantityPending } = useStore();
  const { card, cover, catalog, entries, qty, unknownCopies } = item;
  const target = entries.length === 0 ? catalog.id : entries.length === 1 ? entries[0].printingId : null;
  if (target && (!pocket || !unknownCopies)) {
    const label = unknownCopies ? 'unspecified' : printingLabel(target, false);
    const pending = quantityPending(target);
    return (
      <div className="collection-qty-control">
        {pocket && <span className="binder-owned">{qty ? <>Owned <b>{qty}</b></> : 'Unowned'}</span>}
        <span className="qty" aria-busy={pending}>
          {(!pocket || qty > 0) && <button className="iconbtn minus" disabled={qty === 0 || pending} onClick={() => setQty(card.slug, target, qty - 1)} aria-label={`Remove a ${label} copy of ${card.display}`}>−</button>}
          {!pocket && <b>{qty}</b>}
          <button className="iconbtn" disabled={qty >= 999 || pending} onClick={() => setQty(card.slug, target, qty + 1)} aria-label={`Add a ${label} copy of ${card.display}`}>+</button>
        </span>
        {!pocket && <span className={`qty-target${unknownCopies ? ' unspec' : ''}`}>{unknownCopies ? 'Unspecified' : compactPrintingLabel(target)}</span>}
      </div>
    );
  }
  const identify = !cover && unknownCopies > 0;
  return (
    <div className="collection-qty-control">
      {pocket ? <span className="binder-owned">Owned <b>{qty}</b></span> : <span className="qty"><b>{qty}</b></span>}
      <button className="btn quiet qty-pick" onClick={() => onOpen(card.slug, cover?.printingId, identify)} aria-label={`${identify ? 'Identify printing' : 'View printings'} of ${card.display}`}>
        {identify ? 'Identify printing' : pocket ? 'View printings' : `${entries.length} printings`}
      </button>
    </div>
  );
}

function PocketValue({ item }: { item: CollectionCard }) {
  const { exact, qty, quote, value } = item;
  if (!qty) {
    return (
      <>
        <span>Buy estimate <b>{quote ? money(quote.cad) : 'Unavailable'}</b></span>
        {quote && <span className="binder-quote-printing">{compactPrintingLabel(quote.printingId)}</span>}
      </>
    );
  }
  if (value.unpriced === qty) return <span>Unpriced</span>;
  return (
    <>
      {exact && <span><b>{money(exact.cad)}</b> each</span>}
      {exact?.basis === 'Beta proxy' && <span className="binder-proxy">Beta proxy</span>}
      {exact?.basis === 'Low listing' && <span>Low listing</span>}
      {(!exact || qty > 1) && <span className="binder-total"><b>{money(value.knownCad)}</b> {value.unpriced ? 'priced' : 'total'}</span>}
      {value.unpriced > 0 && <span>+{value.unpriced} unpriced</span>}
    </>
  );
}

export function CollectionBinder({ items, onOpen }: { items: CollectionCard[]; onOpen: OpenCollectionCard }) {
  return (
    <ul className="binder-grid" aria-label="Collection binder">
      {items.map((item) => {
        const { card, cover, catalog, entries, unknownCopies } = item;
        const coverLabel = cover ? compactPrintingLabel(cover.printingId) : null;
        return (
          <li className="binder-pocket" key={card.slug}>
            <button
              className="binder-open"
              onClick={() => onOpen(card.slug, cover?.printingId ?? catalog.id, !cover && unknownCopies > 0)}
              aria-label={`Open ${card.display}${coverLabel ? `, ${coverLabel}` : ''}`}
            >
              <PrintingArt slug={card.slug} printingId={cover?.printingId ?? catalog.id} alt="" pocket />
            </button>
            <div className="binder-identity">
              <h3 title={card.display}>{card.name}{card.sub && <span>{card.sub}</span>}</h3>
              <div className="binder-printing">
                {coverLabel ?? (unknownCopies ? 'Printing unspecified · catalog art' : compactPrintingLabel(catalog.id))}
                {cover && entries.length > 1 && <span> · {unknownCopies ? 'mixed holdings' : `${entries.length} printings`}</span>}
              </div>
            </div>
            <CollectionQuantity item={item} onOpen={onOpen} pocket />
            <div className="binder-value"><PocketValue item={item} /></div>
          </li>
        );
      })}
    </ul>
  );
}
