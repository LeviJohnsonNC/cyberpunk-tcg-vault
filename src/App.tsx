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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CV</div>
          <div>
            <h1 className="glitch" data-text="Cyberpunk TCG Vault">Cyberpunk TCG Vault</h1>
            <small>NIGHT CITY CARD OPS // WELCOME TO NIGHT CITY</small>
          </div>
        </div>
        <div className="status">
          <span className="hide-sm">
            <span className={`dot ${store.mode === 'local' ? 'local' : ''}`} />
            <span className="lbl">{store.mode === 'cloud' ? 'CLOUD SYNC' : 'LOCAL MODE'}</span>
          </span>
          <span className="hide-sm">{total} CARDS</span>
          {cloudEnabled && <AuthBox />}
        </div>
      </header>

      {store.localPending > 0 && (
        <div className="callout y" style={{ marginTop: 14 }}>
          <div className="row">
            <span>
              You have <b>{store.localPending}</b> collection entries saved in this browser. Upload them to your account?
            </span>
            <span className="spacer" />
            <button className="btn sm" onClick={store.pushLocalToCloud}>Sync to account</button>
          </div>
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t, i) => (
          <button key={t.id} className={`tab ${route.tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
            <span className="num">0{i + 1}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {route.tab === 'collection' && <Collection onOpen={setOpenCard} goAdd={() => go('add')} />}
        {route.tab === 'prices' && <PriceBook onOpen={setOpenCard} />}
        {route.tab === 'builder' && <DeckBuilder onOpen={setOpenCard} initialDeck={route.deck} />}
        {route.tab === 'meta' && <MetaIntel onOpen={setOpenCard} openInBuilder={(id) => go('builder', id)} />}
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
      </footer>
    </div>
  );
}
