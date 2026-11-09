import { useEffect, useRef, useState } from 'react';
import { useStore } from './lib/store';
import { cloudEnabled } from './lib/supabase';
import { PRICES } from './lib/data';
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
import { MusicPlayer } from './components/MusicPlayer';
import { CURRENCIES, getCurrency, setCurrency, type Currency } from './lib/currency';

const TABS = [
  { id: 'collection', label: 'Collection' },
  { id: 'prices', label: 'Price Book' },
  { id: 'builder', label: 'Deck Builder' },
  { id: 'meta', label: 'Meta Intel' },
  { id: 'add', label: 'Add Cards' },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'about' | 'upgrade' | 'shared';

const readHash = (): { tab: TabId; deck?: string } => {
  const [t, q] = window.location.hash.replace(/^#\/?/, '').split('?');
  const tab = (t === 'about' || t === 'upgrade' || t === 'shared' ? t : TABS.find((x) => x.id === t)?.id ?? 'collection') as TabId;
  const deck = new URLSearchParams(q || '').get('deck') ?? undefined;
  return { tab, deck };
};

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState(readHash);
  const nav = useRef<HTMLElement>(null);
  const [openCard, setOpenCard] = useState<{ slug: string; printingId?: string; identify?: boolean } | null>(null);
  const showCard = (slug: string, printingId?: string, identify?: boolean) => setOpenCard({ slug, printingId, identify });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Prices are formatted from a module-level setting; this state re-renders the app when it changes.
  const [currency, setCur] = useState<Currency>(getCurrency);
  const chooseCurrency = (c: Currency) => {
    setCurrency(c);
    setCur(c);
  };

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

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
  }, [route.tab]);

  const go = (tab: TabId, deck?: string) => {
    window.location.hash = `/${tab}${deck ? `?deck=${encodeURIComponent(deck)}` : ''}`;
  };

  const total = [...store.owned.values()].reduce((a, b) => a + b, 0);
  const sync = store.demo ? 'sample' : store.collectionError ? 'error' : !store.ready || !store.collectionReady ? 'loading'
    : store.mode === 'cloud' ? 'synced' : 'local';
  const vaultLabel = { sample: 'Sample vault', error: 'Sync unavailable', loading: store.ready ? 'Syncing…' : 'Connecting…', synced: 'Synced', local: 'Local vault' }[sync];
  const vaultCount = store.collectionReady ? `${total} ${total === 1 ? 'card' : 'cards'}` : '';

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <a className="brand" href="#/collection" aria-label="Cyberpunk TCG Vault home">
            <span className="brand-badge" aria-hidden="true"><span>€$</span></span>
            <span className="brand-name"><span>Cyberpunk TCG</span>Vault</span>
          </a>
          <nav className="navlinks" aria-label="Sections" ref={nav}>
            {TABS.map((t) => (
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
            <span className="seg" role="group" aria-label="Price currency">
              {CURRENCIES.map((c) => (
                <button key={c} aria-pressed={currency === c} onClick={() => chooseCurrency(c)}>{c}</button>
              ))}
            </span>
            {cloudEnabled && <AuthBox />}
          </div>
        </div>
      </header>

    <div className="app page">
      {store.demo && (
        <div className="callout demo-banner" role="status">
          <div className="row">
            <span>
              <b>Sample vault.</b> You’re exploring {total} sample cards. Card edits here stay separate from your collection.
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

      <main>
        {route.tab === 'collection' && <Collection onOpen={showCard} goAdd={() => go('add')} />}
        {route.tab === 'prices' && <PriceBook onOpen={showCard} goAdd={() => go('add')} />}
        {route.tab === 'builder' && <DeckBuilder onOpen={showCard} initialDeck={route.deck} />}
        {route.tab === 'meta' && <MetaIntel onOpen={showCard} openInBuilder={(id) => go('builder', id)} goAdd={() => go('add')} />}
        {route.tab === 'add' && <AddCards onOpen={showCard} />}
        {route.tab === 'about' && <HowItWorks openFeedback={() => setFeedbackOpen(true)} />}
        {route.tab === 'upgrade' && <UpgradePlanner onOpen={showCard} />}
        {route.tab === 'shared' && <SharedDeck token={route.deck} onOpen={showCard} goAdd={() => go('add')} />}
      </main>

      {openCard && <CardDrawer {...openCard} onClose={() => setOpenCard(null)} />}
      <MusicPlayer />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} page={route.tab} />

      <div className="toasts">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'err' ? 'err' : ''}`}>{t.msg}</div>
        ))}
      </div>

      <footer className="footer">
        Unofficial fan-made tool. Not affiliated with WeirdCo or CD PROJEKT RED. Card data and images come from the official
        Cyberpunk TCG card database. Cyberpunk and card art are trademarks and copyrights of CD PROJEKT S.A.
        <br />
        Prices: {PRICES.source}, in USD; CAD at 1 USD = {PRICES.fx.usdToCad.toFixed(4)} CAD. Updated{' '}
        {new Date(PRICES.updatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '')}.
        <br />
        <a href="#/about">How it works</a> ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); setFeedbackOpen(true); }}>Send feedback</a> ·{' '}
        <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> ·{' '}
        <a href="https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
    </>
  );
}
