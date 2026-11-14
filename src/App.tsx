import { Activity, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { useStore, type Deck } from './lib/store';
import { cloudEnabled } from './lib/supabase';
import { AuthBox } from './components/AuthBox';
import { CardDrawer } from './components/CardDrawer';
import { Collection } from './views/Collection';
import { PriceBook } from './views/PriceBook';
import { DeckBuilder } from './views/DeckBuilder';
import { MetaIntel } from './views/MetaIntel';
import { AddCards } from './views/AddCards';
import { HowItWorks } from './views/HowItWorks';
import { UpgradePlanner } from './views/UpgradePlanner';
import { SharedDeck } from './views/SharedDeck';
import { FeedbackDialog } from './components/Feedback';
import { MatchRadioContainer } from './lib/play/matchRadio';
import { MusicPlayer } from './components/MusicPlayer';
import { MobileVaultNav } from './components/MobileVaultNav';
import { CURRENCIES, getCurrency, setCurrency, type Currency } from './lib/currency';
import { clearSampleDraft, newDeck, readDeckDraft, rememberDeckDraft, SAMPLE_DRAFT_OWNER, type DeckDraft } from './lib/deckDraft';
import { TABS, useVaultNavigation, type TabId } from './lib/vaultNavigation';
import { playPreviewEnabled } from './lib/play/playPreview';
import { readMatchSummary } from './lib/play/matchStorage';
import { PENDING_DECK_KEY } from './lib/handoff';
import type { MatchSnapshot, MatchSummary } from './lib/play/protocol';
import './mobile-shell.css';

const PlayMode = playPreviewEnabled ? lazy(() => import('./views/PlayMode')) : null;

function stripAnalyticsUrlDetails(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.hash = '';
  url.search = '';
  return { ...event, url: url.href };
}

export default function App() {
  const store = useStore();
  const { demo, toast } = store;
  const scope = demo ? SAMPLE_DRAFT_OWNER : store.session?.user.id ?? 'local';
  const nav = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const menuAccount = useRef<HTMLHeadingElement>(null);
  const authTrigger = useRef<HTMLButtonElement>(null);
  const [matchRadioContainer, setMatchRadioContainer] = useState<HTMLDivElement | null>(null);
  const [musicContainer, setMusicContainer] = useState<HTMLDivElement | null>(null);
  const sampleEntered = useRef(false);
  const [openCard, setOpenCard] = useState<{ slug: string; printingId?: string; identify?: boolean; opener?: HTMLElement } | null>(null);
  const showCard = (slug: string, printingId?: string, identify?: boolean, opener?: HTMLElement) => setOpenCard({ slug, printingId, identify, opener });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const closeOverlays = useCallback(() => {
    document.querySelectorAll<HTMLDialogElement>('#root dialog[open]').forEach((dialog) => dialog.close());
    setOpenCard(null);
    setFeedbackOpen(false);
  }, []);
  const { route, visited, mobile, consumeDeck } = useVaultNavigation(scope, closeOverlays);
  const [playDraft, setPlayDraft] = useState<{ scope: string; draft: DeckDraft; opponent?: DeckDraft['deck'] }>();
  const [playRival, setPlayRival] = useState<{ scope: string; id: string }>();
  const [matchLookup, setMatchLookup] = useState<{ scope: string; saved?: MatchSummary; failed?: boolean }>();
  const matchInfo = matchLookup?.scope === scope ? matchLookup : undefined;
  const savedMatch = matchInfo?.saved;
  const matchDraft = playDraft?.scope === scope ? playDraft.draft : undefined;
  const requestSignIn = () => {
    if (mobile) {
      menu.current?.showModal();
      menuAccount.current?.focus();
    } else {
      const trigger = authTrigger.current;
      trigger?.focus({ preventScroll: true });
      if (trigger?.getAttribute('aria-expanded') === 'false') trigger.click();
    }
  };
  // Prices are formatted from a module-level setting; this state re-renders the app when it changes.
  const [currency, setCur] = useState<Currency>(getCurrency);
  const chooseCurrency = (c: Currency) => {
    setCurrency(c);
    setCur(c);
  };

  useEffect(() => {
    if (demo && !sampleEntered.current && mobile) toast('Sample Vault. Changes here are separate from your own Vault.');
    if (!demo) clearSampleDraft();
    sampleEntered.current = demo;
  }, [mobile, demo, toast]);

  useEffect(() => {
    if (!PlayMode || mobile || !store.ready) return;
    let active = true;
    const refresh = async () => {
      try {
        const saved = await readMatchSummary(scope);
        if (!active) return;
        setMatchLookup({ scope, saved });
        if (saved && !saved.ended && !window.location.hash) window.location.hash = '/play';
      } catch {
        if (active) setMatchLookup((previous) => previous?.scope === scope && previous.saved ? previous : { scope, failed: true });
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [mobile, scope, store.ready]);

  useEffect(() => {
    const rail = nav.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !active) return;
    const showActive = () => {
      const container = rail.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.left < container.left || item.right > container.right) {
        rail.scrollLeft += item.left - container.left - (rail.clientWidth - item.width) / 2;
      }
    };
    showActive();
    const observer = new ResizeObserver(showActive);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [route.tab, mobile]);

  const go = (tab: TabId, deck?: string) => {
    if (tab !== 'play') setPlayDraft(undefined);
    window.location.hash = `/${tab}${deck ? `?deck=${encodeURIComponent(deck)}` : ''}`;
  };

  function practiceAgainst(opponent: Deck) {
    const draft = readDeckDraft(scope) ?? { deck: newDeck(), dirty: false };
    setPlayDraft({ scope, draft: structuredClone(draft), opponent: structuredClone(opponent) });
    go('play');
  }

  function acceptMatch(snapshot: MatchSnapshot, startedDraft?: DeckDraft) {
    const ended = snapshot.view.gameEnded;
    if (savedMatch?.matchId !== snapshot.matchId || savedMatch.ended !== ended) {
      setMatchLookup({ scope, saved: { matchId: snapshot.matchId, ended, draft: startedDraft ?? matchDraft ?? savedMatch?.draft } });
    }
    if (matchDraft) setPlayDraft(undefined);
  }

  function returnToDraft() {
    const draft = matchDraft ?? savedMatch?.draft;
    if (draft && !readDeckDraft(scope)) rememberDeckDraft(scope, draft);
    go('builder');
  }

  const total = [...store.owned.values()].reduce((a, b) => a + b, 0);
  const sync = store.demo ? 'sample' : store.collectionError ? 'error' : !store.ready || !store.collectionReady ? 'loading'
    : store.mode === 'cloud' ? 'synced' : 'local';
  const vaultLabel = { sample: 'Sample vault', error: 'Sync unavailable', loading: store.ready ? 'Syncing…' : 'Connecting…', synced: 'Synced', local: 'Local vault' }[sync];
  const vaultCount = store.collectionReady ? `${total} ${total === 1 ? 'card' : 'cards'}` : '';
  const currencyToggle = <span className="seg" role="group" aria-label="Price currency">
    {CURRENCIES.map((c) => <button key={c} aria-pressed={currency === c} onClick={() => chooseCurrency(c)}>{c}</button>)}
  </span>;
  const showSection = (tab: TabId) => route.tab === tab || (mobile && visited.has(tab));
  const playPage = route.tab === 'play';
  const desktopPlay = playPage && !mobile;
  // The browser pathname stays the same when switching Vault screens.
  const analyticsPath = `/${route.tab}`;

  return (
    <>
      <Analytics route={analyticsPath} path={analyticsPath} beforeSend={stripAnalyticsUrlDetails} />
      <header className={desktopPlay ? 'appbar appbar--play' : 'appbar'}>
        <div className="appbar-inner">
          <a className="brand" href="#/collection" aria-label="Cyberpunk TCG Vault home">
            <span className="brand-badge" aria-hidden="true"><span>€$</span></span>
            <span className="brand-name"><span>Cyberpunk TCG</span>Vault</span>
          </a>
          {!mobile && <><nav className="navlinks" aria-label="Sections" ref={nav}>
            {TABS.filter((tab) => tab.id !== 'play' || PlayMode).map((t) => (
              <button key={t.id} className="navlink" aria-current={route.tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
            <button className="navlink feedback" onClick={() => setFeedbackOpen(true)}>Feedback</button>
          </nav>
          <div className="status">
            <span className="vault-sync" data-state={sync}>
              <span className="vault-sync-dot" aria-hidden="true" />
              <span role="status">{vaultLabel}</span>
              {vaultCount && <span className="vault-count">{vaultCount}</span>}
            </span>
            {currencyToggle}
            {cloudEnabled && <AuthBox triggerRef={authTrigger} />}
          </div></>}
          {mobile && <div className="vault-mobile-tools">
            {store.demo && <div className="vault-mobile-sample">
              <span>Sample Vault</span>
              <button type="button" aria-label="Exit sample vault" onClick={store.exitDemo}>Exit</button>
            </div>}
            {!store.demo && (sync === 'error' || sync === 'loading') && <span className="vault-mobile-sync" role="status" data-state={sync}>{vaultLabel}</span>}
            <button type="button" className="btn quiet vault-menu-trigger" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
              Menu
            </button>
          </div>}
        </div>
      </header>
      {mobile && <dialog ref={menu} className="al-dialog vault-mobile-menu" aria-labelledby="vault-mobile-menu-title">
        <div className="al-dialog-body">
          <div className="vault-mobile-menu-header">
            <h2 id="vault-mobile-menu-title">Vault menu</h2>
            <form method="dialog"><button className="btn quiet" type="submit">Close</button></form>
          </div>
          <p className="vault-menu-status"><span className="vault-sync-dot" data-state={sync} aria-hidden="true" />{vaultLabel}{vaultCount && ` · ${vaultCount}`}</p>
          {cloudEnabled && <section className="vault-menu-account-section" aria-labelledby="vault-menu-account">
            <h3 id="vault-menu-account" ref={menuAccount} tabIndex={-1}>{store.session ? 'Account' : 'Sign in'}</h3>
            <AuthBox inline />
          </section>}
          <section className="vault-menu-setting" aria-labelledby="vault-menu-currency">
            <h3 id="vault-menu-currency">Currency</h3>{currencyToggle}
          </section>
          <section className="vault-menu-setting vault-menu-sound" aria-labelledby="vault-menu-music">
            <h3 id="vault-menu-music">Music</h3><div ref={setMusicContainer} />
          </section>
          {PlayMode && <button type="button" className="btn quiet vault-menu-feedback" onClick={() => { menu.current?.close(); go('play'); }}>Campaign</button>}
          <button type="button" className="btn quiet vault-menu-feedback" onClick={() => { menu.current?.close(); setFeedbackOpen(true); }}>Send feedback</button>
        </div>
      </dialog>}

    <div className={playPage ? 'app page app--play' : 'app page'}>
      {store.demo && !mobile && route.tab !== 'play' && (
        <div className="callout demo-banner" role="status">
          <div className="row">
            <span>
              <b>Sample vault.</b> You’re exploring {total} sample cards. Changes here stay separate from your Vault.
            </span>
            <span className="spacer" />
            <button className="btn sm" onClick={() => { store.exitDemo(); go('add'); }}>Start my own vault</button>
            <button className="btn quiet sm" onClick={store.exitDemo}>Exit sample vault</button>
          </div>
        </div>
      )}
      {!store.demo && store.localPending > 0 && (
        <div className="callout y" style={{ marginBottom: 14 }}>
          <div className="row">
            <span>
              You have <b>{store.localPending}</b> collection entries saved in this browser. Upload them to your account?
            </span>
            <span className="spacer" />
            <button className="btn sm" onClick={store.pushLocalToCloud}>Sync to account</button>
          </div>
        </div>
      )}

      <main key={scope}>
        {showSection('collection') && <Activity mode={route.tab === 'collection' ? 'visible' : 'hidden'}><Collection mobile={mobile} onOpen={showCard} goAdd={() => go('add')} /></Activity>}
        {showSection('prices') && <Activity mode={route.tab === 'prices' ? 'visible' : 'hidden'}><PriceBook mobile={mobile} onOpen={showCard} goAdd={() => go('add')} /></Activity>}
        {(showSection('builder') || (route.tab === 'play' && (matchDraft || (savedMatch && readDeckDraft(scope))))) && <Activity mode={route.tab === 'builder' ? 'visible' : 'hidden'}><DeckBuilder mobile={mobile} onOpen={showCard} initialDeck={route.tab === 'builder' ? route.deck : undefined} onConsumeDeck={consumeDeck}
          onResume={PlayMode && !mobile && savedMatch ? () => {
            setPlayDraft(undefined);
            go('play');
          } : undefined} resumeEnded={savedMatch?.ended}
          onPlayAgainst={PlayMode && !mobile ? (draft) => {
            setPlayDraft({ scope, draft: structuredClone(draft), opponent: structuredClone(draft.deck) });
            go('play');
          } : undefined}
          onPlay={PlayMode && !mobile ? (draft) => {
            setPlayDraft({ scope, draft: structuredClone(draft) });
            go('play');
          } : undefined} /></Activity>}
        {showSection('meta') && <Activity mode={route.tab === 'meta' ? 'visible' : 'hidden'}><MetaIntel onPlayAgainst={PlayMode && !mobile ? practiceAgainst : undefined} onOpen={showCard} openInBuilder={(id) => go('builder', id)} goAdd={() => go('add')} /></Activity>}
        {route.tab === 'add' && <AddCards onOpen={showCard} onSignIn={requestSignIn} />}
        {route.tab === 'about' && <HowItWorks openFeedback={() => setFeedbackOpen(true)} />}
        {route.tab === 'upgrade' && <UpgradePlanner onOpen={showCard} />}
        {route.tab === 'shared' && <SharedDeck onPlayAgainst={PlayMode && !mobile ? practiceAgainst : undefined} token={route.deck} onOpen={showCard} goAdd={() => go('add')} />}
        {route.tab === 'play' && (PlayMode && store.ready && (mobile || matchInfo)
          ? <Suspense fallback={<p className="callout" role="status">Opening Play Mode…</p>}>
            <MatchRadioContainer.Provider value={desktopPlay ? setMatchRadioContainer : undefined}>
              <PlayMode key={scope} scope={scope} preparationOnly={mobile} draft={matchDraft} saved={savedMatch} initialRival={playRival?.scope === scope ? playRival.id : undefined}
                savedDecks={store.decks} initialOpponent={playDraft?.scope === scope ? playDraft.opponent : undefined}
                rememberRival={(id) => setPlayRival({ scope, id })} onCheckpoint={acceptMatch} onEdit={returnToDraft}
                onFreePlayReset={() => {
                  setPlayDraft(previous => previous?.scope === scope ? undefined : previous);
                  setPlayRival(previous => previous?.scope === scope ? undefined : previous);
                  setMatchLookup(previous => previous?.scope === scope ? { scope } : previous);
                  toast('Free Play reset.');
                }}
                onCampaignDeck={(deck) => {
                  try {
                    sessionStorage.setItem(PENDING_DECK_KEY, JSON.stringify({ ...structuredClone(deck), id: crypto.randomUUID(), name: `${deck.name} · Campaign clear` }));
                    go('builder', '__pending');
                  } catch { toast('Could not open the campaign deck. Your completed run is still saved.', 'err'); }
                }} />
            </MatchRadioContainer.Provider>
          </Suspense>
          : PlayMode && (!store.ready || (!mobile && !matchInfo)) ? <p className="callout" role="status">Checking for a saved match…</p>
          : <section className="panel">
            <h1 className="panel-title">Play Mode</h1>
            <p>{!PlayMode ? 'Play Mode is currently in preview.'
              : 'Play Mode couldn’t read this browser’s match storage.'}</p>
            <button type="button" className="btn" onClick={() => go('builder')}>Open Deck Builder</button>
          </section>)}
      </main>

      {openCard && <CardDrawer {...openCard} onClose={() => {
        const opener = openCard.opener?.isConnected ? openCard.opener
          : openCard.opener ? document.querySelector<HTMLElement>(route.tab === 'prices' ? '#pb-holdings-title' : '.collection-heading') : null;
        opener?.focus({ preventScroll: true });
        setOpenCard(null);
      }} />}
      <MusicPlayer controlsContainer={mobile ? musicContainer : desktopPlay && matchRadioContainer ? matchRadioContainer : undefined} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} page={route.tab} />

      <div className="toasts" aria-live="polite">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'err' ? 'err' : ''}`}>{t.msg}</div>
        ))}
      </div>

      {route.tab !== 'play' && <footer className="footer">
        <a href="#/about">How it works</a> ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); setFeedbackOpen(true); }}>Send feedback</a> ·{' '}
        <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>
      </footer>}
    </div>
    {mobile && <MobileVaultNav tab={route.tab} />}
    </>
  );
}
