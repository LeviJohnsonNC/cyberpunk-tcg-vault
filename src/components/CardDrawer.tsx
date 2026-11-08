import { useEffect } from 'react';
import { BY_SLUG, PRICES, cad, defaultPrinting, priceConfidence, priceFor, shortSet } from '../lib/data';
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
  const ref = PRICES.ref[slug];
  const owned = card.printings.reduce((a, p) => a + qtyOf(p.id), 0);
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
            {ref && (
              <div className="row">
                <span className="label">Ref price</span>
                <b className="price-line"><span className="big">{cad(ref.usd * PRICES.fx.usdToCad)}</span></b>
                <span className={`badge ${priceConfidence(ref).tone}`}>{priceConfidence(ref).label}</span>
                <a href={ref.url} target="_blank" rel="noreferrer" className="tiny">TCGplayer ↗</a>
              </div>
            )}
            {notes.length > 0 && <div className="callout y tiny">{notes.join(' ')}</div>}
          </div>
        </div>

        <hr className="cut" />
        <div className="panel-title">Printings <span className="aside">You own {owned}</span></div>
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th className="nosort">Set</th><th className="nosort">#</th><th className="nosort">Rarity</th>
                <th className="nosort num">Price</th><th className="nosort">Owned</th>
              </tr>
            </thead>
            <tbody>
              {card.printings.map((p) => {
                const pr = PRICES.printings[p.id] ? priceFor(slug, p.id) : null;
                const q = qtyOf(p.id);
                return (
                  <tr key={p.id} style={{ cursor: 'default' }}>
                    <td>{shortSet(p.set)}</td>
                    <td className="mono">{p.num}</td>
                    <td><RarityBadge r={p.rarity} /></td>
                    <td className="num">
                      {pr ? (
                        <a href={pr.point.url} target="_blank" rel="noreferrer">{cad(pr.cad)}</a>
                      ) : (
                        <span className="muted">n/a</span>
                      )}
                    </td>
                    <td>
                      <span className="qty">
                        <button className="iconbtn minus" onClick={() => setQty(slug, p.id, q - 1)} disabled={q === 0}>−</button>
                        <b>{q}</b>
                        <button className="iconbtn" onClick={() => setQty(slug, p.id, q + 1)}>+</button>
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
