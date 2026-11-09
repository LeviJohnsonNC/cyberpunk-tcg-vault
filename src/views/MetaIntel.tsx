import { useState } from 'react';
import { Masthead, ViewTabs } from '../components/ui';
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

  return (
    <section className="meta-intel">
      <Masthead eyebrow="The Afterlife / Fixer's Notes" title="Meta Intel" />
      <ViewTabs id="meta" label="Meta Intel views" tabs={VIEWS} value={view} onChange={setView} className="meta-tabs" />
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
