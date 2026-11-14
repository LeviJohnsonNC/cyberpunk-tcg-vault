import { useRef, useState, type Ref } from 'react';
import { ConfirmDialog } from '../components/ui';
import { BY_SLUG, CARDS, defaultPrinting, type Card, type Printing } from '../lib/data';
import { MAIN_MAX, MAIN_MIN } from '../lib/decks';
import { totalCopies } from '../lib/deckDraft';
import { deckStats } from '../lib/handtest';
import { ENCOUNTERS, type CampaignRun } from '../lib/play/campaign';
import { campaignCardAddReason, campaignCardFit, campaignCrew, campaignDeckIssues, campaignDeckSizeIssue, isCampaignLegend } from '../lib/play/campaignDeckRules';
import { latestPack } from '../lib/play/campaignPresentation';
import { hostileTakeoverSwaps } from '../lib/play/campaignRematch';
import { CampaignCrewCards, type CampaignInspect } from './CampaignHub';
import { CampaignRewardArt } from './CampaignRewardArt';
import './campaign-workbench.css';

type ReserveView = 'playable' | 'latest' | 'in-deck' | 'future' | 'legends';
const views: { id: ReserveView; label: string }[] = [
  { id: 'playable', label: 'Playable' },
  { id: 'latest', label: 'New Cards' },
  { id: 'in-deck', label: 'In Deck' },
  { id: 'future', label: 'Future Options' },
  { id: 'legends', label: 'Legends' },
];

type WorkbenchProps = {
  run: CampaignRun; titleRef: Ref<HTMLHeadingElement>; busy: boolean; error?: string; issues: string[]; canUndo: boolean;
  fromPack: boolean; packNew: boolean; acknowledgePack: () => void;
  printings: ReadonlyMap<string, Printing>; inspect: CampaignInspect;
  review: (slug: string, printingId?: string, swap?: boolean, outgoing?: string) => void;
  manage: (slot?: number, incoming?: string) => void;
  quantity: (slug: string, change: number) => Promise<boolean> | undefined;
  undo: () => void; restore: (onSaved: () => void) => void; back: () => void;
};

export function CampaignWorkbench({ run, titleRef, busy, error, issues: savedIssues, canUndo, fromPack, packNew, acknowledgePack,
  printings, inspect, review, manage, quantity, undo, restore, back }: WorkbenchProps) {
  const [view, setView] = useState<ReserveView>(fromPack ? 'latest' : 'playable');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('relevance');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [lastEdit, setLastEdit] = useState<{ slug: string; change: number; before: number; revision: number }>();
  const results = useRef<HTMLDivElement>(null);
  const crew = campaignCrew(run.deck.legends);
  const pending = busy && lastEdit?.revision === run.revision ? lastEdit : undefined;
  const cards = pending ? { ...run.deck.cards, [pending.slug]: pending.before + pending.change } : run.deck.cards;
  const issues = pending ? campaignDeckIssues(run, { ...run.deck, cards }) : savedIssues;
  const total = totalCopies(cards);
  const stats = deckStats(cards);
  const pack = new Map(latestPack(run).map(pull => [pull.slug, pull]));
  const owned = CARDS.filter(card => (run.inventory[card.slug] ?? 0) > 0 || (run.deck.cards[card.slug] ?? 0) > 0);
  const fit = new Map(owned.map(card => [card.slug, campaignCardFit(card, crew)]));
  const pools = {
    playable: owned.filter(card => !fit.get(card.slug)),
    latest: owned.filter(card => pack.has(card.slug)),
    'in-deck': owned.filter(card => (run.deck.cards[card.slug] ?? 0) > 0),
    future: owned.filter(card => card.type !== 'Legend' && fit.get(card.slug)),
    legends: owned.filter(card => card.type === 'Legend'),
  };
  const term = query.trim().toLowerCase();
  const visible = pools[view].filter(card => (!type || card.type === type)
    && (!term || `${card.display} ${card.color} ${card.type} ${card.keywords.join(' ')}`.toLowerCase().includes(term)))
    .sort((a, b) => {
      const priority = view === 'latest' ? Number(!!fit.get(a.slug)) - Number(!!fit.get(b.slug))
        : view === 'in-deck' ? Number(!!fit.get(b.slug)) - Number(!!fit.get(a.slug))
        : view === 'legends' ? Number(run.deck.legends.includes(b.slug)) - Number(run.deck.legends.includes(a.slug)) : 0;
      const latestFirst = sort === 'relevance' && view === 'playable' ? Number(pack.has(b.slug)) - Number(pack.has(a.slug)) : 0;
      return priority || latestFirst || (sort === 'name' ? 0 : (a.cost ?? 0) - (b.cost ?? 0)) || a.display.localeCompare(b.display);
    });
  const readiness = !issues.length ? 'Ready to play'
    : campaignDeckSizeIssue(total) ?? (issues.some(issue => issue.includes('RAM')) ? 'Over RAM limit' : 'Deck needs edits');
  const rematchSwaps = !issues.length && ENCOUNTERS[run.encounter]?.id === 'hostile-takeover' ? hostileTakeoverSwaps(run) : [];

  function selectView(next: ReserveView) {
    if (view === 'latest' && next !== 'latest' && packNew) acknowledgePack();
    setView(next);
    if ((next !== 'latest' && type === 'Legend') || next === 'legends') setType('');
    if (results.current) results.current.scrollTop = 0;
  }

  function changeQuantity(slug: string, change: number) {
    if (busy) return;
    const result = quantity(slug, change);
    if (!result) return;
    const edit = { slug, change, before: run.deck.cards[slug] ?? 0, revision: run.revision };
    setLastEdit(edit);
    void result.then(saved => { if (!saved) setLastEdit(current => current === edit ? undefined : current); });
  }

  function inventoryCard(card: Card) {
    const { slug } = card;
    const legend = card.type === 'Legend';
    const inDeck = legend ? Number(run.deck.legends.includes(slug)) : run.deck.cards[slug] ?? 0;
    const shown = legend ? inDeck : cards[slug] ?? 0;
    const earned = run.inventory[slug] ?? 0;
    const edited = lastEdit?.slug === slug && shown === lastEdit.before + lastEdit.change
      && run.revision <= lastEdit.revision + 1;
    const removeHint = busy ? 'Saving deck…' : !inDeck ? 'No copies in the deck' : undefined;
    const blocked = fit.get(slug);
    const reason = campaignCardAddReason(run, card, crew, total);
    const addHint = busy ? 'Saving deck…' : reason;
    const canSwap = total === MAIN_MAX && reason === `Deck is at ${MAIN_MAX} cards`;
    const printing = (view === 'latest' ? pack.get(slug)?.printing : undefined) ?? printings.get(slug);
    const matchingSlot = run.deck.legends.findIndex(item => BY_SLUG.get(item)?.name === card.name);
    const availableLegend = legend && !inDeck && isCampaignLegend(card);
    const printingId = (printing ?? defaultPrinting(card))?.id;
    const compare = () => review(slug, printingId, canSwap);
    const openCard = () => legend || blocked ? inspect(slug, printingId) : compare();
    const detailId = `campaign-quantity-limit-${slug}`;
    return <li key={slug} className="campaign-workbench-card" data-colour={card.color} data-edited={edited || undefined}>
      {packNew && pack.has(slug) && <span className="campaign-workbench-new">New</span>}
      <button type="button" className="campaign-workbench-card-art" aria-label={`${legend || blocked ? 'Inspect' : 'Compare'} ${card.display}`}
        aria-haspopup="dialog" onClick={openCard}>
        <CampaignRewardArt pull={{ slug, printing }} alt="" exact showNameWhileLoading />
      </button>
      <div className="campaign-workbench-card-data">
        <div className="campaign-workbench-card-info">
          <button type="button" className="campaign-workbench-card-name" onClick={openCard}>{card.display}</button>
          <p className="campaign-workbench-card-meta"><i aria-hidden="true" />{card.color} · {card.type}</p>
          <p>{!legend && `Cost ${card.cost ?? '—'} · `}RAM {card.ram ?? '—'}</p>
          {!legend && blocked && <p className="campaign-workbench-fit">{blocked}</p>}
          {canSwap && <button type="button" className="btn quiet campaign-workbench-card-action" disabled={busy}
            aria-label={`Swap a card for ${card.display}`} onClick={compare}>Swap a card</button>}
          {blocked && view === 'future' && !blocked.startsWith('Unavailable') && <button type="button" className="campaign-workbench-text-button"
            onClick={() => selectView('legends')}>Manage Legends</button>}
        </div>
        <div className="campaign-workbench-card-footer">
          {legend ? <>
            <small>{inDeck ? 'Equipped' : isCampaignLegend(card) ? 'In reserve' : 'Unavailable in Campaign'}</small>
            {availableLegend && <button type="button" className="btn quiet campaign-workbench-card-action" disabled={busy}
              onClick={() => manage(Math.max(0, matchingSlot), slug)}>Recruit</button>}
          </> : <>
            <p className="campaign-workbench-count">In deck <b>{shown}</b><span aria-hidden="true"> / </span>Owned <b>{earned}</b></p>
            {(!blocked || (inDeck > 0 && view === 'in-deck')) && <div className="campaign-workbench-quantity" role="group" aria-label={`Copies of ${card.display}`}>
              <button type="button" aria-label={`Remove ${card.display}`} aria-disabled={!!removeHint}
                aria-describedby={removeHint ? `${detailId}-remove` : undefined} onClick={() => { if (!removeHint) changeQuantity(slug, -1); }}>
                −{removeHint && <span id={`${detailId}-remove`} className="campaign-workbench-quantity-hint">{removeHint}</span>}
              </button>
              <b key={shown} data-changed={edited || undefined}>{shown}</b>
              {!blocked && <button type="button" aria-label={`Add ${card.display}`} aria-disabled={!!addHint}
                aria-describedby={addHint ? `${detailId}-add` : undefined} onClick={() => { if (!addHint) changeQuantity(slug, 1); }}>
                +{addHint && <span id={`${detailId}-add`} className="campaign-workbench-quantity-hint">{addHint}</span>}
              </button>}
            </div>}
          </>}
        </div>
      </div>
    </li>;
  }

  const empty = view === 'latest' && !pack.size ? 'Open a campaign pack to see your latest pulls here.'
    : view === 'future' && !pools.future.length ? 'Every owned main-deck card fits your current crew.'
    : 'No cards match these filters.';

  return <section className="campaign-workbench" aria-labelledby="campaign-workbench-title">
    <header className="campaign-workbench-head">
      <div><p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> Campaign</p>
        <h1 id="campaign-workbench-title" tabIndex={-1} ref={titleRef}>Deck Workbench<span aria-hidden="true">.</span></h1></div>
      <button type="button" className="btn quiet" disabled={busy} onClick={() => { if (view === 'latest' && packNew) acknowledgePack(); back(); }}>← Back to contract</button>
    </header>
    <div className="campaign-workbench-mobile-status">
      <strong>{total} cards</strong>
      <span data-invalid={!!issues.length || undefined} role="status">{readiness}</span>
      <button type="button" className="btn quiet" disabled={busy} onClick={() => manage()}>Manage Legends</button>
    </div>
    <div className="campaign-workbench-layout">
      <aside className="campaign-workbench-deck" aria-label="Current campaign deck">
        <div className="campaign-workbench-deck-heading">
          <p className="play-eyebrow">Current deck</p>
          <span className="campaign-workbench-readiness" data-invalid={!!issues.length || undefined} role="status"><span key={readiness}>{readiness}</span></span>
          <h2>{run.deck.name}</h2>
        </div>
        <CampaignCrewCards deck={run.deck} printings={printings} inspect={inspect} label="Equipped Legends" />
        <div className="campaign-workbench-capacity" aria-label="Main-deck capacity">
          <strong><span key={total} data-changed={lastEdit && run.revision <= lastEdit.revision + 1 || undefined}>{total}</span> <small>cards</small></strong>
          <div><small>Legal range</small><b>{MAIN_MIN}–{MAIN_MAX}</b></div>
        </div>
        <div className="campaign-workbench-ram">
          <span>RAM by colour</span>
          <ul aria-label="Crew RAM">{crew.colours.map(colour => <li key={colour} data-colour={colour}><i aria-hidden="true" />{colour} <b>{crew.ram[colour] ?? 0}</b></li>)}</ul>
        </div>
        {!!issues.length && <details className="campaign-workbench-issues"><summary>Deck issues</summary><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
        <details className="campaign-workbench-stats"><summary>Deck stats</summary><div>
          <span><b>{stats.avgCost.toFixed(1)}</b> Avg cost</span><span><b>{stats.units}</b> Units</span><span><b>{stats.sellable}</b> Sellable</span>
        </div></details>
        <button type="button" className="btn quiet campaign-workbench-manage" disabled={busy} onClick={() => manage()}>⇄ Manage Legends</button>
        <div className="campaign-workshop-actions">
          <button type="button" className="btn quiet" disabled={!canUndo || busy} onClick={undo}>Undo</button>
          <button type="button" className="btn quiet" disabled={busy || !issues.length} onClick={() => setRestoreOpen(true)}>Restore legal deck</button>
        </div>
        <p className="campaign-workbench-save" role="status">{busy ? 'Saving deck…' : error ? 'Save needs attention' : 'Saved in this browser'}</p>
      </aside>
      <section className="campaign-workbench-reserve" aria-label="Campaign reserve">
        {rematchSwaps.length > 0 && <section className="campaign-rematch-swaps" aria-labelledby="campaign-rematch-swaps-title">
          <h2 id="campaign-rematch-swaps-title">Swaps for the rematch</h2>
          {rematchSwaps.map(({ incoming, outgoing, reason }) => <div key={incoming}>
            <p><strong>{BY_SLUG.get(incoming)?.display}</strong> for {BY_SLUG.get(outgoing)?.display}<small>{reason}</small></p>
            <button type="button" className="btn quiet" disabled={busy} aria-label={`Review swap for ${BY_SLUG.get(incoming)?.display}`}
              onClick={() => review(incoming, pack.get(incoming)?.printing?.id, true, outgoing)}>Review swap</button>
          </div>)}
        </section>}
        <header className="campaign-workbench-reserve-head">
          <div className="campaign-workbench-filters" aria-label="Reserve views">{views.map(item => {
            const count = pools[item.id].length;
            return <button type="button" key={item.id} className="btn quiet" aria-pressed={view === item.id} onClick={() => selectView(item.id)}>
              {item.label} <span>({count})</span>{item.id === 'latest' && packNew && <i aria-label="Unreviewed cards" />}
            </button>;
          })}</div>
          <div className="campaign-workbench-search">
            <label className="campaign-workbench-search-field"><span className="sr-only">Search reserve</span><input type="search" value={query}
              onChange={event => { setQuery(event.target.value); if (results.current) results.current.scrollTop = 0; }} placeholder="Search cards…" /></label>
            {view !== 'legends' && <label><span className="sr-only">Card type</span><select value={type} onChange={event => { setType(event.target.value); if (results.current) results.current.scrollTop = 0; }}>
              <option value="">All types</option><option>Unit</option><option>Gear</option><option>Program</option>{view === 'latest' && <option>Legend</option>}
            </select></label>}
            <label><span className="sr-only">Sort cards</span><select value={sort} onChange={event => { setSort(event.target.value); if (results.current) results.current.scrollTop = 0; }}>
              <option value="relevance">Sort: Relevance</option><option value="cost">Sort: Cost</option><option value="name">Sort: Name</option>
            </select></label>
            <span className="sr-only" role="status">{visible.length} results</span>
          </div>
        </header>
        <div className="campaign-workbench-results" ref={results} tabIndex={0} role="region" aria-label="Reserve results">
          {visible.length ? <ul className="campaign-workbench-cards">{visible.map(inventoryCard)}</ul> : <p>{empty}</p>}
        </div>
      </section>
    </div>
    <ConfirmDialog open={restoreOpen} busy={busy} title="Restore your last legal deck?" confirmLabel="Restore legal deck"
      onCancel={() => setRestoreOpen(false)} onConfirm={() => restore(() => setRestoreOpen(false))}>
      <p>Restore {totalCopies(run.lastLegal.cards)} cards and the crew you last saved as legal.</p>
      <p>{run.lastLegal.legends.map(slug => BY_SLUG.get(slug)?.display).join(' · ')}</p>
      {error && <p className="play-error" role="alert">{error}</p>}
    </ConfirmDialog>
  </section>;
}
