import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { IntakeIcon } from '../components/IntakeIcon';
import { StarterAddedBanner, StarterIntake, type StarterAdded } from '../components/StarterIntake';
import { Masthead, ViewTabs } from '../components/ui';
import { useStore } from '../lib/store';
import { cloudEnabled } from '../lib/supabase';
import { CardSearchIntake } from './CardSearchIntake';
import { LiveScanIntake } from './LiveScanIntake';
import { PhotoScanIntake } from './PhotoScanIntake';
import { VaultFileIntake } from './VaultFileIntake';
import './intake.css';

const MODES = [
  { id: 'search', label: 'Search' },
  { id: 'scan', label: 'Scan cards' },
  { id: 'starter', label: 'Starter decks' },
  { id: 'import', label: 'Import file' },
] as const;
type Mode = (typeof MODES)[number]['id'];
const tabs = MODES.map(({ id, label }) => ({ id, label: <><IntakeIcon name={id} /> {label}</> }));

export function AddCards({ onOpen, onSignIn }: { onOpen: (slug: string, printingId?: string, identify?: boolean) => void; onSignIn: () => void }) {
  const { decks, owned, session, collectionReady, collectionError, retryCollection } = useStore();
  const [mode, setMode] = useState<Mode>('search');
  const [justAdded, setJustAdded] = useState<StarterAdded | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const canScan = !cloudEnabled || !!session;
  const count = [...owned.values()].reduce((total, qty) => total + qty, 0);
  const searchInstead = () => {
    // Keep focus inside the tap event so mobile browsers can open the keyboard.
    flushSync(() => setMode('search'));
    searchInput.current?.focus();
  };

  return (
    <section className="intake">
      <Masthead eyebrow="The Afterlife / Intake" title="Add Cards">
        <a className="intake-vault" href="#/collection">
          <span>Vault</span><IntakeIcon name="stack" />
          {collectionReady ? `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'} · ${count} ${count === 1 ? 'card' : 'cards'}` : 'Open collection'}
        </a>
      </Masthead>

      <ViewTabs id="intake" label="Add cards methods" tabs={tabs} value={mode} onChange={setMode} className="intake-tabs" />

      {!collectionReady && (
        <div className="callout y intake-loading" role={collectionError ? 'alert' : 'status'}>
          {collectionError ? <>The collection couldn’t be loaded. <button className="linklike" onClick={retryCollection}>Retry</button></> : 'Loading your collection…'}
        </div>
      )}

      <div id="intake-panel-search" role="tabpanel" aria-labelledby="intake-tab-search" hidden={mode !== 'search'}>
        <CardSearchIntake onOpen={onOpen} queryInput={searchInput} />
      </div>
      <div id="intake-panel-scan" role="tabpanel" aria-labelledby="intake-tab-scan" hidden={mode !== 'scan'} tabIndex={0}>
        {canScan ? <>
          {mode === 'scan' && <LiveScanIntake />}
          <PhotoScanIntake />
          <button type="button" className="linklike intake-search-instead" onClick={searchInstead}>Search by name or number</button>
        </> : (
          <section className="panel intake-panel intake-scan-access">
            <h2 className="intake-heading">Scan cards</h2>
            <div className="intake-scan-methods">
              <div><IntakeIcon name="scan" /><strong>Live camera</strong><p>Point your camera at one card at a time.</p></div>
              <div><IntakeIcon name="import" /><strong>Upload photos</strong><p>Review matches from photos of your cards.</p></div>
            </div>
            <p className="intake-description">Sign in to use either scanner and sync your additions to your Vault.</p>
            <div className="intake-scan-access-actions">
              <button type="button" className="btn" onClick={onSignIn}>Sign in to scan</button>
              <button type="button" className="btn quiet" onClick={searchInstead}>Search by name or number</button>
            </div>
          </section>
        )}
      </div>
      <div id="intake-panel-starter" role="tabpanel" aria-labelledby="intake-tab-starter" hidden={mode !== 'starter'} tabIndex={0}>
        {justAdded && <StarterAddedBanner added={justAdded} onDismiss={() => setJustAdded(null)} goPrices={() => { window.location.hash = '/prices'; }} />}
        <section className="panel intake-panel">
          <h2 className="intake-heading">Add a starter deck</h2>
          <p className="intake-description">Log all 43 cards from your starter. Choose Retail or Beta to record the right printings.</p>
          <StarterIntake onAdded={setJustAdded} compact disabled={!collectionReady} />
        </section>
      </div>
      <div id="intake-panel-import" role="tabpanel" aria-labelledby="intake-tab-import" hidden={mode !== 'import'} tabIndex={0}>
        <VaultFileIntake />
      </div>
    </section>
  );
}
