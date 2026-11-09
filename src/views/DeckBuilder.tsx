import { useEffect, useMemo, useRef, useState } from 'react';
import { RECOMMENDED, type Card } from '../lib/data';
import { addDeckCard, formatDeckText, newDeck, readDeckDraft, readDeckText, rememberDeckDraft, totalCopies, type DeckDraft, type DeckZone } from '../lib/deckDraft';
import { deckFromRecommended, deckNeed, purchaseEstimate, validate } from '../lib/decks';
import { newId, useStore, type Deck } from '../lib/store';
import { ConfirmDialog, Masthead, ViewTabs } from '../components/ui';
import { PENDING_DECK_KEY, openPlanner } from '../lib/handoff';
import { ShareDialog } from '../components/ShareDialog';
import { HandTester, type TestDeck } from '../components/HandTester';
import { DeckCardPool } from './DeckCardPool';
import { DeckWorkbenchChecks, DeckWorkbenchList, DeckWorkbenchMissing } from './DeckWorkbenchPane';
import './deck-builder.css';

type MobileView = 'pool' | 'deck';
type Pane = 'list' | 'checks' | 'missing';
type Replacement = { next: DeckDraft; imported?: string[] };
const initialView = (deck: Deck): MobileView => deck.legends.length || totalCopies(deck.cards) || totalCopies(deck.sideboard) ? 'deck' : 'pool';

export function DeckBuilder({ onOpen, initialDeck }: { onOpen: (slug: string) => void; initialDeck?: string }) {
  const { ready, session } = useStore();
  const owner = session?.user.id ?? 'local';
  if (!ready) return <section>
    <Masthead eyebrow="The Afterlife / Crew Builder" title="Deck Builder" />
    <p className="callout section-gap" role="status">Opening your workbench…</p>
  </section>;
  return <DeckWorkbench key={owner} owner={owner} onOpen={onOpen} initialDeck={initialDeck} />;
}

function DeckWorkbench({ owner, onOpen, initialDeck }: { owner: string; onOpen: (slug: string) => void; initialDeck?: string }) {
  const { decks, saveDeck, deleteDeck, owned, toast, collectionReady, collectionError, retryCollection } = useStore();
  const [draft, setDraft] = useState<DeckDraft>(() => readDeckDraft(owner) ?? { deck: newDeck(), dirty: false });
  const { deck, dirty } = draft;
  const [zone, setZone] = useState<DeckZone>('cards');
  const [pickingLegend, setPickingLegend] = useState(() => !deck.legends.length);
  const [mobileView, setMobileView] = useState<MobileView>(() => initialView(deck));
  const [pane, setPane] = useState<Pane>('list');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [replacement, setReplacement] = useState<Replacement>();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [testing, setTesting] = useState<TestDeck[] | null>(null);
  const loadDialog = useRef<HTMLDialogElement>(null);
  const importDialog = useRef<HTMLDialogElement>(null);
  const actions = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const deckPane = useRef<HTMLElement>(null);
  const workbench = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const handledRoute = useRef<string>(undefined);
  const scroll = useRef<Record<MobileView, number>>({ pool: 0, deck: 0 });
  const savePending = useRef(false);
  const feedbackTimer = useRef<number>(undefined);

  const saved = decks.some((item) => item.id === deck.id);
  const checks = useMemo(() => validate(deck), [deck]);
  const mainNeed = useMemo(() => deckNeed(deck), [deck]);
  const fullNeed = useMemo(() => {
    const need = { ...mainNeed };
    for (const [slug, qty] of Object.entries(deck.sideboard)) need[slug] = (need[slug] ?? 0) + qty;
    return need;
  }, [mainNeed, deck.sideboard]);
  const missing = useMemo(() => collectionReady ? purchaseEstimate(fullNeed, owned) : undefined, [collectionReady, fullNeed, owned]);
  const mainOnly = useMemo(() => collectionReady ? purchaseEstimate(mainNeed, owned) : undefined, [collectionReady, mainNeed, owned]);
  const fromScratch = useMemo(() => purchaseEstimate(fullNeed, new Map()), [fullNeed]);
  const empty = !deck.legends.length && !checks.n && !checks.side;
  const saveStatus = dirty ? 'Unsaved changes' : saved ? 'Saved' : collectionReady ? 'New draft' : 'Checking save status…';

  useEffect(() => { rememberDeckDraft(owner, draft); }, [owner, draft]);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => {
    const header = document.querySelector('.appbar');
    const strip = sticky.current;
    const root = workbench.current;
    if (!header || !strip || !root) return;
    const measure = () => {
      const top = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty('--workbench-top', `${top}px`);
      root.style.setProperty('--workbench-deck-top', `${Math.ceil(top + strip.getBoundingClientRect().height + 4)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  // Consume incoming drafts once. A plain builder URL then recovers the workbench after refresh or Back.
  useEffect(() => {
    if (!initialDeck) {
      handledRoute.current = undefined;
      return;
    }
    if (handledRoute.current === initialDeck) return;
    let incoming: Deck | null = null;
    let nextDirty = true;
    if (initialDeck === '__pending') {
      try {
        const raw = sessionStorage.getItem(PENDING_DECK_KEY);
        sessionStorage.removeItem(PENDING_DECK_KEY);
        if (raw) incoming = JSON.parse(raw) as Deck;
      } catch {
        // The current workbench is still available.
      }
    } else {
      const existing = decks.find((item) => item.id === initialDeck);
      nextDirty = !existing;
      incoming = existing ?? deckFromRecommended(initialDeck);
      if (!incoming && !collectionReady) return;
    }
    handledRoute.current = initialDeck;
    window.history.replaceState(window.history.state, '', '#/builder');
    if (!incoming) return;
    const next = { deck: structuredClone(incoming), dirty: nextDirty };
    if (dirty) setReplacement({ next });
    else {
      setDraft(next);
      setPickingLegend(!next.deck.legends.length);
      setMobileView(initialView(next.deck));
      setPane('list');
    }
  }, [initialDeck, decks, collectionReady, dirty]);

  function announce(message: string) {
    setFeedback(message);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), 3600);
  }

  function update(fn: (current: Deck) => Deck) {
    setDraft((current) => ({ deck: fn(current.deck), dirty: true }));
  }

  function add(card: Card, destination: DeckZone) {
    const result = addDeckCard(deck, card, destination);
    if ('error' in result) return toast(result.error, 'err');
    setDraft((current) => {
      const next = addDeckCard(current.deck, card, destination);
      return 'error' in next ? current : { deck: next.deck, dirty: true };
    });
    if (result.destination === 'crew') {
      announce(`Added to Crew · ${result.deck.legends.length}/3 Legends`);
      if (result.deck.legends.length === 3) setPickingLegend(false);
    } else if (result.destination === 'cards') announce(`Added to Main · ${totalCopies(result.deck.cards)} cards`);
    else announce(`Added to Sideboard · ${totalCopies(result.deck.sideboard)}/7`);
  }

  function remove(slug: string, destination: DeckZone) {
    update((current) => {
      const cards = { ...current[destination] };
      const remaining = (cards[slug] ?? 0) - 1;
      if (remaining > 0) cards[slug] = remaining;
      else delete cards[slug];
      return { ...current, [destination]: cards };
    });
  }

  function switchMobile(view: MobileView) {
    const isMobile = window.matchMedia('(max-width: 1000px)').matches;
    if (view !== mobileView) {
      if (isMobile) scroll.current[mobileView] = window.scrollY;
      setMobileView(view);
    }
    requestAnimationFrame(() => {
      if (isMobile && view !== mobileView) window.scrollTo({ top: scroll.current[view], behavior: 'auto' });
    });
  }

  function chooseLegend() {
    setPickingLegend(true);
    switchMobile('pool');
    requestAnimationFrame(() => search.current?.focus());
  }

  function selectPane(next: Pane, fromStatus = false) {
    setPane(next);
    if (deckPane.current) deckPane.current.scrollTop = 0;
    if (!fromStatus) return;
    switchMobile('deck');
    requestAnimationFrame(() => {
      const title = document.getElementById(`workbench-${next}-title`);
      title?.focus({ preventScroll: true });
      if (title && (title.getBoundingClientRect().top < 185 || title.getBoundingClientRect().bottom > window.innerHeight)) title.scrollIntoView({ block: 'start' });
    });
  }

  function finishReplacement(change: Replacement) {
    setDraft(change.next);
    setZone('cards');
    setPane('list');
    setPickingLegend(!change.next.deck.legends.length);
    setMobileView(initialView(change.next.deck));
    scroll.current = { pool: 0, deck: 0 };
    if (deckPane.current) deckPane.current.scrollTop = 0;
    if (change.imported) toast(change.imported.length
      ? `Imported. Skipped ${change.imported.length}: ${change.imported.slice(0, 4).join(', ')}` : 'Deck imported', change.imported.length ? 'err' : 'ok');
    setReplacement(undefined);
    setFeedback('');
  }

  function replace(next: DeckDraft, imported?: string[]) {
    const change = { next, imported };
    if (dirty) setReplacement(change);
    else finishReplacement(change);
  }

  async function save(asCopy = false, quiet = false) {
    if (savePending.current) return false;
    savePending.current = true;
    setSaving(true);
    const snapshot = asCopy ? { ...deck, id: newId(), name: `${deck.name} (copy)`.slice(0, 80) } : deck;
    try {
      const ok = await saveDeck(snapshot);
      if (ok) {
        setDraft((current) => current.deck === deck ? { deck: snapshot, dirty: false } : current);
        if (!quiet) toast(asCopy ? 'Saved as copy' : 'Deck saved');
      }
      return ok;
    } catch {
      toast('Couldn’t save this deck. Try again.', 'err');
      return false;
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast('Clipboard blocked by browser', 'err');
    }
  }

  function openLoad() {
    if (!savePending.current && !deleting) loadDialog.current?.showModal();
  }

  function load(next: Deck, isSaved: boolean) {
    loadDialog.current?.close();
    if (isSaved && next.id === deck.id && !dirty) return;
    replace({ deck: structuredClone(next), dirty: !isSaved });
  }

  function doImport() {
    const parsed = readDeckText(importText);
    if (!parsed.deck.legends.length && !totalCopies(parsed.deck.cards) && !totalCopies(parsed.deck.sideboard)) {
      setImportError('No cards could be imported. Check the full card names and quantities.');
      return;
    }
    importDialog.current?.close();
    replace({ deck: parsed.deck, dirty: true }, parsed.unknown);
  }

  function fromMenu(run: () => void) {
    if (actions.current) actions.current.open = false;
    run();
  }

  return (
    <section className="deck-workbench" ref={workbench}>
      <Masthead eyebrow="The Afterlife / Crew Builder" title="Deck Builder">
        <div className="workbench-identity">
          <label className="sr-only" htmlFor="workbench-deck-name">Deck name</label>
          <input className="input" id="workbench-deck-name" maxLength={80} value={deck.name}
            onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} />
          <span className="workbench-save-status" data-status={saveStatus} role="status">{saving ? 'Saving…' : saveStatus}</span>
        </div>
        <div className="workbench-actions">
          <button type="button" className="btn quiet" disabled={saving || deleting} aria-haspopup="dialog" onClick={openLoad}>Load deck</button>
          <button type="button" className="btn" disabled={saving || deleting} onClick={() => void save()}>Save deck</button>
          <button type="button" className="btn quiet" aria-haspopup="dialog" onClick={() => setTesting([{ label: 'This deck', ...structuredClone(deck) }])}>Test hand</button>
          {!empty && <button type="button" className="btn quiet" disabled={saving || deleting} aria-haspopup="dialog" onClick={() => setShareOpen(true)}>Share</button>}
          <details className="workbench-more" ref={actions}>
            <summary className="btn quiet">More</summary>
            <div className="workbench-menu">
              <button type="button" disabled={saving || deleting} onClick={() => fromMenu(() => replace({ deck: newDeck(), dirty: false }))}>New empty deck</button>
              <button type="button" disabled={saving || deleting} onClick={() => fromMenu(() => { void save(true); })}>Save copy</button>
              <button type="button" onClick={() => fromMenu(() => { void copy(formatDeckText(deck), 'Decklist'); })}>Copy list</button>
              <button type="button" disabled={saving || deleting} onClick={() => fromMenu(() => { setImportError(''); importDialog.current?.showModal(); })}>Import list</button>
              <button type="button" disabled={deck.legends.length !== 3} onClick={() => fromMenu(() => openPlanner({
                name: deck.name || 'Untitled deck', kind: saved ? 'saved' : 'current', legends: deck.legends, cards: deck.cards,
              }))}>Upgrade this deck</button>
              {empty && <button type="button" onClick={() => fromMenu(() => setShareOpen(true))}>Share deck</button>}
              {saved && <button type="button" className="danger-text" disabled={saving || deleting} onClick={() => fromMenu(() => setDeleteConfirm(true))}>Delete saved deck</button>}
            </div>
          </details>
        </div>
      </Masthead>

      <div className="workbench-sticky" ref={sticky}>
        <div className="workbench-status" aria-label="Deck status">
          <span>Crew <b>{deck.legends.length}/3</b></span>
          <span>Main <b>{checks.n}</b> <small>(40–50)</small></span>
          <span><span className="workbench-side-label">Sideboard</span><span className="workbench-short-side">Side</span> <b>{checks.side}/7</b></span>
          <button type="button" onClick={() => selectPane('checks', true)}>{empty ? 'Checks' : checks.legal ? 'Legal deck' : `${checks.issues.length} rule ${checks.issues.length === 1 ? 'issue' : 'issues'}`}</button>
          <button type="button" onClick={() => selectPane('missing', true)}>{empty || !missing ? 'Missing' : missing.copies ? `${missing.copies} missing` : 'Fully owned'}</button>
        </div>
        <div className="workbench-mobile-tabs al-view-tabs" role="group" aria-label="Workbench view">
          <button type="button" aria-pressed={mobileView === 'pool'} onClick={() => switchMobile('pool')}>Find cards</button>
          <button type="button" aria-pressed={mobileView === 'deck'} onClick={() => switchMobile('deck')}>Deck · {deck.legends.length + checks.n + checks.side}</button>
        </div>
        <p className="workbench-feedback al-action-feedback" data-tone={feedback ? 'success' : undefined} role="status">{feedback || (pickingLegend ? 'Legend picks go to the crew.' : `Pool adds go to ${zone === 'cards' ? 'Main' : 'Sideboard'}.`)}</p>
      </div>

      <div className="workbench-grid" data-mobile-view={mobileView}>
        <DeckCardPool deck={deck} owned={owned} ownershipReady={collectionReady} limits={checks.lim} zone={zone} setZone={(next) => { setZone(next); setFeedback(''); }}
          pickingLegend={pickingLegend} browse={() => { setPickingLegend(false); setFeedback(''); }} onOpen={onOpen} onAdd={add} searchRef={search} />
        <section className="workbench-deck" ref={deckPane} aria-label="Deck workspace">
          <ViewTabs<Pane> id="workbench" label="Deck view" className="workbench-deck-tabs" value={pane} onChange={selectPane} tabs={[
            { id: 'list', label: 'List' },
            { id: 'checks', label: <>Checks{!empty && !checks.legal && <span>{checks.issues.length}</span>}</> },
            { id: 'missing', label: <>Missing{!!missing?.copies && <span>{missing.copies}</span>}</> },
          ]} />
          <div id="workbench-panel-list" role="tabpanel" aria-labelledby="workbench-tab-list" tabIndex={0} hidden={pane !== 'list'}>
            <DeckWorkbenchList deck={deck} checks={checks} missing={missing} onChooseLegend={chooseLegend} onLoad={openLoad} onOpen={onOpen}
              onAdd={add} onRemove={remove} onRemoveLegend={(index) => update((current) => ({ ...current, legends: current.legends.filter((_, i) => i !== index) }))} />
          </div>
          <div id="workbench-panel-checks" role="tabpanel" aria-labelledby="workbench-tab-checks" tabIndex={0} hidden={pane !== 'checks'}><DeckWorkbenchChecks deck={deck} checks={checks} /></div>
          <div id="workbench-panel-missing" role="tabpanel" aria-labelledby="workbench-tab-missing" tabIndex={0} hidden={pane !== 'missing'}><DeckWorkbenchMissing empty={empty} missing={missing} fromScratch={fromScratch} mainOnly={mainOnly}
            hasSide={checks.side > 0} collectionError={collectionError} retryCollection={retryCollection} onOpen={onOpen} copy={copy} /></div>
        </section>
      </div>

      <dialog className="al-dialog tone-accent workbench-load-dialog" ref={loadDialog} aria-labelledby="workbench-load-title">
        <div className="al-dialog-body">
          <div className="workbench-dialog-head"><h2 id="workbench-load-title">Load deck</h2><form method="dialog"><button className="btn quiet sm">Close</button></form></div>
          <div className="al-dialog-content">
            {decks.length > 0 && <section><h3>My decks</h3><ul>{decks.map((item) => (
              <li key={item.id}><button type="button" className="btn quiet" onClick={() => load(item, true)}>{item.name || 'Untitled deck'}</button></li>
            ))}</ul></section>}
            <section><h3>Recommended decks</h3><ul>{RECOMMENDED.map((item) => (
              <li key={item.id}><button type="button" className="btn quiet" onClick={() => {
                const next = deckFromRecommended(item.id);
                if (next) load(next, false);
              }}><span>{item.name}</span><small>{item.kind === 'meta' ? 'Community meta' : item.kind}</small></button></li>
            ))}</ul></section>
          </div>
        </div>
      </dialog>

      <dialog className="al-dialog tone-accent workbench-import-dialog" ref={importDialog} aria-labelledby="workbench-import-title">
        <div className="al-dialog-body">
          <h2 id="workbench-import-title">Import a decklist</h2>
          <div className="al-dialog-content">
            <p>Paste one card per line using a quantity and the full name. Use // Sideboard for sideboard cards.</p>
            <textarea className="input mono" aria-label="Decklist to import" placeholder={'1 V: Corporate Exile\n3 Psycho Squad\n// Sideboard\n2 Floor It'}
              value={importText} onChange={(event) => { setImportText(event.target.value); setImportError(''); }} />
            {importError && <p className="danger-text" role="alert">{importError}</p>}
          </div>
          <div className="al-dialog-actions"><form method="dialog"><button className="btn quiet">Cancel</button></form>
            <button type="button" className="btn" onClick={doImport} disabled={!importText.trim()}>Import as draft</button></div>
        </div>
      </dialog>

      <ConfirmDialog open={!!replacement} title="Replace this draft?" confirmLabel="Discard changes"
        onCancel={() => setReplacement(undefined)} onConfirm={() => { if (replacement) finishReplacement(replacement); }}>
        <p>Your unsaved changes will be replaced. Cancel to return to this deck and save it first.</p>
      </ConfirmDialog>
      <ConfirmDialog open={deleteConfirm} title="Delete saved deck?" confirmLabel="Delete deck" busy={deleting}
        onCancel={() => setDeleteConfirm(false)} onConfirm={async () => {
          setDeleting(true);
          try {
            if (await deleteDeck(deck.id)) {
              finishReplacement({ next: { deck: newDeck(), dirty: false } });
              setDeleteConfirm(false);
            }
          } finally {
            setDeleting(false);
          }
        }}>
        <p>Delete {deck.name || 'this deck'} and revoke its share link if it has one.</p>
      </ConfirmDialog>
      {testing && <HandTester decks={testing} onClose={() => setTesting(null)} />}
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} deck={deck} saved={saved} dirty={dirty}
        save={() => save(false, true)} copyList={() => { void copy(formatDeckText(deck), 'Decklist'); }} />
    </section>
  );
}
