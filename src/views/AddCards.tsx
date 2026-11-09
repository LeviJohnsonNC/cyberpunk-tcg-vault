import { useRef, useState } from 'react';
import { IntakeIcon } from '../components/IntakeIcon';
import { StarterAddedBanner, StarterIntake, type StarterAdded } from '../components/StarterIntake';
import { Masthead } from '../components/ui';
import { useStore } from '../lib/store';
import { CardSearchIntake } from './CardSearchIntake';
import { PhotoScanIntake } from './PhotoScanIntake';
import { VaultFileIntake } from './VaultFileIntake';
import './intake.css';

const MODES = [
  { id: 'search', label: 'Search' },
  { id: 'scan', label: 'Photo Scan' },
  { id: 'starter', label: 'Starter Decks' },
  { id: 'import', label: 'Import File' },
] as const;
type Mode = (typeof MODES)[number]['id'];

export function AddCards({ onOpen }: { onOpen: (slug: string, printingId?: string, identify?: boolean) => void }) {
  const { decks, owned, collectionReady, collectionError, retryCollection } = useStore();
  const [mode, setMode] = useState<Mode>('search');
  const [justAdded, setJustAdded] = useState<StarterAdded | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = [...owned.values()].reduce((total, qty) => total + qty, 0);

  return (
    <section className="intake">
      <Masthead eyebrow="The Afterlife / Intake" title="Add Cards">
        <a className="intake-vault" href="#/collection">
          <span>Vault</span><IntakeIcon name="stack" />
          {collectionReady ? `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'} · ${count} ${count === 1 ? 'card' : 'cards'}` : 'Open collection'}
        </a>
      </Masthead>

      <div className="intake-tabs" role="tablist" aria-label="Add cards methods">
        {MODES.map(({ id, label }, index) => (
          <button key={id} type="button" role="tab" id={`intake-tab-${id}`} aria-controls={`intake-panel-${id}`}
            aria-selected={mode === id} tabIndex={mode === id ? 0 : -1}
            ref={(node) => { tabs.current[index] = node; }}
            onClick={() => setMode(id)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? MODES.length - 1 : (index + step + MODES.length) % MODES.length;
              setMode(MODES[next].id);
              tabs.current[next]?.focus();
            }}>
            <IntakeIcon name={id} /> {label}
          </button>
        ))}
      </div>

      {!collectionReady && (
        <div className="callout y intake-loading" role={collectionError ? 'alert' : 'status'}>
          {collectionError ? <>The collection couldn’t be loaded. <button className="linklike" onClick={retryCollection}>Retry</button></> : 'Loading your collection…'}
        </div>
      )}

      <div id="intake-panel-search" role="tabpanel" aria-labelledby="intake-tab-search" hidden={mode !== 'search'}>
        <CardSearchIntake onOpen={onOpen} />
      </div>
      <div id="intake-panel-scan" role="tabpanel" aria-labelledby="intake-tab-scan" hidden={mode !== 'scan'} tabIndex={0}>
        <PhotoScanIntake />
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
