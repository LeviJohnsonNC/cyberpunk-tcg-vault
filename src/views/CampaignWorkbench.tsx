import { useMemo, useRef, useState, type Ref } from 'react';
import { BY_SLUG, CARDS, type Card, type Printing } from '../lib/data';
import { COPY_MAX, MAIN_MAX, MAIN_MIN } from '../lib/decks';
import { totalCopies } from '../lib/deckDraft';
import type { CampaignRun } from '../lib/play/campaign';
import { packRarityLabel } from '../lib/play/campaignPack';
import { latestPack } from '../lib/play/campaignPresentation';
import { STARTERS } from '../lib/starters';
import { CampaignCrewCards, type CampaignInspect } from './CampaignHub';
import { CampaignDeckNumbers } from './CampaignDeckReview';
import { CampaignRewardArt } from './CampaignRewardArt';
import './campaign-workbench.css';

type CardFilter = 'all' | 'in-deck' | 'latest' | 'legends';
const filters: ReadonlyArray<{ id: CardFilter; label: string }> = [
  { id: 'all', label: 'All cards' },
  { id: 'in-deck', label: 'In deck' },
  { id: 'latest', label: 'New from last pack' },
  { id: 'legends', label: 'Legends' },
];

type WorkbenchProps = {
  run: CampaignRun; titleRef: Ref<HTMLHeadingElement>; busy: boolean; error?: string; issues: string[]; canUndo: boolean; fromPack: boolean;
  printings: ReadonlyMap<string, Printing>; inspect: CampaignInspect; review: (slug: string, printingId?: string, outgoing?: string) => void;
  quantity: (slug: string, change: number) => void; undo: () => void; restore: () => void; back: () => void;
};

function LegendReplacements({ run, printings, busy, inspect, review }: Pick<WorkbenchProps, 'run' | 'printings' | 'busy' | 'inspect' | 'review'>) {
  const equipped = run.deck.legends.map(slug => BY_SLUG.get(slug)!);
  const names = new Set(equipped.map(card => card.name));
  const earned = CARDS.filter(card => card.type === 'Legend' && run.inventory[card.slug] > 0 && !names.has(card.name));
  const alternateArt = [...printings].filter(([slug]) => BY_SLUG.get(slug)?.type === 'Legend');
  return <div className="campaign-workbench-replacements">
    {equipped.map(prior => {
      const replacements = earned.filter(card => card.color === prior.color);
      return <section key={prior.slug} className="campaign-workbench-replace">
        <h3>Replace {prior.display}</h3>
        {replacements.length ? <ul>{replacements.map(card => <li key={card.slug}>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => review(card.slug, printings.get(card.slug)?.id, prior.slug)}>
            <CampaignRewardArt pull={{ slug: card.slug, printing: printings.get(card.slug) }} alt="" />
            <span>{card.display}<small>{card.color} · {card.ram ?? 0} RAM</small></span>
          </button>
        </li>)}</ul> : <p>No other {prior.color} Legend earned.</p>}
      </section>;
    })}
    {!!alternateArt.length && <div className="campaign-workshop-actions" aria-label="Alternate-art Legends">
      {alternateArt.map(([slug, printing]) => <button type="button" key={slug} className="btn quiet" onClick={() => inspect(slug, printing.id)}>
        {BY_SLUG.get(slug)?.name} · {packRarityLabel(printing.rarity)}
      </button>)}
    </div>}
  </div>;
}

export function CampaignWorkbench({ run, titleRef, busy, error, issues, canUndo, fromPack, printings, inspect, review, quantity, undo, restore, back }: WorkbenchProps) {
  const [filter, setFilter] = useState<CardFilter>(fromPack ? 'latest' : 'all');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const results = useRef<HTMLDivElement>(null);
  const colors = STARTERS.find(starter => starter.key === run.starter)?.colors ?? [];
  const total = totalCopies(run.deck.cards);
  const pack = useMemo(() => new Map(latestPack(run).map(pull => [pull.slug, pull])), [run]);
  const owned = useMemo(() => CARDS.filter(card => run.inventory[card.slug] > 0)
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.display.localeCompare(b.display)), [run.inventory]);
  const term = query.trim().toLowerCase();
  const visible = owned.filter(card => {
    if (filter === 'latest' ? !pack.has(card.slug) : card.type === 'Legend') return false;
    if (filter === 'in-deck' && !run.deck.cards[card.slug]) return false;
    if (type && card.type !== type) return false;
    return !term || `${card.display} ${card.color} ${card.type} ${card.keywords.join(' ')}`.toLowerCase().includes(term);
  });

  function inventoryCard(card: Card) {
    const { slug } = card;
    const legend = card.type === 'Legend';
    const inDeck = legend ? Number(run.deck.legends.includes(slug)) : run.deck.cards[slug] ?? 0;
    const earned = run.inventory[slug];
    const fitsColor = colors.includes(card.color);
    const addReason = !fitsColor ? 'Outside starter colours'
      : inDeck >= COPY_MAX ? `${COPY_MAX}-copy limit reached`
      : inDeck >= earned ? 'All earned copies are in the deck'
      : total >= MAIN_MAX ? `Deck is at ${MAIN_MAX} cards` : undefined;
    const printing = (filter === 'latest' ? pack.get(slug)?.printing : undefined) ?? printings.get(slug);
    const viewCard = () => (fitsColor ? review : inspect)(slug, printing?.id);
    const limitId = `campaign-quantity-limit-${slug}`;
    return <li key={slug} className="campaign-workbench-card" data-new={pack.has(slug) || undefined}>
      <button type="button" className="campaign-workbench-card-art" aria-label={`${fitsColor ? 'Compare' : 'Inspect'} ${card.display}`}
        aria-haspopup="dialog" disabled={busy} onClick={viewCard}>
        <CampaignRewardArt pull={{ slug, printing }} alt="" />
      </button>
      <div className="campaign-workbench-card-data">
        <strong>{card.display}</strong>
        <small>{card.color} · {card.type}{legend ? '' : ` · Cost ${card.cost ?? '—'}`} · RAM {card.ram ?? '—'}{printing?.rarity.startsWith('Iconic ') ? ` · ${packRarityLabel(printing.rarity)}` : ''}</small>
        <div className="campaign-workbench-card-meta">
          <span className="campaign-workbench-count">{inDeck} in deck · {earned} earned</span>
          <button type="button" className="campaign-workbench-compare" disabled={busy} onClick={viewCard}>
            {fitsColor ? legend ? 'Compare crew' : 'Compare' : 'Inspect'}
          </button>
        </div>
        {!legend && <div className="campaign-workbench-quantity">
            <button type="button" className="btn quiet sm" aria-label={`Remove ${card.display}`} title={inDeck ? undefined : 'No copies in the deck'}
              disabled={busy || !inDeck} onClick={() => quantity(slug, -1)}>−</button>
            <button type="button" className="btn quiet sm" aria-label={`Add ${card.display}`} aria-describedby={addReason ? limitId : undefined}
              disabled={busy || !!addReason} onClick={() => quantity(slug, 1)}>+</button>
            {addReason && <small id={limitId}>{addReason}</small>}
          </div>}
      </div>
    </li>;
  }

  return <section className="campaign-workbench" aria-labelledby="campaign-workbench-title">
    <header className="campaign-workbench-head">
      <div><p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> Campaign</p>
        <h1 id="campaign-workbench-title" tabIndex={-1} ref={titleRef}>Deck Workbench<span aria-hidden="true">.</span></h1></div>
      <button type="button" className="btn quiet" disabled={busy} onClick={back}>← Back to contract</button>
    </header>
    <div className="campaign-workbench-layout">
      <aside className="campaign-workbench-deck" aria-label="Current campaign deck">
        <p className="play-eyebrow">{colors.join(' + ')}</p>
        <h2>{run.deck.name}</h2>
        <CampaignCrewCards deck={run.deck} printings={printings} inspect={inspect} label="Equipped Legends" />
        <CampaignDeckNumbers deck={run.deck} />
        <div className="campaign-workbench-status" role="status">
          <strong>{busy ? 'Saving deck…' : error ? 'Save needs attention' : 'Saved in this browser'}</strong>
          <span data-invalid={issues.length > 0 || undefined}>{issues.length ? 'Deck needs edits' : 'Ready to play'}</span>
        </div>
        {issues.length > 0 && <ul className="campaign-workbench-issues">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        <div className="campaign-workshop-actions">
          <button type="button" className="btn quiet sm" disabled={!canUndo || busy} onClick={undo}>Undo last edit</button>
          <button type="button" className="btn quiet sm" disabled={busy || !issues.length} onClick={restore}>Restore last legal deck</button>
        </div>
      </aside>
      <section className="campaign-workbench-reserve" aria-labelledby="campaign-reserve-title">
        <header className="campaign-workbench-reserve-head">
          <h2 id="campaign-reserve-title">{filter === 'legends' ? 'Earned Legends' : 'Campaign reserve'}</h2>
          <div className="campaign-workbench-filters" aria-label="Reserve views">{filters.map(item => <button type="button" key={item.id}
            className="btn quiet sm" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); if (item.id !== 'latest' && type === 'Legend') setType(''); if (results.current) results.current.scrollTop = 0; }}>
            {item.label}{item.id === 'latest' && pack.size > 0 ? ` (${pack.size})` : ''}
          </button>)}</div>
          {filter !== 'legends' && <div className="campaign-workbench-search">
            <label><span className="sr-only">Search reserve</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search cards…" /></label>
            <label><span className="sr-only">Card type</span><select value={type} onChange={event => setType(event.target.value)}>
              <option value="">All types</option><option>Unit</option><option>Gear</option><option>Program</option>{filter === 'latest' && <option>Legend</option>}
            </select></label>
            <small role="status">{visible.length} {visible.length === 1 ? 'card' : 'cards'}</small>
          </div>}
        </header>
        <div className="campaign-workbench-results" ref={results} tabIndex={0} role="region" aria-label={filter === 'legends' ? 'Legend replacements' : 'Reserve results'}>
          {filter === 'legends' ? <LegendReplacements run={run} printings={printings} busy={busy} inspect={inspect} review={review} />
            : visible.length ? <ul className="campaign-workbench-cards">{visible.map(inventoryCard)}</ul>
              : <p>{filter === 'latest' && !pack.size ? 'Finish a match to earn your first pack.' : 'No cards match these filters.'}</p>}
        </div>
        {filter !== 'legends' && <p className="campaign-workbench-limit">Main deck · {total} cards · {MAIN_MIN}–{MAIN_MAX} to play</p>}
      </section>
    </div>
  </section>;
}
