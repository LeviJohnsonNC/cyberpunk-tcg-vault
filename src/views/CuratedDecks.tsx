import { useMemo, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG, COLORS, RECOMMENDED, type Color } from '../lib/data';
import { estimateText } from '../lib/currency';
import { CLOSE_THRESHOLD, completion, deckFromRecommended, costRank, matchesFilter, validate, type BuildFilter } from '../lib/decks';
import { useStore, type Deck } from '../lib/store';
import communityMeta from '../data/community-meta.json';

const KIND_LABEL = { budget: 'Budget', meta: 'Community meta', brew: 'Brew' } as const;
const LS_KEY = 'cptv.meta.filters.v1';
const BUILD_LABEL: Record<BuildFilter, string> = { all: 'All decks', close: `${CLOSE_THRESHOLD}%+ owned`, owned: 'Fully owned' };
const SORTS = [
  { value: 'fit', label: 'Best fit for my vault' },
  { value: 'cost', label: 'Cheapest to finish' },
  { value: 'popularity', label: 'Meta popularity' },
  { value: 'name', label: 'Name' },
] as const;

type SortKey = (typeof SORTS)[number]['value'];
interface Filters {
  build: BuildFilter;
  colors: Color[];
  sort: SortKey;
}

const DEFAULTS: Filters = { build: 'all', colors: [], sort: 'fit' };
const crewCounts: Readonly<Record<string, number>> = communityMeta.crews;
const LISTS = RECOMMENDED.map((deck) => ({
  deck,
  legal: validate({ ...deck, sideboard: {} }).legal,
  crewMatches: crewCounts[[...deck.legends].sort().join('/')] ?? 0,
}));
const deckCount = new Intl.NumberFormat('en-CA').format(communityMeta.deckCount);
const asOf = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(communityMeta.asOf));
const needsVault = (sort: SortKey) => sort === 'fit' || sort === 'cost';

function loadFilters(): Filters {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return {
      build: saved?.build === 'close' || saved?.build === 'owned' ? saved.build : DEFAULTS.build,
      colors: Array.isArray(saved?.colors) ? COLORS.filter((color) => saved.colors.includes(color)) : [],
      sort: SORTS.find(({ value }) => value === saved?.sort)?.value ?? DEFAULTS.sort,
    };
  } catch {
    return DEFAULTS;
  }
}

export function CuratedDecks({ onOpen, openInBuilder, onPlayAgainst }: { onOpen: (slug: string) => void; openInBuilder: (id: string) => void; onPlayAgainst?: (deck: Deck) => void }) {
  const { owned, collectionReady, collectionError, retryCollection } = useStore();
  const [f, setF] = useState<Filters>(loadFilters);
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* Filters still apply for this visit. */
    }
  };

  const scored = useMemo(() => LISTS.map((item) => ({ ...item, fit: collectionReady ? completion(item.deck, owned) : null })), [collectionReady, owned]);
  const sort = !collectionReady && needsVault(f.sort) ? 'name' : f.sort;
  const shown = scored
    .filter(({ deck, fit }) => (!fit || matchesFilter(fit, f.build)) && (!f.colors.length || deck.colors.some((color) => f.colors.includes(color))))
    .sort((a, b) => {
      const byName = a.deck.name.localeCompare(b.deck.name);
      if (sort === 'popularity') return b.crewMatches - a.crewMatches || byName;
      if (sort === 'name' || !a.fit || !b.fit) return byName;
      const fit = b.fit.pct - a.fit.pct;
      const cost = costRank(a.fit.estimate) - costRank(b.fit.estimate);
      return sort === 'cost' ? cost || fit : fit || cost;
    });
  const closest = scored.reduce<(typeof scored)[number] | undefined>((best, item) =>
    item.fit && (!best?.fit || item.fit.pct > best.fit.pct) ? item : best, undefined);

  return (
    <section aria-labelledby="meta-curated-title">
      <header className="meta-section-head">
        <h2 id="meta-curated-title">Curated decks</h2>
        <p>See what you own and what it would cost to finish a list.</p>
      </header>
      {!collectionReady && (
        <div className="callout meta-curated-status" role={collectionError ? 'alert' : 'status'}>
          {collectionError ? <>Couldn’t load your vault. You can still browse all curated decks. <button className="linklike" onClick={retryCollection}>Try again</button></>
            : 'Loading your vault for ownership and cost estimates. You can browse the lists now.'}
        </div>
      )}
      <div className="meta-curated-filters">
        <div className="meta-option">
          <span className="meta-control-label" id="meta-status-label">Copies owned</span>
          <div className="chips" role="group" aria-labelledby="meta-status-label">
            {(['all', 'close', 'owned'] as const).map((status) => (
              <button key={status} type="button" className="chip" aria-pressed={(collectionReady ? f.build : 'all') === status}
                disabled={!collectionReady} onClick={() => set({ build: status })}>{BUILD_LABEL[status]}</button>
            ))}
          </div>
        </div>
        <div className="meta-option">
          <span className="meta-control-label" id="meta-colors-label">Includes any selected colour</span>
          <div className="chips" role="group" aria-labelledby="meta-colors-label">
            {COLORS.map((color) => (
              <button key={color} type="button" className={`chip c-${color}${f.colors.includes(color) ? ' on' : ''}`} aria-pressed={f.colors.includes(color)}
                onClick={() => set({ colors: f.colors.includes(color) ? f.colors.filter((c) => c !== color) : [...f.colors, color] })}>{color}</button>
            ))}
          </div>
        </div>
        <div className="meta-option meta-curated-sort">
          <label className="meta-control-label" htmlFor="meta-sort">Sort by</label>
          <VaultSelect id="meta-sort" value={sort} onValueChange={(value) => set({ sort: value as SortKey })}
            options={SORTS.map((option) => ({ ...option, disabled: !collectionReady && needsVault(option.value) }))} />
        </div>
      </div>
      <p className="meta-list-count" role="status">{shown.length} of {LISTS.length} decks</p>
      {sort === 'popularity' && <p className="meta-popularity-source">
        Ranked by how often all three Legends appear together in {deckCount} public Constructed decks from the 30 days ending {asOf}.
      </p>}
      {shown.length === 0 ? (
        <div className="panel meta-state">
          <h3>No deck matches these filters</h3>
          <p>{collectionReady && !owned.size ? 'Your vault is empty. Show all decks to explore the lists.' : closest?.fit
            ? `Closest overall is ${closest.deck.name} at ${closest.fit.pct}% owned. Cost to finish: ${estimateText(closest.fit.estimate)}.`
            : 'Try another colour or show all decks.'}</p>
          <button className="btn quiet" onClick={() => set({ build: 'all', colors: [] })}>Show all decks</button>
        </div>
      ) : (
        <div className="meta-curated-list">
          {shown.map(({ deck: d, legal, fit, crewMatches }) => {
            const base = d.base ? RECOMMENDED.find((item) => item.id === d.base)?.name : null;
            return (
              <article key={d.id} className="meta-curated-card panel" aria-labelledby={`deck-${d.id}`}>
                <div className="meta-curated-main">
                  <div className="meta-curated-art" aria-label="Legend cards">
                    {d.legends.map((slug) => <button key={slug} type="button" title={BY_SLUG.get(slug)?.display}
                      aria-label={`Open ${BY_SLUG.get(slug)?.display}`} onClick={() => onOpen(slug)}><CardImg slug={slug} alt="" /></button>)}
                  </div>
                  <div className="meta-curated-identity">
                    <div className="meta-category">{KIND_LABEL[d.kind]} <span>·</span> {d.archetype}</div>
                    <h3 id={`deck-${d.id}`}>{d.name}</h3>
                    <div className="meta-deck-colours"><span aria-hidden="true">{d.colors.map((color) => <Pip key={color} color={color} bare />)}</span> {d.colors.join(' / ')}</div>
                    {sort === 'popularity' && <p className="meta-popularity-count">{crewMatches} public {crewMatches === 1 ? 'deck' : 'decks'} with this crew</p>}
                    <p className="meta-curated-hook">{d.summary}</p>
                  </div>
                  <dl className="meta-curated-fit">
                    <div>
                      <dt>Copies owned</dt>
                      <dd>{fit ? <><b>{fit.have}/{fit.total}</b> <span>({fit.pct}%)</span></> : 'Unavailable'}</dd>
                      {fit && <div className="track" aria-hidden="true"><div className={fit.have === fit.total ? 'done' : ''} style={{ width: `${fit.pct}%` }} /></div>}
                    </div>
                    <div><dt>Cost to finish</dt><dd className={fit?.estimate.copies === 0 ? 'good' : undefined}>{fit ? estimateText(fit.estimate) : 'Unavailable'}</dd></div>
                  </dl>
                  <div className="meta-curated-action">
                    <button className="btn meta-open-draft" onClick={() => openInBuilder(d.id)}>Open draft<span> in Deck Builder</span></button>
                    <p>Edit and save in Deck Builder.</p>
                    {onPlayAgainst && <button className="btn quiet" onClick={() => { const deck = deckFromRecommended(d.id); if (deck) onPlayAgainst(deck); }}>Play against this deck</button>}
                  </div>
                </div>
                <div className="meta-curated-detail-row">
                  <details className="meta-disclosure meta-curated-details">
                    <summary>Game plan</summary>
                    <div className="meta-game-plan">
                      <div>
                        <p>{d.summary}</p>
                        <h4>Game plan</h4>
                        <ol>{d.plan.map((line, index) => <li key={index}>{line}</li>)}</ol>
                        <h4>Key cards</h4>
                        <ul>{d.keyCards.map((card) => (
                          <li key={card.slug}><button className="linklike" type="button" onClick={() => onOpen(card.slug)}>{BY_SLUG.get(card.slug)?.display}</button> · {card.why}</li>
                        ))}</ul>
                      </div>
                      <div>
                        <h4>Mulligan</h4><p>{d.mulligan}</p>
                        <h4>Weak spots</h4><p>{d.weaknesses}</p>
                        <h4>Source</h4><p>{d.source}</p>
                        <p><b>Editorial confidence</b> · {d.confidence}</p>
                        {base && <p><b>Upgrade of</b> · {base}</p>}
                      </div>
                    </div>
                  </details>
                  <span className={`badge meta-legal ${legal ? 'ok' : 'low'}`}>{legal ? 'Legal deck' : 'Check legality'}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
