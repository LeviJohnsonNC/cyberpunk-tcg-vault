import { useMemo, useState } from 'react';
import { BY_SLUG, PRICES, PRINTING_INDEX, cad, priceConfidence, priceFor, rarityRank, shortSet } from '../lib/data';
import { useStore } from '../lib/store';
import { CardImg, Pip, RarityBadge, Stat } from '../components/bits';

export function PriceBook({ onOpen }: { onOpen: (slug: string) => void }) {
  const { entries } = useStore();
  const [sortBy, setSortBy] = useState<'total' | 'unit' | 'name'>('total');

  const lines = useMemo(
    () =>
      entries
        .map((e) => {
          const card = BY_SLUG.get(e.slug)!;
          const pr = priceFor(e.slug, e.printingId);
          const printing = PRINTING_INDEX.get(e.printingId)?.printing;
          return { e, card, printing, unit: pr?.cad ?? 0, total: (pr?.cad ?? 0) * e.qty, conf: pr ? priceConfidence(pr.point) : null, url: pr?.point.url };
        })
        .filter((l) => l.card),
    [entries],
  );
  const sorted = [...lines].sort((a, b) =>
    sortBy === 'name' ? a.card.display.localeCompare(b.card.display) : sortBy === 'unit' ? b.unit - a.unit : b.total - a.total,
  );
  const total = lines.reduce((a, l) => a + l.total, 0);
  const topUnit = lines.reduce<(typeof lines)[number] | null>((m, l) => (!m || l.unit > m.unit ? l : m), null);
  const count = lines.reduce((a, l) => a + l.e.qty, 0);

  const group = (key: (l: (typeof lines)[number]) => string) => {
    const m = new Map<string, { v: number; n: number }>();
    for (const l of lines) {
      const k = key(l);
      const cur = m.get(k) ?? { v: 0, n: 0 };
      cur.v += l.total;
      cur.n += l.e.qty;
      m.set(k, cur);
    }
    return [...m.entries()];
  };
  const byRarity = group((l) => l.card.rarity).sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]));
  const byColor = group((l) => l.card.color).sort((a, b) => b[1].v - a[1].v);
  const byConf = group((l) => l.conf?.label ?? 'Unpriced');

  // extras beyond a 3-copy playset are trade bait
  const ownedBySlug = new Map<string, number>();
  for (const l of lines) ownedBySlug.set(l.card.slug, (ownedBySlug.get(l.card.slug) ?? 0) + l.e.qty);
  const extras = [...ownedBySlug.entries()]
    .filter(([, n]) => n > 3)
    .map(([slug, n]) => ({ slug, n: n - 3, unit: priceFor(slug)?.cad ?? 0 }))
    .sort((a, b) => b.unit * b.n - a.unit * a.n);
  const extrasValue = extras.reduce((a, x) => a + x.unit * x.n, 0);

  const exportCsv = () => {
    const rows = [['Card', 'Set', 'Number', 'Rarity', 'Qty', 'Unit CAD', 'Total CAD', 'Price basis']];
    for (const l of sorted) rows.push([l.card.display, l.printing?.set ?? '', l.printing?.num ?? '', l.card.rarity, String(l.e.qty), l.unit.toFixed(2), l.total.toFixed(2), l.conf?.label ?? '']);
    const csv = rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `cyberpunk-tcg-pricebook-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const bar = (rows: [string, { v: number; n: number }][], color?: boolean) => {
    const max = Math.max(0.01, ...rows.map((r) => r[1].v));
    return rows.map(([k, x]) => (
      <div className="hbar" key={k}>
        <span>{color ? <Pip color={k} /> : k} <span className="muted tiny">×{x.n}</span></span>
        <div className="track"><div style={{ width: `${(x.v / max) * 100}%` }} /></div>
        <span className="num">{cad(x.v)}</span>
      </div>
    ));
  };

  if (!entries.length) {
    return <div className="callout y">Add cards to your vault to see the price book.</div>;
  }

  return (
    <section>
      <div className="section-head">
        <h2>Price Book</h2>
        <p>
          Values use TCGplayer market prices (Near Mint), converted at 1 USD = {PRICES.fx.usdToCad.toFixed(4)} CAD. The retail set
          launched on Nov 6, 2026, so many singles have only a handful of sales. Treat these as directional.
        </p>
      </div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat k="Total value" v={cad(total)} s={`${count} cards`} />
        <Stat k="Average per card" v={cad(count ? total / count : 0)} tone="cyan" />
        <Stat k="Top card" v={topUnit ? cad(topUnit.unit) : '—'} s={topUnit?.card.display} tone="red" />
        <Stat k="Trade bait" v={cad(extrasValue)} s={`${extras.reduce((a, x) => a + x.n, 0)} copies beyond a 3-copy playset`} />
      </div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="panel"><div className="panel-title">By rarity</div>{bar(byRarity)}</div>
        <div className="panel"><div className="panel-title">By color</div>{bar(byColor, true)}</div>
        <div className="panel">
          <div className="panel-title">Price confidence</div>
          {bar(byConf)}
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            <b>Market</b>: recent TCGplayer sales. <b>Beta proxy</b>: the Retail printing has no sales yet, so the Beta printing's
            market price stands in. <b>Low listing</b>: cheapest current listing, no sales.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Holdings
          <span className="aside row" style={{ gap: 8 }}>
            <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="total">Sort: total value</option>
              <option value="unit">Sort: unit price</option>
              <option value="name">Sort: name</option>
            </select>
            <button className="btn sm ghost" onClick={exportCsv}>Export CSV</button>
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="nosort" /><th className="nosort">Card</th><th className="nosort hide-sm">Printing</th>
                <th className="nosort hide-sm">Rarity</th><th className="nosort num">Qty</th><th className="nosort num">Unit</th>
                <th className="nosort num">Total</th><th className="nosort">Basis</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.e.printingId} onClick={() => onOpen(l.card.slug)}>
                  <td><CardImg className="thumb" slug={l.card.slug} alt="" /></td>
                  <td><div className="cname">{l.card.name}</div>{l.card.sub && <div className="csub">{l.card.sub}</div>}</td>
                  <td className="hide-sm csub">{l.printing ? `${shortSet(l.printing.set)} #${l.printing.num}` : '—'}</td>
                  <td className="hide-sm"><RarityBadge r={l.card.rarity} /></td>
                  <td className="num">{l.e.qty}</td>
                  <td className="num">{cad(l.unit)}</td>
                  <td className="num" style={{ color: 'var(--y)' }}>{cad(l.total)}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    {l.conf && <span className={`badge ${l.conf.tone}`}>{l.conf.label}</span>}{' '}
                    {l.url && <a className="tiny" href={l.url} target="_blank" rel="noreferrer">↗</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {extras.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title">Trade binder <span className="aside">Copies beyond 3, the deck limit</span></div>
          <div className="row">
            {extras.map((x) => (
              <span key={x.slug} className="badge warn" style={{ fontSize: 12, padding: '4px 8px' }}>
                {BY_SLUG.get(x.slug)?.display} ×{x.n} · {cad(x.unit * x.n)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
