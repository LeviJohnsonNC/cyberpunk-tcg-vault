import { useMemo, useRef, useState } from 'react';
import { StarterAddedBanner, StarterIntake, type StarterAdded } from '../components/StarterIntake';
import { BY_SLUG, CARDS, COLORS, TYPES, rarityRank, searchCards } from '../lib/data';
import { collectionCard, collectionValue, compareCollection, type CollectionCard, type CollectionOrder, type CollectionSort } from '../lib/collection';
import { getCurrency, money, moneyOr } from '../lib/currency';
import { useStore, type Entry } from '../lib/store';
import { CardImg, Pip, RarityBadge } from '../components/bits';
import { Masthead, MetricStrip } from '../components/ui';
import { DeleteCollection } from '../components/DeleteCollection';
import { VaultSelect } from '../components/VaultSelect';
import { downloadCollection } from '../lib/exportCollection';
import { CollectionBinder, CollectionQuantity, type OpenCollectionCard } from './CollectionBinder';
import './collection.css';

type CollectionView = 'binder' | 'list';
const viewKey = 'cptv.collection-view.v1';
const rarities = [...new Set(CARDS.map((card) => card.rarity))].sort((a, b) => rarityRank(a) - rarityRank(b));
const sortOptions: Array<{ key: CollectionSort; direction: 1 | -1; label: string }> = [
  { key: 'name', direction: 1, label: 'Name (A–Z)' },
  { key: 'name', direction: -1, label: 'Name (Z–A)' },
  { key: 'catalog', direction: 1, label: 'Catalog order' },
  ...([
    ['value', 'Owned value'], ['unit', 'Buy estimate'], ['qty', 'Owned copies'],
    ['cost', 'Cost'], ['power', 'Power'], ['ram', 'RAM'], ['rarity', 'Base rarity'],
  ] as const).flatMap(([key, label]) => [
    { key, direction: -1 as const, label: `${label} (high first)` },
    { key, direction: 1 as const, label: `${label} (low first)` },
  ]),
  ...(['color', 'type'] as const).flatMap((key) => [
    { key, direction: 1 as const, label: `${key === 'color' ? 'Color' : 'Type'} (A–Z)` },
    { key, direction: -1 as const, label: `${key === 'color' ? 'Color' : 'Type'} (Z–A)` },
  ]),
];
const sortValue = ({ key, direction }: CollectionOrder) => `${key}:${direction}`;
const sortGroups = [
  { label: 'Card order', keys: ['name', 'catalog'] },
  { label: 'Collection and pricing', keys: ['value', 'unit', 'qty'] },
  { label: 'Card attributes', keys: ['cost', 'power', 'ram', 'rarity', 'color', 'type'] },
].map(({ label, keys }) => ({
  label,
  options: sortOptions.filter(({ key }) => keys.includes(key)).map((sort) => ({ value: sortValue(sort), label: sort.label })),
}));
const rarityOptions = [{ value: '', label: 'All rarities' }, ...rarities.map((rarity) => ({ value: rarity, label: rarity }))];
const costOptions = [{ value: '', label: 'Any cost' }, ...['0', '1', '2', '3', '4', '5', '6', '7+'].map((cost) => ({ value: cost, label: `${cost} €$` }))];

function savedView(): CollectionView {
  try {
    return localStorage.getItem(viewKey) === 'list' ? 'list' : 'binder';
  } catch {
    return 'binder';
  }
}

function ViewIcon({ view }: { view: CollectionView }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      {view === 'binder'
        ? <path d="M1.5 1.5h5v5h-5z M9.5 1.5h5v5h-5z M1.5 9.5h5v5h-5z M9.5 9.5h5v5h-5z" />
        : <path d="M1 3h2m2 0h10M1 8h2m2 0h10M1 13h2m2 0h10" />}
    </svg>
  );
}

function CollectionList({ items, sort, setSort, onOpen }: {
  items: CollectionCard[];
  sort: CollectionOrder;
  setSort: (sort: CollectionOrder) => void;
  onOpen: OpenCollectionCard;
}) {
  const th = (key: CollectionSort, label: string, cls = '') => (
    <th className={`sortable ${cls}`} aria-sort={sort.key === key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort({ key, direction: sort.key === key ? (sort.direction === 1 ? -1 : 1) : ['name', 'color', 'type'].includes(key) ? 1 : -1 })}>
        {label}
        {sort.key === key && <span className="arrow" aria-hidden="true">{sort.direction === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
  return (
    <div className="table-wrap collection-list">
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
          {items.map((item) => {
            const { card, qty, value, quote } = item;
            return (
              <tr key={card.slug} className={qty ? undefined : 'unowned'} onClick={(e) => onOpen(card.slug, undefined, undefined, e.currentTarget.querySelector('button.cname') ?? undefined)}>
                <td className="collection-art-cell"><CardImg className="thumb collection-thumb" slug={card.slug} alt="" /></td>
                <td>
                  <button className="cname" onClick={(e) => { e.stopPropagation(); onOpen(card.slug, undefined, undefined, e.currentTarget); }}>{card.name}</button>
                  {card.sub && <div className="csub">{card.sub}</div>}
                </td>
                <td className="hide-sm"><Pip color={card.color} /></td>
                <td className="hide-sm">{card.type} {card.sellable && <span className="badge sell" title="Has a sell tag">€$</span>}</td>
                <td className="num hide-sm">{card.cost ?? '—'}</td>
                <td className="num hide-sm">{card.power != null ? (card.type === 'Gear' ? `+${card.power}` : card.power) : '—'}</td>
                <td className="num hide-sm">{card.ram ?? '—'}</td>
                <td className="hide-sm"><RarityBadge r={card.rarity} /></td>
                <td className="hide-sm csub">{card.traits.join(' · ')}</td>
                <td className="collection-owned" onClick={(e) => e.stopPropagation()}><CollectionQuantity item={item} onOpen={onOpen} /></td>
                <td className={`num hide-sm ${quote ? '' : 'muted'}`}>{moneyOr(quote?.cad)}</td>
                <td className={`num ${value.copies > value.unpriced ? 'accent' : 'muted'}`}>
                  {!value.copies ? '' : value.unpriced === value.copies ? 'Unpriced' : money(value.knownCad)}
                  {value.unpriced > 0 && value.unpriced < value.copies && <div className="csub">+{value.unpriced} unpriced</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Collection({ onOpen, goAdd, mobile }: { onOpen: OpenCollectionCard; goAdd: () => void; mobile: boolean }) {
  const { entries, owned, startDemo, collectionReady, collectionError, retryCollection } = useStore();
  const [justAdded, setJustAdded] = useState<StarterAdded | null>(null);
  const [view, setView] = useState<CollectionView>(savedView);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [rarity, setRarity] = useState('');
  const [cost, setCost] = useState('');
  const [sellOnly, setSellOnly] = useState(false);
  const [sort, setSort] = useState<CollectionOrder>({ key: 'name', direction: 1 });
  const sheet = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const activeFilters = colors.length + types.length + Number(!!rarity) + Number(!!cost) + Number(sellOnly);
  const ready = collectionReady && !collectionError;
  const emptyVault = ready && scope === 'mine' && entries.length === 0;

  const byCard = useMemo(() => {
    const bySlug = new Map<string, Entry[]>();
    for (const entry of entries) {
      const group = bySlug.get(entry.slug);
      if (group) group.push(entry);
      else bySlug.set(entry.slug, [entry]);
    }
    return bySlug;
  }, [entries]);

  const rows = useMemo(() => {
    if (!ready) return [];
    const pool = scope === 'mine' ? CARDS.filter((card) => owned.has(card.slug)) : CARDS;
    return searchCards(q, pool).filter((card) =>
      (!colors.length || colors.includes(card.color)) &&
      (!types.length || types.includes(card.type)) &&
      (!rarity || card.rarity === rarity) &&
      (!cost || (cost === '7+' ? (card.cost ?? -1) >= 7 : String(card.cost) === cost)) &&
      (!sellOnly || card.sellable)
    ).map((card) => collectionCard(card, byCard.get(card.slug) ?? [], owned.get(card.slug) ?? 0))
      .sort((a, b) => compareCollection(a, b, sort));
  }, [ready, scope, q, colors, types, rarity, cost, sellOnly, byCard, owned, sort]);

  const totals = collectionValue(entries);
  const unspec = ready ? entries.filter((entry) => !BY_SLUG.get(entry.slug)?.printings.some((p) => p.id === entry.printingId)) : [];
  const unspecCopies = unspec.reduce((n, entry) => n + entry.qty, 0);
  const toggle = (value: string, set: (updater: (values: string[]) => string[]) => void) =>
    set((values) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  const clearFilters = () => {
    setColors([]);
    setTypes([]);
    setRarity('');
    setCost('');
    setSellOnly(false);
  };
  const chooseView = (next: CollectionView) => {
    setView(next);
    try { localStorage.setItem(viewKey, next); } catch { /* Storage can be disabled. */ }
  };
  const browseCatalog = () => {
    setQ('');
    clearFilters();
    setScope('all');
    if (mobile) heading.current?.focus();
  };
  const welcome = emptyVault && (
    <section className="empty-hero collection-empty-vault" aria-labelledby="empty-hero-title">
      <img src="/img/empty-vault.webp" alt="" width={960} height={720} />
      <div className="empty-hero-text">
        <h2 id="empty-hero-title">Start your Vault</h2>
        <p>Log a card or add a starter deck to begin your collection.</p>
        <button className="btn collection-first-add" onClick={goAdd}>Add a card</button>
        <h3 className="collection-start-label">Log a starter deck</h3>
        <StarterIntake onAdded={(added) => { setJustAdded(added); setScope('mine'); }} />
        <div className="row collection-explore">
          <button className="btn ghost" onClick={startDemo}>Explore the sample Vault</button>
          <button className="linklike collection-browse-link" onClick={browseCatalog}>Browse the full catalog</button>
        </div>
      </div>
    </section>
  );
  const masthead = <Masthead eyebrow="The Afterlife / Inventory" title="Collection"
    sub={mobile ? undefined : ready ? <>{owned.size} unique <span className="sep" aria-hidden="true">◆</span> {CARDS.length} in the catalog</> : 'Your card vault'} />;
  const collectionStatus = collectionError
    ? <div className="collection-empty" role="alert"><p>Couldn’t load your collection.</p><button className="btn quiet sm" onClick={retryCollection}>Try again</button></div>
    : <div className="collection-empty" role="status">Loading your collection…</div>;

  if (mobile && (!ready || emptyVault)) {
    return (
      <section className="collection-page">
        <div className="collection-heading" ref={heading} tabIndex={-1}>{masthead}</div>
        {ready ? welcome : collectionStatus}
      </section>
    );
  }

  const highlights = [
    { label: 'Cards owned', context: ready ? `${owned.size} unique` : undefined, value: ready ? totals.copies : '—' },
    {
      label: 'Estimated value',
      context: ready ? `${getCurrency()}${totals.unpriced ? ` · ${totals.unpriced} unpriced` : ''}` : undefined,
      value: ready ? totals.copies > 0 && totals.unpriced === totals.copies ? 'Unpriced' : money(totals.knownCad) : '—',
    },
  ];
  const collectionStats = [
    { label: 'Legends', context: ready ? 'unique owned' : undefined, value: ready ? CARDS.filter((card) => card.type === 'Legend' && owned.has(card.slug)).length : '—' },
    { label: 'Catalog completion', context: ready ? `${owned.size} / ${CARDS.length} cards` : undefined, value: ready ? `${Math.round(owned.size / CARDS.length * 100)}%` : '—' },
  ];

  const filters = (
    <div className="collection-filters">
      <fieldset>
        <legend>Color</legend>
        {COLORS.map((color) => (
          <label key={color} className="collection-check">
            <input type="checkbox" checked={colors.includes(color)} onChange={() => toggle(color, setColors)} />
            <span aria-hidden="true"><Pip color={color} bare /></span>{color}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Type</legend>
        {TYPES.map((type) => (
          <label key={type} className="collection-check">
            <input type="checkbox" checked={types.includes(type)} onChange={() => toggle(type, setTypes)} />{type}
          </label>
        ))}
      </fieldset>
      <label className="collection-filter">
        <span>Base rarity</span>
        <VaultSelect aria-label="Base rarity" value={rarity} onValueChange={setRarity} options={rarityOptions} />
      </label>
      <label className="collection-filter">
        <span>Cost</span>
        <VaultSelect aria-label="Cost" value={cost} onValueChange={setCost} options={costOptions} />
      </label>
      <label className="collection-check collection-sellable"><input type="checkbox" checked={sellOnly} onChange={(e) => setSellOnly(e.target.checked)} />Sellable only</label>
      <button className="btn quiet sm collection-clear" onClick={clearFilters} disabled={!activeFilters}>Clear filters</button>
    </div>
  );

  return (
    <section className="collection-page">
      <div className="collection-heading" ref={heading} tabIndex={-1}>
        {masthead}
        <div className="collection-overview">
          <div className="collection-actions">
            <button className="btn quiet sm collection-export" disabled={!ready || !entries.length} onClick={() => downloadCollection(entries)}>Export</button>
            <details className="collection-action-menu">
              <summary className="btn quiet sm" aria-label="Collection actions">•••</summary>
              <div>
                <button className="btn quiet sm collection-export-mobile" disabled={!ready || !entries.length} onClick={() => downloadCollection(entries)}>Export</button>
                {ready ? <DeleteCollection /> : <button className="btn quiet sm" disabled>Delete collection</button>}
              </div>
            </details>
          </div>
          <MetricStrip items={mobile ? highlights : [...highlights, ...collectionStats]} />
          {mobile && <details className="collection-summary">
            <summary>Collection summary</summary>
            <dl>
              {collectionStats.map(({ label, value, context }) => <div key={label}><dt>{label}</dt><dd><strong>{value}</strong> {context}</dd></div>)}
            </dl>
          </details>}
        </div>
      </div>

      <div className="collection-searchbar">
        <div className="chips" role="group" aria-label="Scope">
          <button className="chip" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>My cards</button>
          <button className="chip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{mobile ? 'Catalog' : 'Full database'}</button>
        </div>
        <input className="input search" type="search" aria-label="Search cards" placeholder="Search name, traits, or rules text" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="collection-toolbar-actions">
          <button className="btn quiet sm collection-filter-trigger" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>
            Filters{activeFilters > 0 && <span className="collection-filter-count">{activeFilters}</span>}
          </button>
          <div className="collection-view-switch" role="group" aria-label="Collection view">
            {(['list', 'binder'] as const).map((next) => (
              <button key={next} type="button" aria-pressed={view === next} onClick={() => chooseView(next)}><ViewIcon view={next} />{next === 'binder' ? 'Binder' : 'List'}</button>
            ))}
          </div>
        </div>
      </div>

      {unspecCopies > 0 && (
        <details className="collection-unspecified">
          <summary>{unspecCopies} {unspecCopies === 1 ? 'copy needs' : 'copies need'} a printing identified</summary>
          <div className="unspec-list">
            {unspec.slice(0, 12).map((entry) => (
              <button key={entry.printingId} className="chip" onClick={(e) => onOpen(entry.slug, undefined, true, e.currentTarget)}>{BY_SLUG.get(entry.slug)?.display} ×{entry.qty}</button>
            ))}
            {unspec.length > 12 && <span className="tiny muted">and {unspec.length - 12} more</span>}
          </div>
        </details>
      )}
      {justAdded && <StarterAddedBanner added={justAdded} onDismiss={() => setJustAdded(null)} goPrices={() => { window.location.hash = '/prices'; }} />}

      <div className="collection-workspace">
        <aside className="collection-filter-rail" aria-label="Collection filters">
          <h2>Filters</h2>
          {filters}
        </aside>
        <dialog className="collection-filter-sheet" ref={sheet} aria-labelledby="collection-filter-title">
          <div className="collection-filter-heading">
            <h2 id="collection-filter-title">Filters</h2>
            <button className="iconbtn" onClick={() => sheet.current?.close()} aria-label="Close filters">×</button>
          </div>
          {filters}
          <button className="btn collection-filter-done" onClick={() => sheet.current?.close()}>Show {ready ? rows.length : ''} {rows.length === 1 ? 'card' : 'cards'}</button>
        </dialog>

        <div className="collection-results" aria-busy={!ready && !collectionError}>
          <header className="collection-ticket">
            <h2>{view === 'binder' ? 'Collection binder' : 'Collection list'}</h2>
            <span className="collection-result-count" role="status">{ready ? `${rows.length} ${rows.length === 1 ? 'card' : 'cards'}` : ''}</span>
            <label className="collection-sort">
              <span>Sort by</span>
              <VaultSelect aria-label="Sort by" value={sortValue(sort)} options={sortGroups} onValueChange={(value) => {
                const selected = sortOptions.find((option) => sortValue(option) === value);
                if (selected) setSort(selected);
              }} />
            </label>
          </header>
          {!ready ? (
            collectionStatus
          ) : emptyVault ? (
            welcome
          ) : !rows.length ? (
            <div className="collection-empty"><p>No matching cards.</p><button className="btn quiet sm" onClick={() => { setQ(''); clearFilters(); }}>Clear search and filters</button></div>
          ) : view === 'binder' ? (
            <CollectionBinder items={rows} onOpen={onOpen} />
          ) : (
            <CollectionList items={rows} sort={sort} setSort={setSort} onOpen={onOpen} />
          )}
        </div>
      </div>
    </section>
  );
}
