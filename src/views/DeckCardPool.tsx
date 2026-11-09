import { useMemo, useState, type RefObject } from 'react';
import { CardImg, Pip } from '../components/bits';
import { COLORS, TYPES, fitsRam, searchCards, type Card, type CardType } from '../lib/data';
import type { DeckZone } from '../lib/deckDraft';
import { COPY_MAX } from '../lib/decks';
import type { Deck } from '../lib/store';

interface Props {
  mobile: boolean;
  deck: Deck;
  owned: Map<string, number>;
  ownershipReady: boolean;
  limits: Record<string, number>;
  zone: DeckZone;
  setZone: (zone: DeckZone) => void;
  pickingLegend: boolean;
  browse: () => void;
  onOpen: (slug: string) => void;
  onAdd: (card: Card, zone: DeckZone) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function DeckCardPool({ mobile, deck, owned, ownershipReady, limits, zone, setZone, pickingLegend, browse, onOpen, onAdd, searchRef }: Props) {
  const [q, setQ] = useState('');
  const [legendQuery, setLegendQuery] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [type, setType] = useState<CardType | ''>('');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [fitsOnly, setFitsOnly] = useState(true);
  const search = pickingLegend ? legendQuery : q;

  const pool = useMemo(() => {
    const activeType = pickingLegend ? 'Legend' : type;
    return searchCards(search).filter((card) => card.legal === 'legal' && card.text
      && (!activeType || card.type === activeType)
      && (pickingLegend || !colors.length || colors.includes(card.color))
      && (!ownershipReady || !ownedOnly || owned.has(card.slug))
      && (!fitsOnly || !deck.legends.length || fitsRam(card, limits)))
      .sort((a, b) => {
        const legends = Number(b.type === 'Legend') - Number(a.type === 'Legend');
        return (deck.legends.length >= 3 ? -legends : legends) || (a.cost ?? 0) - (b.cost ?? 0) || a.display.localeCompare(b.display);
      });
  }, [search, pickingLegend, type, colors, ownershipReady, ownedOnly, owned, fitsOnly, deck.legends.length, limits]);

  const filters = (
    <>
      {!pickingLegend && (
        <div className="chips workbench-filters" role="group" aria-label="Card type">
          <button type="button" className="chip" aria-pressed={!type} onClick={() => setType('')}>All types</button>
          {(['Legend', ...TYPES.filter((item) => item !== 'Legend')] as CardType[]).map((item) => (
            <button type="button" className="chip" key={item} aria-pressed={type === item} onClick={() => setType(item)}>{item === 'Gear' ? item : `${item}s`}</button>
          ))}
        </div>
      )}
      <div className="workbench-pool-options">
        {!pickingLegend && <div className="chips" role="group" aria-label="Card colours">
          {COLORS.map((color) => <button type="button" key={color} className={`chip c-${color}${colors.includes(color) ? ' on' : ''}`}
            aria-pressed={colors.includes(color)} onClick={() => setColors((active) => active.includes(color) ? active.filter((item) => item !== color) : [...active, color])}>
            {color}</button>)}
        </div>}
        <label className="toggle"><input type="checkbox" checked={ownedOnly} disabled={!ownershipReady} onChange={(event) => setOwnedOnly(event.target.checked)} />Owned only</label>
        {!pickingLegend && <label className="toggle"><input type="checkbox" checked={fitsOnly} onChange={(event) => setFitsOnly(event.target.checked)} />Fits RAM</label>}
      </div>
    </>
  );
  const filterSummary = [type, colors.length ? `${colors.length} ${colors.length === 1 ? 'colour' : 'colours'}` : '',
    ownershipReady && ownedOnly ? 'Owned only' : '', fitsOnly && deck.legends.length ? 'Fits RAM' : ''].filter(Boolean).join(' · ');

  return (
    <section className="panel workbench-pool" id="workbench-pool" aria-labelledby="workbench-pool-title">
      <div className="workbench-section-head">
        <h2 id="workbench-pool-title">Card pool</h2>
        {pickingLegend && <span className="workbench-ticket">Choose a Legend</span>}
        <span className="workbench-card-count">{pool.length} {pool.length === 1 ? 'card' : 'cards'}</span>
      </div>
      <div className="workbench-search">
        <input ref={searchRef} className="input search" aria-label={pickingLegend ? 'Search Legends' : 'Search cards'}
          placeholder={pickingLegend ? 'Search Legends…' : 'Search cards…'} value={search}
          onChange={(event) => (pickingLegend ? setLegendQuery : setQ)(event.target.value)} />
        {pickingLegend && <button type="button" className="btn quiet" onClick={browse}>Browse cards</button>}
      </div>
      {mobile && !pickingLegend ? (
        <details className="workbench-pool-filter-toggle">
          <summary>Pool filters{filterSummary && <small>{filterSummary}</small>}</summary>
          {filters}
        </details>
      ) : filters}
      {!pickingLegend && (
        <div className="workbench-destination" role="group" aria-label="Pool add destination">
          <span>Add cards to</span>
          <button type="button" className="chip" aria-pressed={zone === 'cards'} onClick={() => setZone('cards')}>Main</button>
          <button type="button" className="chip" aria-pressed={zone === 'sideboard'} onClick={() => setZone('sideboard')}>Sideboard</button>
        </div>
      )}

      {pool.length === 0 ? <p className="workbench-empty">No cards match these filters. Try another search or clear a filter.</p> : (
        <ul className="workbench-cards">
          {pool.map((card, index) => {
            const legend = card.type === 'Legend';
            const inDeck = legend ? Number(deck.legends.includes(card.slug)) : (deck.cards[card.slug] ?? 0) + (deck.sideboard[card.slug] ?? 0);
            const have = owned.get(card.slug) ?? 0;
            const ramBad = !!deck.legends.length && !fitsRam(card, limits);
            const label = legend ? 'Crew' : zone === 'cards' ? 'Main' : 'Sideboard';
            const addBlock = legend ? (inDeck ? 'In crew' : deck.legends.length >= 3 ? 'Crew full' : '') : (inDeck >= COPY_MAX ? 'Copy limit' : '');
            return (
              <li className={`workbench-card${inDeck ? ' in-deck' : ''}`} key={card.slug}>
                <div className="workbench-card-art">
                  <CardImg slug={card.slug} alt="" priority={index < 4} />
                  {inDeck > 0 && <span>{legend ? 'In crew' : `${inDeck} in deck`}</span>}
                </div>
                <div className="workbench-card-name"><Pip color={card.color} bare /><span><strong>{card.name}</strong>{card.sub && <small>{card.sub}</small>}</span></div>
                <div className="workbench-card-meta">
                  <span>{ownershipReady ? `Owned ${have}` : 'Ownership pending'}</span>
                  {ramBad && <span className="danger-text">Needs {card.color} RAM {card.ram}</span>}
                </div>
                <div className="workbench-card-actions">
                  <button type="button" className="btn quiet sm" aria-label={`Details for ${card.display}`} onClick={() => onOpen(card.slug)}>Details</button>
                  <button type="button" className="btn ghost sm" aria-label={`Add ${card.display} to ${label}`} disabled={!!addBlock}
                    onClick={() => onAdd(card, zone)}>{addBlock || `+ ${label}`}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
