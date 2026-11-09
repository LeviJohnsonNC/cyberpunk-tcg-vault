import { useRef, useState } from 'react';
import { Masthead } from '../components/ui';
import { VaultBuilds } from '../components/VaultBuilds';
import { CuratedDecks } from './CuratedDecks';
import { MetaLearn } from './MetaLearn';
import './meta-intel.css';

const VIEWS = [
  { id: 'build', label: 'Build from my cards' },
  { id: 'curated', label: 'Curated decks' },
  { id: 'learn', label: 'Learn' },
] as const;

type View = (typeof VIEWS)[number]['id'];

export function MetaIntel({ onOpen, openInBuilder, goAdd }: { onOpen: (slug: string) => void; openInBuilder: (id: string) => void; goAdd: () => void }) {
  const [view, setView] = useState<View>('build');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <section className="meta-intel">
      <Masthead eyebrow="The Afterlife / Fixer's Notes" title="Meta Intel" />
      <div className="meta-tabs" role="tablist" aria-label="Meta Intel views">
        {VIEWS.map(({ id, label }, index) => (
          <button key={id} type="button" role="tab" id={`meta-tab-${id}`} aria-controls={`meta-panel-${id}`}
            aria-selected={view === id} tabIndex={view === id ? 0 : -1}
            ref={(node) => { tabs.current[index] = node; }}
            onClick={() => setView(id)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + step + VIEWS.length) % VIEWS.length;
              setView(VIEWS[next].id);
              tabs.current[next]?.focus();
            }}>
            {label}
          </button>
        ))}
      </div>
      <div id="meta-panel-build" role="tabpanel" aria-labelledby="meta-tab-build" tabIndex={0} hidden={view !== 'build'}>
        <VaultBuilds onOpen={onOpen} goAdd={goAdd} />
      </div>
      <div id="meta-panel-curated" role="tabpanel" aria-labelledby="meta-tab-curated" tabIndex={0} hidden={view !== 'curated'}>
        <CuratedDecks onOpen={onOpen} openInBuilder={openInBuilder} />
      </div>
      <div id="meta-panel-learn" role="tabpanel" aria-labelledby="meta-tab-learn" tabIndex={0} hidden={view !== 'learn'}>
        <MetaLearn />
      </div>
    </section>
  );
}
