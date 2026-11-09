import { Bars, CardImg, Pip } from '../components/bits';
import { BY_SLUG, COLORS, TYPES, printingLabel, type Card } from '../lib/data';
import { money, estimateText, moneyOr } from '../lib/currency';
import { COPY_MAX, type PurchaseEstimate, type validate } from '../lib/decks';
import { deckStats } from '../lib/handtest';
import type { DeckZone } from '../lib/deckDraft';
import type { Deck } from '../lib/store';

type Validation = ReturnType<typeof validate>;
const sortedRows = (cards: Record<string, number>) => Object.entries(cards).sort(([a], [b]) =>
  (BY_SLUG.get(a)?.cost ?? 0) - (BY_SLUG.get(b)?.cost ?? 0) || (BY_SLUG.get(a)?.display ?? a).localeCompare(BY_SLUG.get(b)?.display ?? b));

interface ListProps {
  deck: Deck;
  checks: Validation;
  missing?: PurchaseEstimate;
  onChooseLegend: () => void;
  onLoad: () => void;
  onOpen: (slug: string) => void;
  onAdd: (card: Card, zone: DeckZone) => void;
  onRemove: (slug: string, zone: DeckZone) => void;
  onRemoveLegend: (index: number) => void;
}

export function DeckWorkbenchList({ deck, checks, missing, onChooseLegend, onLoad, onOpen, onAdd, onRemove, onRemoveLegend }: ListProps) {
  const main = sortedRows(deck.cards);
  const side = sortedRows(deck.sideboard);
  const missingBySlug = new Map(missing?.lines.map((line) => [line.slug, line.buy]));

  const row = ([slug, qty]: [string, number], zone: DeckZone) => {
    const card = BY_SLUG.get(slug);
    const count = (deck.cards[slug] ?? 0) + (deck.sideboard[slug] ?? 0);
    const section = zone === 'cards' ? 'Main' : 'Sideboard';
    const badRam = card && checks.ramBad.includes(slug);
    const missingCopies = missingBySlug.get(slug);
    return (
      <li key={slug} className="workbench-list-row" data-issue={!card || badRam || checks.overCopies.includes(slug)}>
        <span className="workbench-list-cost">{card?.cost ?? '—'}</span>
        <div className="workbench-list-name">
          {card ? <button type="button" className="link" onClick={() => onOpen(slug)}>{card.display}</button> : <span>{slug}</span>}
          {badRam && <small className="danger-text">Needs {card.color} RAM {card.ram} · {checks.lim[card.color] ?? 0} available</small>}
          {checks.overCopies.includes(slug) && <small className="danger-text">{count} copies across the list · limit {COPY_MAX}</small>}
          {!card && <small className="danger-text">Card data unavailable</small>}
          {!!missingCopies && (zone === 'cards' || !deck.cards[slug]) && <small>Need {missingCopies} {missingCopies === 1 ? 'copy' : 'copies'} for the full list</small>}
        </div>
        <span className="workbench-qty">
          <button type="button" className="iconbtn minus" aria-label={`Remove ${card?.display ?? slug} from ${section}`} onClick={() => onRemove(slug, zone)}>−</button>
          <b>{qty}</b>
          <button type="button" className="iconbtn" disabled={!card || count >= COPY_MAX}
            aria-label={`Add ${card?.display ?? slug} to ${section} from list`} onClick={() => { if (card) onAdd(card, zone); }}>+</button>
        </span>
      </li>
    );
  };

  return (
    <div className="workbench-list">
      <section className="panel workbench-crew" aria-labelledby="workbench-crew-title">
        <div className="workbench-section-head">
          <h3 id="workbench-crew-title">Legend crew</h3>
          <span className="workbench-card-count">{deck.legends.length} / 3</span>
        </div>
        <div className="workbench-crew-slots">
          {Array.from({ length: Math.max(3, deck.legends.length) }, (_, index) => {
            const slug = deck.legends[index];
            const card = slug ? BY_SLUG.get(slug) : undefined;
            return slug ? (
              <div className="workbench-crew-slot" key={index}>
                {card && <button type="button" className="workbench-crew-art" aria-label={`Details for ${card.display}`} onClick={() => onOpen(slug)}><CardImg slug={slug} alt="" /></button>}
                <div className="workbench-crew-name"><b>{card?.name ?? slug}</b>{card?.sub && <small>{card.sub}</small>}
                  {card && <small className="workbench-crew-ram"><Pip color={card.color} bare /> {card.color} RAM {card.ram ?? 0}</small>}
                </div>
                <button type="button" className="iconbtn minus" aria-label={`Remove ${card?.display ?? slug} from crew`} onClick={() => onRemoveLegend(index)}>×</button>
              </div>
            ) : <button key={index} type="button" className="workbench-crew-empty" aria-label={`Choose Legend for slot ${index + 1}`} onClick={onChooseLegend}>+ Choose Legend</button>;
          })}
        </div>
        {deck.legends.length > 0 ? <div className="workbench-ram" aria-label="Crew RAM totals">
          {COLORS.map((color) => <span key={color} className={`pip ${color}`}>{color} RAM {checks.lim[color] ?? 0}</span>)}
        </div> : (
          <div className="workbench-start">
            <p>Your Legends set which colours and RAM your deck can use.</p>
            <p>Pick three different Legends, then add 40–50 main-deck cards.</p>
            <button type="button" className="linklike" onClick={onLoad}>Load a recommended deck</button>
          </div>
        )}
      </section>
      <details className="panel workbench-zone" open>
        <summary><span>Main deck</span> <b>{checks.n}</b><small>40–50 cards</small></summary>
        {main.length ? TYPES.filter((type) => type !== 'Legend').map((type) => {
          const cards = main.filter(([slug]) => BY_SLUG.get(slug)?.type === type);
          return cards.length ? <div className="workbench-list-group" key={type}><h4>{type === 'Gear' ? type : `${type}s`} · {cards.reduce((sum, [, qty]) => sum + qty, 0)}</h4>
            <ul>{cards.map((item) => row(item, 'cards'))}</ul></div> : null;
        }) : <p className="workbench-empty">No main-deck cards yet.</p>}
        {main.some(([slug]) => !BY_SLUG.has(slug) || BY_SLUG.get(slug)?.type === 'Legend') && <ul>{main.filter(([slug]) => !BY_SLUG.has(slug) || BY_SLUG.get(slug)?.type === 'Legend').map((item) => row(item, 'cards'))}</ul>}
      </details>
      <details className="panel workbench-zone" open>
        <summary><span>Sideboard</span> <b>{checks.side} / 7</b><small>Optional for best-of-three</small></summary>
        {side.length ? <ul>{side.map((item) => row(item, 'sideboard'))}</ul> : <p className="workbench-empty">No sideboard cards yet. Choose Sideboard in the card pool to add one.</p>}
      </details>
    </div>
  );
}

export function DeckWorkbenchChecks({ deck, checks }: { deck: Deck; checks: Validation }) {
  const stats = deckStats(deck.cards);
  return (
    <section className="panel workbench-review">
      <h3 tabIndex={-1} id="workbench-checks-title">Deck checks</h3>
      <ul className="checks">
        {checks.issues.map((issue) => <li key={issue} className="bad">{issue}</li>)}
        {checks.passes.map((pass) => <li key={pass}>{pass}</li>)}
      </ul>
      {stats.n > 0 && <div className="workbench-deck-shape">
        <h4>Deck shape</h4>
        <div className="stat-line">Units <b>{stats.units}</b> · Gear <b>{stats.gear}</b> · Programs <b>{stats.programs}</b></div>
        <div className="stat-line">Sellable <b>{stats.sellable}</b> · Avg cost <b>{stats.avgCost.toFixed(2)}</b></div>
        {stats.sellable < 18 && <p className="tiny muted">Low on sellable cards. Most lists run 20 or more for a steady supply of Eddies.</p>}
        <h4>Cost curve</h4>
        <Bars data={stats.curve} />
      </div>}
    </section>
  );
}

export function DeckWorkbenchMissing({ empty, missing, fromScratch, mainOnly, hasSide, collectionError, retryCollection, onOpen, copy }: {
  empty: boolean; missing?: PurchaseEstimate; fromScratch: PurchaseEstimate; mainOnly?: PurchaseEstimate; hasSide: boolean;
  collectionError: string | null; retryCollection: () => void; onOpen: (slug: string) => void; copy: (text: string, label: string) => void;
}) {
  return (
    <section className="panel workbench-review">
      <h3 tabIndex={-1} id="workbench-missing-title">Missing cards</h3>
      {empty ? <p className="muted">Add cards to compare this deck with your vault.</p> : !missing ? (
        <div role={collectionError ? 'alert' : 'status'}>
          <p>{collectionError ? 'Couldn’t load your vault.' : 'Checking what you own…'}</p>
          {collectionError && <button type="button" className="btn quiet" onClick={retryCollection}>Try again</button>}
        </div>
      ) : (
        <>
          <div className="workbench-missing-summary">
            <span>{missing.copies ? `${missing.copies} missing ${missing.copies === 1 ? 'copy' : 'copies'}` : 'Fully owned'}</span>
            <strong>{missing.copies ? estimateText(missing) : 'Nothing to buy'}</strong>
          </div>
          <p className="tiny muted">Estimate for {hasSide ? 'Legends, main deck and sideboard' : 'Legends and main deck'} · Before shipping and tax</p>
          {hasSide && mainOnly && <p className="tiny muted">Legends + main deck only · {estimateText(mainOnly)}</p>}
          <p className="tiny muted">Whole list from scratch · {estimateText(fromScratch)}</p>
          {missing.lines.length > 0 && (
            <>
              <ul className="workbench-shopping">
                {missing.lines.map(({ slug, buy, quote }) => (
                  <li key={slug} title={quote ? `Quoted on ${printingLabel(quote.printingId, false)} (${quote.basis})` : 'No price available for this card'}>
                    <b>{buy}×</b>
                    {BY_SLUG.has(slug) ? <button type="button" className="link" onClick={() => onOpen(slug)}>{BY_SLUG.get(slug)?.display}</button> : <span>{slug}</span>}
                    <span>{moneyOr(quote?.cad)}{quote ? ' ea' : ''}</span>
                    <strong>{quote ? money(quote.cad * buy) : 'Unpriced'}</strong>
                  </li>
                ))}
              </ul>
              <div className="row workbench-shopping-actions">
                <button type="button" className="btn sm" onClick={() => copy(missing.lines.map(({ slug, buy }) => {
                  const card = BY_SLUG.get(slug);
                  return `${buy} ${card?.name ?? slug}${card?.sub ? ` - ${card.sub}` : ''}`;
                }).join('\n'), 'Shopping list')}>Copy shopping list</button>
                <a className="btn sm quiet" href="https://www.tcgplayer.com/massentry?productline=Cyberpunk%20TCG" target="_blank" rel="noreferrer">Open TCGplayer Mass Entry ↗</a>
              </div>
              <p className="tiny muted">Paste the copied list into TCGplayer Mass Entry.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
