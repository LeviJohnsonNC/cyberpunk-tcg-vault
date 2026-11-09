import type { PrimaryTab, TabId } from '../lib/vaultNavigation';

const links = [
  { id: 'collection', label: 'Vault', icon: 'M3 8h18v12H3zM3 8l2-4h14l2 4M10 12h4v4h-4z' },
  { id: 'prices', label: 'Prices', icon: 'M4 19V5m0 14h16M8 15l4-4 3 2 5-6' },
  { id: 'add', label: 'Add', icon: 'M12 5v14M5 12h14' },
  { id: 'builder', label: 'Decks', icon: 'M7 4h11v15H7zM4 7v14h11M10 8h5m-5 4h5' },
  { id: 'meta', label: 'Intel', icon: 'M3 12a9 9 0 0 0 18 0M12 3a9 9 0 0 0-9 9m9-9a9 9 0 0 1 9 9m-9 0 6-6M8 12a4 4 0 0 0 8 0' },
] satisfies { id: PrimaryTab; label: string; icon: string }[];

export function MobileVaultNav({ tab }: { tab: TabId }) {
  const active = tab === 'shared' || tab === 'upgrade' ? 'builder' : tab;
  return (
    <nav className="vault-mobile-nav" aria-label="Sections">
      {links.map(({ id, label, icon }) => (
        <a key={id} href={`#/${id}`} aria-current={active === id ? 'page' : undefined}>
          <span className="vault-mobile-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
          </span>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
