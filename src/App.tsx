import { useEffect, useState } from 'react';
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

const TABS = [
  { id: 'collection', label: 'Collection' },
  { id: 'prices', label: 'Price Book' },
  { id: 'builder', label: 'Deck Builder' },
  { id: 'meta', label: 'Meta Intel' },
  { id: 'add', label: 'Add Cards' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const readHash = (): { tab: TabId; deck?: string } => {
  const [t, q] = window.location.hash.replace(/^#\/?/, '').split('?');
  const tab = (TABS.find((x) => x.id === t)?.id ?? 'collection') as TabId;
  const deck = new URLSearchParams(q || '').get('deck') ?? undefined;
  return { tab, deck };
};

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState(readHash);
  const [openCard, setOpenCard] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (tab: TabId, deck?: string) => {
    window.location.hash = `/${tab}${deck ? `?deck=${encodeURIComponent(deck)}` : ''}`;
  };

  const total = [...store.owned.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <a className="brand" href="#/collection" aria-label="Cyberpunk TCG Vault, home">
            <span className="brand-badge"><span>CV</span></span>
            <span className="brand-name">Vault</span>
          </a>
          <nav className="navlinks" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="navlink" aria-current={route.tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="status">
            <span className="hide-sm" title={store.mode === 'cloud' ? 'Synced to your account' : 'Saved in this browser only'}>
              <span className={`dot ${store.mode === 'local' ? 'local' : ''}`} />
              {store.mode === 'cloud' ? 'Cloud sync' : 'Local mode'}
            </span>
            <span className="hide-sm">{total} cards</span>
            {cloudEnabled && <AuthBox />}
          </div>
        </div>
      </header>

    <div className="app page">
      {store.localPending > 0 && (
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
        {route.tab === 'collection' && <Collection onOpen={setOpenCard} goAdd={() => go('add')} />}
        {route.tab === 'prices' && <PriceBook onOpen={setOpenCard} goAdd={() => go('add')} />}
        {route.tab === 'builder' && <DeckBuilder onOpen={setOpenCard} initialDeck={route.deck} />}
        {route.tab === 'meta' && <MetaIntel onOpen={setOpenCard} openInBuilder={(id) => go('builder', id)} goAdd={() => go('add')} />}
        {route.tab === 'add' && <AddCards onOpen={setOpenCard} />}
      </main>

      {openCard && <CardDrawer slug={openCard} onClose={() => setOpenCard(null)} />}

      <div className="toasts">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'err' ? 'err' : ''}`}>{t.msg}</div>
        ))}
      </div>

      <footer className="footer">
        Unofficial fan-made tool. Not affiliated with WeirdCo or CD PROJEKT RED. Card data and images come from the official
        Cyberpunk TCG card database. Cyberpunk and card art are trademarks and copyrights of CD PROJEKT S.A.
        <br />
        Prices: {PRICES.source}, converted at 1 USD = {PRICES.fx.usdToCad.toFixed(4)} CAD. Updated{' '}
        {new Date(PRICES.updatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}.
        <br />
        <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> ·{' '}
        <a href="https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
    </>
  );
}
