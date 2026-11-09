import { useMemo, useState } from 'react';
import { StarterAddedBanner, StarterIntake, type StarterAdded } from '../components/StarterIntake';
import { BY_SLUG, CARDS, COLORS, PRINTING_INDEX, TYPES, acquireQuote, defaultPrinting, isUnspecified, printingLabel, rarityRank, searchCards, valueHolding, type Card } from '../lib/data';
import { getCurrency, money, moneyOr } from '../lib/currency';
import { useStore, type Entry } from '../lib/store';
import { CardImg, Pip, RarityBadge } from '../components/bits';
import { Masthead, MetricStrip } from '../components/ui';
import { DeleteCollection } from '../components/DeleteCollection';
import { downloadCollection } from '../lib/exportCollection';
import './collection.css';

type SortKey = 'name' | 'color' | 'type' | 'cost' | 'power' | 'ram' | 'rarity' | 'qty' | 'unit' | 'value';

function quantityTargetLabel(printingId: string): string {
  const printing = PRINTING_INDEX.get(printingId)?.printing;
  if (!printing) return 'Unspecified';
  const set = printing.set
    .replace('Welcome to Night City — ', '')
    .replace('The Heist — ', 'Heist ')
    .replace('Embracing Power — ', 'Power ')
    .replace(' Starter Deck', '')
    .replace(' — ', ' ');
  return `${set} #${printing.num}`;
}

/** Holdings value: priced copies summed, unpriced copies counted (never valued at zero or borrowed). */
export function valueOf(entries: Entry[]) {
  let knownCad = 0;
  let unpriced = 0;
  let copies = 0;
  for (const e of entries) {
    const v = valueHolding(e.printingId);
    if (v) knownCad += v.cad * e.qty;
    else unpriced += e.qty;
    copies += e.qty;
  }
  return { knownCad, unpriced, copies };
}

export function Collection({ onOpen, goAdd }: { onOpen: (slug: string) => void; goAdd: () => void }) {
  const { entries, owned, setQty, startDemo } = useStore();
  const [justAdded, setJustAdded] = useState<StarterAdded | null>(null);
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
      const unit = acquireQuote(c.slug)?.cad ?? null; // what one playable copy costs to buy
      const value = valueOf(es);
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
        case 'unit': return r.unit ?? -1;
        case 'value': return scope === 'mine' ? r.value.knownCad - (r.value.copies && r.value.unpriced === r.value.copies ? 1 : 0) : r.unit ?? -1;
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
    <th className={`sortable ${cls}`} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((-s.dir) as 1 | -1) : k === 'name' ? 1 : -1 }))}>
        {label}
        {sort.k === k && <span className="arrow" aria-hidden="true">{sort.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
  const rarities = [...new Set(CARDS.map((c) => c.rarity))].sort((a, b) => rarityRank(a) - rarityRank(b));

  // Quick +/- only when the target printing is unambiguous: the one holding you have, or the
  // card's default printing when you have none. With several printings you choose in the drawer.
  const quickTarget = (c: Card, es: Entry[]) => (es.length === 1 ? es[0].printingId : es.length === 0 ? defaultPrinting(c).id : null);
  const unspec = entries.filter((e) => isUnspecified(e.printingId) || !BY_SLUG.get(e.slug)?.printings.some((p) => p.id === e.printingId));
  const unspecCopies = unspec.reduce((a, e) => a + e.qty, 0);

  return (
    <section>
      <Masthead
        eyebrow="The Afterlife / Inventory"
        title="Collection"
        sub={<>{owned.size} unique <span className="sep" aria-hidden="true">◆</span> {CARDS.length} in Welcome to Night City</>}
      >
        <button className="btn quiet sm" disabled={!entries.length} onClick={() => downloadCollection(entries)}>Export</button>
        <DeleteCollection />
      </Masthead>
      <MetricStrip
        items={[
          { label: 'Cards owned', context: `${owned.size} unique`, value: total },
          {
            label: 'Collection value',
            context: totalValue.unpriced ? `${getCurrency()} · ${totalValue.unpriced} unpriced` : `TCGplayer market, ${getCurrency()}`,
            value: money(totalValue.knownCad),
          },
          { label: 'Legends', context: 'unique owned', value: CARDS.filter((c) => c.type === 'Legend' && owned.has(c.slug)).length },
          { label: 'Set completion', context: 'unique cards', value: `${Math.round((owned.size / CARDS.length) * 100)}%` },
        ]}
      />

      {unspecCopies > 0 && (
        <div className="callout y unspec-banner" role="status">
          <div className="row">
            <span>
              <b>{unspecCopies} {unspecCopies === 1 ? 'copy has' : 'copies have'} no printing set.</b> They count for deck building but stay unpriced. Set Retail or Beta to price them.
            </span>
          </div>
          <div className="unspec-list">
            {unspec.slice(0, 12).map((e) => (
              <button key={e.printingId} className="chip" onClick={() => onOpen(e.slug)}>
                {BY_SLUG.get(e.slug)?.name} ×{e.qty}
              </button>
            ))}
            {unspec.length > 12 && <span className="tiny muted">and {unspec.length - 12} more</span>}
          </div>
        </div>
      )}
      {justAdded && <StarterAddedBanner added={justAdded} onDismiss={() => setJustAdded(null)} goPrices={() => (window.location.hash = '/prices')} />}
      {entries.length === 0 && (
        <section className="empty-hero" aria-labelledby="empty-hero-title">
          <img src="/img/empty-vault.webp" alt="" width={960} height={720} />
          <div className="empty-hero-text">
            <h2 id="empty-hero-title">Your case is empty</h2>
            <p>Got a starter deck? Log the whole box in one click.</p>
            <StarterIntake onAdded={(a) => { setJustAdded(a); setScope('mine'); }} />
            <p className="empty-hero-or">Or add cards by search or photo, or look around with a sample collection first.</p>
            <div className="row">
              <button className="btn quiet" onClick={goAdd}>Add cards</button>
              <button className="btn ghost" onClick={startDemo}>Try the demo</button>
            </div>
          </div>
        </section>
      )}

      <div className="panel collection-panel">
        <div className="toolbar collection-searchbar">
          <div className="chips" role="group" aria-label="Scope">
            <button className="chip" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>My cards</button>
            <button className="chip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Full database</button>
          </div>
          <input className="input search grow" type="search" aria-label="Search cards" placeholder="Search name, traits, or rules text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="collection-filters">
          <div className="collection-filter" role="group" aria-labelledby="collection-color-label">
            <span id="collection-color-label" className="collection-filter-label">Color</span>
            <div className="chips">
              {COLORS.map((c) => (
                <button key={c} className="chip collection-color" aria-pressed={colors.includes(c)} onClick={() => toggle(colors, c, setColors)}>
                  <span aria-hidden="true"><Pip color={c} bare /></span>{c}
                </button>
              ))}
            </div>
          </div>
          <div className="collection-filter collection-type" role="group" aria-labelledby="collection-type-label">
            <span id="collection-type-label" className="collection-filter-label">Type</span>
            <div className="chips">
              {TYPES.map((t) => (
                <button key={t} className="chip" aria-pressed={types.includes(t)} onClick={() => toggle(types, t, setTypes)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="collection-filter-selects">
            <label className="collection-filter">
              <span className="collection-filter-label">Rarity</span>
              <select className="select" data-active={!!rarity} value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="">All rarities</option>
                {rarities.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="collection-filter">
              <span className="collection-filter-label">Cost</span>
              <select className="select" data-active={!!cost} value={cost} onChange={(e) => setCost(e.target.value)}>
                <option value="">Any cost</option>
                {['0', '1', '2', '3', '4', '5', '6', '7+'].map((c) => <option key={c} value={c}>{c} €$</option>)}
              </select>
            </label>
          </div>
          <label className="toggle"><input type="checkbox" checked={sellOnly} onChange={(e) => setSellOnly(e.target.checked)} />Sellable only</label>
          <span className="collection-results mono tiny muted" role="status">{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th><span className="sr-only">Art</span></th>
                {th('name', 'Card')}
                {th('color', 'Color', 'hide-sm')}
                {th('type', 'Type', 'hide-sm')}
                {th('cost', 'Cost', 'num hide-sm')}
                {th('power', 'Pwr', 'num hide-sm')}
                {th('ram', 'RAM', 'num hide-sm')}
                {th('rarity', 'Rarity', 'hide-sm')}
                <th className="hide-sm">Traits</th>
                {th('qty', 'Owned')}
                {th('unit', 'Buy 1', 'num hide-sm')}
                {th('value', 'Value', 'num')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, qty, unit, value, es }) => {
                const target = quickTarget(c, es);
                const targetLabel = target ? printingLabel(target, false) : '';
                return (
                  <tr key={c.slug} className={qty === 0 && scope === 'all' ? 'unowned' : ''} onClick={() => onOpen(c.slug)}>
                    <td className="collection-art-cell"><CardImg className="thumb collection-thumb" slug={c.slug} alt="" /></td>
                    <td>
                      <button className="cname" onClick={(e) => { e.stopPropagation(); onOpen(c.slug); }}>{c.name}</button>
                      {c.sub && <div className="csub">{c.sub}</div>}
                    </td>
                    <td className="hide-sm"><Pip color={c.color} /></td>
                    <td className="hide-sm">
                      {c.type} {c.sellable && <span className="badge sell" title="Has a sell tag">€$</span>}
                    </td>
                    <td className="num hide-sm">{c.cost ?? '—'}</td>
                    <td className="num hide-sm">{c.power != null ? (c.type === 'Gear' ? `+${c.power}` : c.power) : '—'}</td>
                    <td className="num hide-sm">{c.ram ?? '—'}</td>
                    <td className="hide-sm"><RarityBadge r={c.rarity} /></td>
                    <td className="hide-sm csub">{c.traits.join(' · ')}</td>
                    <td className="collection-owned" onClick={(e) => e.stopPropagation()}>
                      {target ? (
                        <>
                          <span className="qty">
                            <button className="iconbtn minus" disabled={qty === 0} onClick={() => setQty(c.slug, target, qty - 1)} aria-label={`Remove a ${targetLabel} copy of ${c.name}`}>−</button>
                            <b>{qty}</b>
                            <button className="iconbtn" onClick={() => setQty(c.slug, target, qty + 1)} aria-label={`Add a ${targetLabel} copy of ${c.name}`}>+</button>
                          </span>
                          <span className={`qty-target${isUnspecified(target) ? ' unspec' : ''}`}>
                            {quantityTargetLabel(target)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="qty"><b>{qty}</b></span>
                          <button className="btn quiet qty-pick" onClick={() => onOpen(c.slug)} aria-label={`Choose a printing of ${c.name} to change`}>
                            {es.length} printings
                          </button>
                        </>
                      )}
                    </td>
                    <td className={`num hide-sm ${unit == null ? 'muted' : ''}`}>{moneyOr(unit)}</td>
                    <td className={`num ${value.knownCad ? 'accent' : 'muted'}`}>
                      {!value.copies ? '' : value.unpriced === value.copies ? 'Unpriced' : money(value.knownCad)}
                      {value.unpriced > 0 && value.unpriced < value.copies && <div className="csub">+{value.unpriced} unpriced</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="collection-empty muted">No matching cards. Try a different search or filter.</p>}
        </div>
      </div>
    </section>
  );
}
