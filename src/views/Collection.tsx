import { useMemo, useState } from 'react';
import { CARDS, COLORS, TYPES, cad, defaultPrinting, priceFor, rarityRank, searchCards, type Card } from '../lib/data';
import { useStore, type Entry } from '../lib/store';
import { CardImg, Pip, RarityBadge, Stat } from '../components/bits';

type SortKey = 'name' | 'color' | 'type' | 'cost' | 'power' | 'ram' | 'rarity' | 'qty' | 'unit' | 'value';

export function valueOf(entries: Entry[]) {
  let v = 0;
  for (const e of entries) v += (priceFor(e.slug, e.printingId)?.cad ?? 0) * e.qty;
  return v;
}

export function Collection({ onOpen, goAdd }: { onOpen: (slug: string) => void; goAdd: () => void }) {
  const { entries, owned, setQty } = useStore();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>(entries.length ? 'mine' : 'all');
  const [colors, setColors] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [rarity, setRarity] = useState('');
  const [cost, setCost] = useState('');
  const [sellOnly, setSellOnly] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'value', dir: -1 });

  const byCard = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) m.set(e.slug, [...(m.get(e.slug) ?? []), e]);
    return m;
  }, [entries]);

  const rows = useMemo(() => {
    let pool: Card[] = scope === 'mine' ? CARDS.filter((c) => owned.has(c.slug)) : CARDS;
    pool = searchCards(q, pool);
    if (colors.length) pool = pool.filter((c) => colors.includes(c.color));
    if (types.length) pool = pool.filter((c) => types.includes(c.type));
    if (rarity) pool = pool.filter((c) => c.rarity === rarity);
    if (cost) pool = pool.filter((c) => (cost === '7+' ? (c.cost ?? 0) >= 7 : String(c.cost ?? '') === cost));
    if (sellOnly) pool = pool.filter((c) => c.sellable);
    const data = pool.map((c) => {
      const es = byCard.get(c.slug) ?? [];
      const qty = owned.get(c.slug) ?? 0;
      const unit = priceFor(c.slug, es[0]?.printingId ?? defaultPrinting(c)?.id)?.cad ?? 0;
      const value = es.length ? valueOf(es) : 0;
      return { c, qty, unit, value, es };
    });
    const get = (r: (typeof data)[number]): string | number => {
      switch (sort.k) {
        case 'name': return r.c.display;
        case 'color': return r.c.color;
        case 'type': return r.c.type;
        case 'cost': return r.c.cost ?? -1;
        case 'power': return r.c.power ?? -1;
        case 'ram': return r.c.ram ?? -1;
        case 'rarity': return rarityRank(r.c.rarity);
        case 'qty': return r.qty;
        case 'unit': return r.unit;
        case 'value': return scope === 'mine' ? r.value : r.unit;
      }
    };
    data.sort((a, b) => {
      const x = get(a), y = get(b);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return d * sort.dir || a.c.display.localeCompare(b.c.display);
    });
    return data;
  }, [scope, q, colors, types, rarity, cost, sellOnly, sort, byCard, owned]);

  const total = [...owned.values()].reduce((a, b) => a + b, 0);
  const totalValue = valueOf(entries);
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={cls} onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((-s.dir) as 1 | -1) : k === 'name' ? 1 : -1 }))}>
      {label}
      {sort.k === k && <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );
  const rarities = [...new Set(CARDS.map((c) => c.rarity))].sort((a, b) => rarityRank(a) - rarityRank(b));

  const bump = (c: Card, es: Entry[], d: number) => {
    const target = es.slice().sort((a, b) => b.qty - a.qty)[0];
    const pid = target?.printingId ?? defaultPrinting(c).id;
    const cur = target?.qty ?? 0;
    setQty(c.slug, pid, cur + d);
  };

  return (
    <section>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat k="Cards owned" v={total} s={`${owned.size} unique of ${CARDS.length}`} />
        <Stat k="Collection value" v={cad(totalValue)} s="TCGplayer market, in CAD" tone="red" />
        <Stat k="Legends" v={CARDS.filter((c) => c.type === 'Legend' && owned.has(c.slug)).length} s="unique Legends owned" tone="cyan" />
        <Stat k="Set completion" v={`${Math.round((owned.size / CARDS.length) * 100)}%`} s="unique cards, Welcome to Night City" />
      </div>

      {entries.length === 0 && (
        <div className="callout y" style={{ marginBottom: 16 }}>
          <div className="row">
            <span>Your vault is empty. Add cards by search, by photo, or import a collection file.</span>
            <span className="spacer" />
            <button className="btn sm" onClick={goAdd}>Add cards</button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="toolbar">
          <div className="chips">
            <button className={`chip ${scope === 'mine' ? 'on' : ''}`} onClick={() => setScope('mine')}>My cards</button>
            <button className={`chip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')}>Full database</button>
          </div>
          <input className="input search grow" placeholder="Search name, trait, rules text… e.g. blocker, netrunner, min gig" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">All rarities</option>
            {rarities.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="select" value={cost} onChange={(e) => setCost(e.target.value)}>
            <option value="">Any cost</option>
            {['0', '1', '2', '3', '4', '5', '6', '7+'].map((c) => <option key={c} value={c}>{c} €$</option>)}
          </select>
        </div>
        <div className="toolbar">
          <div className="chips">
            {COLORS.map((c) => (
              <button key={c} className={`chip c-${c} ${colors.includes(c) ? 'on' : ''}`} onClick={() => toggle(colors, c, setColors)}>{c}</button>
            ))}
          </div>
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t} className={`chip ${types.includes(t) ? 'on' : ''}`} onClick={() => toggle(types, t, setTypes)}>{t}</button>
            ))}
          </div>
          <label className="toggle"><input type="checkbox" checked={sellOnly} onChange={(e) => setSellOnly(e.target.checked)} />Sellable only</label>
          <span className="spacer" />
          <span className="mono tiny muted">{rows.length} RESULTS</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="nosort" />
                {th('name', 'Card')}
                {th('color', 'Color')}
                {th('type', 'Type')}
                {th('cost', 'Cost', 'num')}
                {th('power', 'Pwr', 'num')}
                {th('ram', 'RAM', 'num')}
                {th('rarity', 'Rarity', 'hide-sm')}
                <th className="nosort hide-sm">Traits</th>
                {th('qty', 'Owned')}
                {th('unit', 'Unit', 'num')}
                {th('value', 'Value', 'num')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, qty, unit, value, es }) => (
                <tr key={c.slug} className={qty === 0 && scope === 'all' ? 'unowned' : ''} onClick={() => onOpen(c.slug)}>
                  <td><CardImg className="thumb" slug={c.slug} alt="" /></td>
                  <td>
                    <div className="cname">{c.name}</div>
                    {c.sub && <div className="csub">{c.sub}</div>}
                    {es.some((e) => e.note) && <span className="badge warn" title={es.map((e) => e.note).join(' ')}>Note</span>}
                  </td>
                  <td><Pip color={c.color} /></td>
                  <td>
                    {c.type} {c.sellable && <span className="badge sell" title="Has a sell tag">€$</span>}
                  </td>
                  <td className="num">{c.cost ?? '—'}</td>
                  <td className="num">{c.power != null ? (c.type === 'Gear' ? `+${c.power}` : c.power) : '—'}</td>
                  <td className="num">{c.ram ?? '—'}</td>
                  <td className="hide-sm"><RarityBadge r={c.rarity} /></td>
                  <td className="hide-sm csub">{c.traits.join(' · ')}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className="qty">
                      <button className="iconbtn minus" disabled={qty === 0} onClick={() => bump(c, es, -1)}>−</button>
                      <b>{qty}</b>
                      <button className="iconbtn" onClick={() => bump(c, es, 1)}>+</button>
                    </span>
                  </td>
                  <td className="num">{unit ? cad(unit) : '—'}</td>
                  <td className="num" style={{ color: value ? 'var(--y)' : undefined }}>{value ? cad(value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
