import { useMemo, useRef, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { IntakeIcon } from '../components/IntakeIcon';
import { PrintingArt } from '../components/PrintingArt';
import { VaultSelect } from '../components/VaultSelect';
import { money } from '../lib/currency';
import { BY_SLUG, isUnspecified, MAX_PRINTING_COPIES, printingLabel, unspecifiedId, valueHolding } from '../lib/data';
import { searchIntake } from '../lib/intake';
import { useStore } from '../lib/store';

export function CardSearchIntake({ onOpen }: { onOpen: (slug: string, printingId?: string, identify?: boolean) => void }) {
  const { collectionReady, entries, quantityPending, setQty } = useStore();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [highlight, setHighlight] = useState(-1);
  const [selection, setSelection] = useState<{ slug: string; printingId: string }>();
  const [qty, setQtyInput] = useState('1');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const queryInput = useRef<HTMLInputElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const matches = useMemo(() => searchIntake(query), [query]);
  const results = matches.slice(0, 30);
  const showResults = expanded && results.length > 0;
  const card = selection && BY_SLUG.get(selection.slug);
  const pid = selection?.printingId ?? '';
  const unspecified = isUnspecified(pid);
  const price = pid && valueHolding(pid);
  const current = entries.find((entry) => entry.printingId === pid)?.qty ?? 0;
  const limit = Math.max(0, Math.min(99, MAX_PRINTING_COPIES - current));
  const copies = Number(qty);
  const validQty = Number.isInteger(copies) && copies >= 1 && copies <= limit;

  const select = ({ card, printingId }: (typeof results)[number]) => {
    if (locked.current) return;
    setSelection({ slug: card.slug, printingId });
    setQtyInput('1');
    setMessage('');
    requestAnimationFrame(() => selectedHeading.current?.focus());
  };

  const add = async () => {
    if (!card || !collectionReady || !validQty || locked.current || quantityPending(pid)) return;
    locked.current = true;
    setSaving(true);
    setMessage('');
    try {
      const ok = await setQty(card.slug, pid, current + copies);
      setMessage(ok ? `Added ${copies} ${copies === 1 ? 'copy' : 'copies'} of ${card.display}.` : 'Couldn’t save this addition. Try again.');
      if (ok) setQtyInput('1');
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="panel intake-panel intake-search">
      <h2 className="intake-heading">Find a card</h2>
      <label className="sr-only" htmlFor="intake-query">Search cards</label>
      <input ref={queryInput} id="intake-query" className="input search intake-query" role="combobox"
        aria-autocomplete="list" aria-expanded={showResults} aria-controls="intake-matches" aria-describedby="intake-search-help"
        aria-activedescendant={showResults && highlight >= 0 ? `intake-option-${highlight}` : undefined}
        placeholder="Card name or collector number…" autoComplete="off" value={query}
        onFocus={() => setExpanded(true)}
        onChange={(event) => {
          setQuery(event.target.value); setHighlight(-1); setExpanded(true);
          if (!locked.current) { setSelection(undefined); setMessage(''); }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            setExpanded(false);
            setHighlight(-1);
          } else if (results.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            const next = event.key === 'ArrowDown' ? (highlight + 1) % results.length : (highlight <= 0 ? results.length - 1 : highlight - 1);
            setExpanded(true);
            setHighlight(next);
            requestAnimationFrame(() => document.getElementById(`intake-option-${next}`)?.scrollIntoView({ block: 'nearest' }));
          } else if (event.key === 'Enter' && showResults) {
            event.preventDefault();
            select(results[highlight < 0 ? 0 : highlight]);
          }
        }} />
      <p className="intake-description" id="intake-search-help">Search the catalog, then choose a printing and how many copies to add.</p>

      <div className={`intake-search-workspace${card && showResults ? ' has-selection' : ''}`}>
        <div hidden={!showResults}>
          <p className="intake-match-count" aria-live="polite">
            {matches.length > results.length ? `First ${results.length} of ${matches.length} matches · refine your search for more` : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}
          </p>
          <ul id="intake-matches" className="intake-matches" role="listbox" aria-label="Matching cards">
            {results.map((result, index) => (
              <li key={result.card.slug} id={`intake-option-${index}`} role="option" aria-selected={selection?.slug === result.card.slug}
                data-highlighted={index === highlight || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => select(result)}>
                <Pip color={result.card.color} />
                <span><strong>{result.card.name}</strong>{result.card.sub && <small>{result.card.sub}</small>}</span>
                <span className="intake-match-printing">{printingLabel(result.printingId, false)}<small>{result.card.type}</small></span>
              </li>
            ))}
          </ul>
        </div>

        {card && (
          <section className="intake-selected" aria-label="Selected card">
            <div className="intake-selected-top">
              <button type="button" className="intake-art-button" aria-label={`View details for ${card.display}, ${printingLabel(pid, false)}`}
                onClick={() => onOpen(card.slug, unspecified ? undefined : pid, unspecified)}>
                {unspecified ? <CardImg slug={card.slug} alt="" /> : <PrintingArt slug={card.slug} printingId={pid} alt="" />}
              </button>
              <div className="intake-selected-fields">
                <h3 ref={selectedHeading} tabIndex={-1}>{card.name}{card.sub && <small>{card.sub}</small>}</h3>
                <label htmlFor="intake-printing">Printing</label>
                <VaultSelect id="intake-printing" value={pid} disabled={saving}
                  onValueChange={(printingId) => { setSelection({ slug: card.slug, printingId }); setQtyInput('1'); setMessage(''); }}
                  options={[
                    ...card.printings.map((p) => ({ value: p.id, label: printingLabel(p.id) })),
                    { value: unspecifiedId(card.slug), label: 'Printing unspecified' },
                  ]} />
                <p className="intake-print-meta">
                  <strong>{collectionReady ? `${current} in vault` : 'Checking vault…'}</strong>
                  <span>{price ? `${money(price.cad)} · ${price.basis}` : 'Unpriced'}</span>
                </p>
              </div>
            </div>
            <form className="intake-quick-add" onSubmit={(event) => { event.preventDefault(); void add(); }}>
              <label>Copies<input className="input" type="number" min={1} max={limit || 1} step={1} required value={qty} disabled={saving || !limit}
                onChange={(event) => setQtyInput(event.target.value)} /></label>
              <button type="submit" className="btn" disabled={!collectionReady || !validQty || saving || quantityPending(pid)}>
                {saving ? 'Saving…' : validQty ? `Add ${copies} ${copies === 1 ? 'copy' : 'copies'}` : 'Add copies'}
              </button>
              <button type="button" className="linklike" onClick={() => { queryInput.current?.focus(); queryInput.current?.select(); }}>Search again</button>
            </form>
            {!limit && <p className="muted tiny">This printing has reached the limit of {MAX_PRINTING_COPIES} copies.</p>}
            {limit > 0 && qty && !validQty && <p className="muted tiny">Enter a whole number between 1 and {limit}.</p>}
            <p className="intake-search-status" role="status">{message}</p>
          </section>
        )}
      </div>

      {!query.trim() && !card && <div className="intake-search-empty"><IntakeIcon name="search" /><p>Try <b>Jackie Welles</b> or <b>#042</b> from your card.</p></div>}
      {!!query.trim() && !results.length && <p className="intake-search-empty" role="status">No cards match “{query.trim()}”. Try a shorter name or the number printed on the card.</p>}
    </section>
  );
}
