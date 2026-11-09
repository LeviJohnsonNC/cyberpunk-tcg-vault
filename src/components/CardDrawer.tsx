import { useEffect } from 'react';
import { BASIS_CLASS, BY_SLUG, acquireQuote, defaultPrinting, printingLabel, valueHolding } from '../lib/data';
import { estimateText, money } from '../lib/currency';
import { useStore } from '../lib/store';
import { CardImg, Pip, RarityBadge, Rules } from './bits';

export function CardDrawer({ slug, onClose }: { slug: string; onClose: () => void }) {
  const card = BY_SLUG.get(slug);
  const { entries, setQty } = useStore();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!card) return null;
  const base = defaultPrinting(card);
  const qtyOf = (pid: string) => entries.find((e) => e.printingId === pid)?.qty ?? 0;
  const buy = acquireQuote(slug);
  const owned = card.printings.reduce((a, p) => a + qtyOf(p.id), 0);
  // Value of the copies you own, printing by printing (unknowns counted, never guessed).
  const mine = card.printings
    .map((p) => ({ q: qtyOf(p.id), v: valueHolding(p.id) }))
    .filter((x) => x.q > 0)
    .reduce((a, x) => ({ knownCad: a.knownCad + (x.v ? x.v.cad * x.q : 0), unpriced: a.unpriced + (x.v ? 0 : x.q), copies: a.copies + x.q }), { knownCad: 0, unpriced: 0, copies: 0 });
  const notes = entries.filter((e) => e.slug === slug && e.note).map((e) => e.note);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="iconbtn close" onClick={onClose} aria-label="Close">×</button>
        <div className="card-detail">
          <div>
            <CardImg className="card-art" slug={slug} alt={card.display} />
          </div>
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <div>
              <div className="label accent">{card.type} · #{base?.num}</div>
              <h2 className="drawer-title">
                {card.name}
              </h2>
              {card.sub && <div className="drawer-sub">{card.sub}</div>}
            </div>
            <dl className="kv">
              <dt>Color</dt><dd><Pip color={card.color} /></dd>
              <dt>Cost</dt><dd>{card.cost ?? '—'} {card.cost != null && '€$'}</dd>
              <dt>{card.type === 'Gear' ? 'Bonus' : 'Power'}</dt><dd>{card.power != null ? (card.type === 'Gear' ? `+${card.power}` : card.power) : '—'}</dd>
              <dt>RAM</dt><dd>{card.ram ?? '—'}</dd>
              <dt>Traits</dt><dd>{card.traits.join(' · ') || '—'}</dd>
              <dt>Rarity</dt><dd><RarityBadge r={card.rarity} /></dd>
              <dt>Sellable</dt><dd>{card.sellable ? <span className="badge sell">Sell tag</span> : <span className="muted">No</span>}</dd>
              <dt>Artist</dt><dd>{card.artist ?? '—'}</dd>
            </dl>
            <div className="rules"><Rules text={card.text} /></div>
            <div className="drawer-prices">
              {mine.copies > 0 && (
                <div className="row">
                  <span className="label">Your {mine.copies === 1 ? 'copy' : `${mine.copies} copies`}</span>
                  <b className="price-line"><span className="big">{mine.unpriced === mine.copies ? 'Unpriced' : estimateText(mine).replace(/ unpriced cop(y|ies)$/, ' unpriced')}</span></b>
                </div>
              )}
              <div className="row">
                <span className="label">Buy a copy</span>
                {buy ? (
                  <>
                    <b className="price-line"><span className="big">{money(buy.cad)}</span></b>
                    <span className={`pb-tag basis-${BASIS_CLASS[buy.basis]}`}>{buy.basis}</span>
                    <span className="tiny muted">{printingLabel(buy.printingId, false)}</span>
                    {buy.url && <a href={buy.url} target="_blank" rel="noreferrer" className="tiny">TCGplayer ↗</a>}
                  </>
                ) : (
                  <span className="muted">Unpriced: no printing has a quote yet</span>
                )}
              </div>
            </div>
            {notes.length > 0 && <div className="callout y tiny">{notes.join(' ')}</div>}
          </div>
        </div>

        <hr className="cut" />
        <div className="panel-title">Printings <span className="aside">You own {owned}</span></div>
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th className="nosort">Printing</th><th className="nosort">Rarity</th>
                <th className="nosort num">Value</th><th className="nosort">Owned</th>
              </tr>
            </thead>
            <tbody>
              {card.printings.map((p) => {
                const v = valueHolding(p.id);
                const q = qtyOf(p.id);
                return (
                  <tr key={p.id} style={{ cursor: 'default' }}>
                    <td className="mono tiny">{printingLabel(p.id, false)}</td>
                    <td><RarityBadge r={p.rarity} /></td>
                    <td className="num">
                      {v ? (
                        <span className="drawer-value">
                          {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{money(v.cad)}</a> : money(v.cad)}
                          <span
                            className={`pb-tag basis-${BASIS_CLASS[v.basis]}`}
                            title={v.sourcePrintingId !== p.id ? `Priced from ${printingLabel(v.sourcePrintingId, false)}` : undefined}
                          >
                            {v.basis}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">Unpriced</span>
                      )}
                    </td>
                    <td>
                      <span className="qty">
                        <button className="iconbtn minus" onClick={() => setQty(slug, p.id, q - 1)} disabled={q === 0} aria-label={`Remove a ${printingLabel(p.id, false)} copy`}>−</button>
                        <b>{q}</b>
                        <button className="iconbtn" onClick={() => setQty(slug, p.id, q + 1)} aria-label={`Add a ${printingLabel(p.id, false)} copy`}>+</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}
