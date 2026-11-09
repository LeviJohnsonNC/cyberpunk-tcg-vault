// Deterministic auto-builds and optional AI refinement of a selected build.
import { useMemo, useRef, useState } from 'react';
import { VaultSelect } from './VaultSelect';
import { BY_SLUG, CARDS, COLORS, type Color } from '../lib/data';
import { money, estimateText, moneyOr } from '../lib/currency';
import { autobuild, type Build, type Style } from '../lib/autobuild';
import { newId, useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { CardImg, Pip } from './bits';
import { RefinePanel, refineKey, type RefineResult } from './RefinePanel';
import { openInBuilder, openPlanner } from '../lib/handoff';

const STYLES: { id: Style; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggro', label: 'Aggro' },
  { id: 'control', label: 'Control' },
];

const legendNameCounts = new Map<string, number>();
for (const card of CARDS) {
  if (card.type === 'Legend') legendNameCounts.set(card.name, (legendNameCounts.get(card.name) ?? 0) + 1);
}
const shortName = (slug: string) => BY_SLUG.get(slug)?.name ?? slug;
const crewKey = (build: Build) => build.legends.join('/');

function CrewName({ legends }: { legends: string[] }) {
  return legends.map((slug, index) => {
    const card = BY_SLUG.get(slug);
    const name = card?.name ?? slug;
    return <span key={slug}>{index > 0 && <span className="meta-crew-divider"> / </span>}<span className="meta-legend-name">{name}</span>
      {card?.sub && (legendNameCounts.get(name) ?? 0) > 1 && <small> · {card.sub}</small>}
    </span>;
  });
}

function upgradeEstimate(ups: Build['upgrades']) {
  return {
    knownCad: ups.reduce((a, u) => a + (u.quote ? u.quote.cad * u.add : 0), 0),
    unpriced: ups.reduce((a, u) => a + (u.quote ? 0 : u.add), 0),
    copies: ups.reduce((a, u) => a + u.add, 0),
  };
}

export function VaultBuilds({ onOpen, goAdd }: { onOpen: (slug: string) => void; goAdd: () => void }) {
  const { owned, mode, demo, startDemo, collectionReady, collectionError, retryCollection } = useStore();
  const [colors, setColors] = useState<Color[]>([]);
  const [style, setStyle] = useState<Style>('balanced');
  const [must, setMust] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [refining, setRefining] = useState<string>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const featureHeading = useRef<HTMLHeadingElement>(null);

  const ownedOptions = useMemo(
    () => [...owned.keys()]
      .flatMap((slug) => {
        const card = BY_SLUG.get(slug);
        return card?.legal === 'legal' && card.ram != null && (card.text || card.type === 'Legend') ? [card] : [];
      })
      .sort((a, b) => a.display.localeCompare(b.display)),
    [owned],
  );
  const required = useMemo(() => must.filter((slug) => ownedOptions.some((card) => card.slug === slug)), [must, ownedOptions]);
  const result = useMemo(() => collectionReady && owned.size ? autobuild(owned, { colors, style, mustInclude: required }) : null,
    [collectionReady, owned, colors, style, required]);
  const builds = result?.ok ? result.builds : [];
  const featured = builds.find((b) => crewKey(b) === selected) ?? builds[0];
  const activeRefineKey = featured && refineKey(featured, style, required);
  const showRefine = mode === 'cloud' && !demo && !!activeRefineKey && refining === activeRefineKey;
  const colorLabel = colors.length && colors.length < COLORS.length ? colors.join(', ') : 'All colours';

  const open = (b: { legends: string[]; cards: Record<string, number> }, ai?: RefineResult) => {
    const notes = ai
      ? ['Refined with AI from a Vault auto-build.', ai.summary, ...ai.plan.map((p, i) => `${i + 1}. ${p}`), ai.mulligan && `Mulligan: ${ai.mulligan}`]
        .filter(Boolean).join('\n')
      : 'Built by the Vault auto-builder from your collection.';
    openInBuilder({
      id: newId(),
      name: `${ai ? 'AI' : 'Vault'}: ${b.legends.map(shortName).join(' / ')}`.slice(0, 80),
      legends: b.legends,
      cards: b.cards,
      sideboard: {},
      notes,
      updatedAt: '',
    });
  };

  const resetOptions = () => {
    setColors([]);
    setMust([]);
    setStyle('balanced');
    setSelected(undefined);
    setRefining(undefined);
  };

  return (
    <section aria-labelledby="vault-builds-title">
      {collectionReady && owned.size > 0 ? (
        <header className="meta-section-head">
          <h2 id="vault-builds-title">{featured ? 'Ready to play' : 'Build from my cards'}</h2>
          <p>Built from cards you own</p>
          {featured && <span className="meta-build-count" role="status">{builds.length} suggested {builds.length === 1 ? 'build' : 'builds'}</span>}
        </header>
      ) : <h2 className="sr-only" id="vault-builds-title">Build from my cards</h2>}

      {!collectionReady ? (
        <div className="panel meta-state" role={collectionError ? 'alert' : 'status'}>
          <h3>{collectionError ? 'Couldn’t load your vault' : 'Loading your vault…'}</h3>
          <p>You can browse Curated decks and Learn in the meantime.</p>
          {collectionError && <button className="btn quiet" onClick={retryCollection}>Try again</button>}
        </div>
      ) : !owned.size ? (
        <div className="panel meta-state meta-start">
          <h3>Add your first cards</h3>
          <p>Log cards or a starter deck to see what you can build. You can also try a stocked sample Vault.</p>
          <div className="row">
            <button className="btn" onClick={goAdd}>Add cards</button>
            {!demo && <button className="btn ghost" onClick={startDemo}>Explore the sample Vault</button>}
          </div>
        </div>
      ) : (
        <>
          <button className="btn quiet meta-mobile-options" type="button" aria-controls="meta-build-options" aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen(!optionsOpen)}>
            <strong>Build options</strong>
            <span>{colorLabel} · {STYLES.find((item) => item.id === style)?.label}{required.length > 0 && ` · ${required.map((slug) => BY_SLUG.get(slug)?.display).join(', ')}`}</span>
          </button>
          <div id="meta-build-options" className="meta-build-options" role="group" aria-label="Build options" data-expanded={optionsOpen}>
            <div className="meta-option">
              <span className="meta-control-label" id="meta-allowed-label">Allowed colours</span>
              <details className="meta-colour-picker" onKeyDown={(event) => {
                if (event.key === 'Escape' && event.currentTarget.open) {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }
              }}>
                <summary aria-labelledby="meta-allowed-label meta-allowed-value"><span id="meta-allowed-value">{colorLabel}</span></summary>
                <div className="meta-colour-menu" role="group" aria-labelledby="meta-allowed-label">
                  <p>Choose one or more colours. Clear the selection to allow all colours.</p>
                  {COLORS.map((c) => (
                    <label key={c}><input type="checkbox" checked={colors.includes(c)}
                      onChange={() => setColors((current) => current.includes(c) ? current.filter((x) => x !== c) : [...current, c])} />
                      <Pip color={c} bare />{c}</label>
                  ))}
                  <button type="button" className="btn quiet sm" onClick={(event) => {
                    const picker = event.currentTarget.closest('details');
                    if (picker) picker.open = false;
                    picker?.querySelector('summary')?.focus();
                  }}>Done</button>
                </div>
              </details>
            </div>
            <div className="meta-option">
              <span className="meta-control-label" id="meta-style-label">Playstyle</span>
              <div className="meta-style-buttons" role="group" aria-labelledby="meta-style-label">
                {STYLES.map((s) => <button type="button" key={s.id} className="btn quiet" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</button>)}
              </div>
            </div>
            <div className="meta-option">
              <label className="meta-control-label" htmlFor="vault-must">Must include <span>· up to 2</span></label>
              <VaultSelect id="vault-must" value="" placeholder={required.length >= 2 ? 'Two cards selected' : 'Choose an owned card'}
                disabled={required.length >= 2 || ownedOptions.length === required.length}
                onValueChange={(slug) => setMust([...required, slug].slice(0, 2))}
                options={ownedOptions.filter((c) => !required.includes(c.slug)).map((c) => ({ value: c.slug, label: c.display }))} />
              {required.length > 0 && <div className="chips meta-required-cards">
                {required.map((slug) => <button key={slug} className="chip on" type="button" onClick={() => setMust(required.filter((s) => s !== slug))}
                  aria-label={`Remove ${BY_SLUG.get(slug)?.display}`}>{BY_SLUG.get(slug)?.display} <span aria-hidden="true">×</span></button>)}
              </div>}
            </div>
          </div>

          {result && !result.ok && (
            <div className="panel meta-state">
              <h3>No build fits yet</h3>
              <p role="status">{result.message}</p>
              {result.reason === 'need-legends' && result.suggestions.length > 0 && (
                <p className="tiny"><b>Good-value Legends to pick up</b>{' '}
                  {result.suggestions.map((s, i) => (
                    <span key={s.slug}>
                      {i > 0 && ', '}
                      <button className="linklike" type="button" onClick={() => onOpen(s.slug)}>{BY_SLUG.get(s.slug)?.display}</button> ({moneyOr(s.quote?.cad)})
                    </span>
                  ))}
                </p>
              )}
              <div className="row">
                <button className="btn" onClick={goAdd}>Add cards</button>
                {(colors.length > 0 || required.length > 0 || style !== 'balanced') && <button className="btn quiet" onClick={resetOptions}>Clear options</button>}
              </div>
            </div>
          )}

          {featured && result?.ok && (
            <>
              <article className="meta-feature" aria-labelledby="meta-feature-title">
                <span className="meta-feature-ticket">{featured === builds[0] ? 'Top suggestion' : `Suggestion ${builds.indexOf(featured) + 1}`}</span>
                <div className="meta-feature-main">
                  <div className="meta-feature-identity">
                    <h3 id="meta-feature-title" ref={featureHeading} tabIndex={-1}><CrewName legends={featured.legends} /></h3>
                    <div className="meta-deck-colours"><span aria-hidden="true">{featured.colors.map((c) => <Pip key={c} color={c} bare />)}</span> {featured.colors.join(' / ')}</div>
                    <p className="meta-feature-size">{featured.legends.length} Legends · {Object.values(featured.cards).reduce((sum, qty) => sum + qty, 0)} main-deck cards</p>
                    <span className="meta-owned-badge">Fully owned</span>
                  </div>
                  <div className="meta-feature-action">
                    <button className="btn meta-open-draft" type="button" onClick={() => open(featured)}>
                      Open draft<span> in Deck Builder</span>
                    </button>
                    <p>Edit and save in Deck Builder.</p>
                  </div>
                  <div className="meta-feature-art" aria-label="Legend cards">
                    {featured.legends.map((slug) => <button key={slug} type="button" aria-label={`Open ${BY_SLUG.get(slug)?.display}`}
                      title={BY_SLUG.get(slug)?.display} onClick={() => onOpen(slug)}><CardImg slug={slug} alt="" priority /></button>)}
                  </div>
                </div>
                <details key={crewKey(featured)} className="meta-build-details meta-disclosure">
                  <summary>Build details</summary>
                  <div className="meta-build-details-body">
                    <div>
                      <dl className="meta-build-stats">
                        <div><dt>Units</dt><dd>{featured.stats.units}</dd></div>
                        <div><dt>Sellable</dt><dd>{featured.stats.sellable}</dd></div>
                        <div><dt>Removal</dt><dd>{featured.stats.removal}</dd></div>
                        <div><dt>Avg cost</dt><dd>{featured.stats.avgCost.toFixed(2)}</dd></div>
                      </dl>
                      <p><b>Key cards</b>{' '}{featured.highlights.map((slug, index) => (
                        <span key={slug}>{index > 0 && ', '}<button className="linklike" type="button" onClick={() => onOpen(slug)}>{shortName(slug)}</button></span>
                      ))}</p>
                      {featured.notes.length > 0 && <p>{featured.notes.join(' ')}</p>}
                      <p className="tiny muted">Fit score {Math.round(featured.score)} uses curated card ratings, Legend synergy, and deck composition.
                        Considered {result.considered} Legend {result.considered === 1 ? 'crew' : 'crews'}. <a href="#/about">How this works</a>
                      </p>
                    </div>
                    <div>
                      {featured.upgrades.length > 0 && <details className="meta-disclosure meta-purchases">
                        <summary>Suggested purchases <small>{estimateText(upgradeEstimate(featured.upgrades))}</small></summary>
                        <ul>{featured.upgrades.map((u) => (
                          <li key={u.slug + (u.replaces ?? '')}>
                            +{u.add} <button className="linklike" type="button" onClick={() => onOpen(u.slug)}>{shortName(u.slug)}</button>
                            {u.replaces && <span className="muted"> for {shortName(u.replaces)}</span>} <span className="num">{u.quote ? money(u.quote.cad * u.add) : 'Unpriced'}</span>
                          </li>
                        ))}</ul>
                      </details>}
                      <div className="row meta-secondary-actions">
                        <button className="btn ghost sm" type="button" onClick={() => openPlanner({
                          name: `Vault: ${featured.legends.map(shortName).join(' / ')}`.slice(0, 80),
                          kind: 'generated', legends: featured.legends, cards: featured.cards,
                        })}>Plan upgrades</button>
                        {mode === 'cloud' && !demo ? (
                          <button className="btn quiet sm" type="button" aria-expanded={showRefine}
                            onClick={() => setRefining(showRefine ? undefined : activeRefineKey)}>Refine with AI</button>
                        ) : (demo || supabase) && (
                          <span className="tiny muted">{demo ? 'AI refinement is available for your own cards' : 'Sign in to refine with AI'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {showRefine && <RefinePanel key={activeRefineKey} build={featured} style={style} must={required} onOpen={onOpen}
                    onOpenDeck={(deck) => open(deck, deck)} onClose={() => setRefining(undefined)} />}
                </details>
              </article>
              {builds.length > 1 && <ul className="meta-alternatives" aria-label="Other suggested builds">
                {builds.filter((b) => b !== featured).map((build) => (
                  <li key={crewKey(build)}>
                    <button type="button" onClick={() => {
                      setSelected(crewKey(build));
                      setRefining(undefined);
                      requestAnimationFrame(() => featureHeading.current?.focus());
                    }}>
                      <span className="meta-alternative-pips" aria-label={build.colors.join(' and ')}>{build.colors.map((c) => <Pip key={c} color={c} bare />)}</span>
                      <span className="meta-alternative-crew"><CrewName legends={build.legends} /></span>
                      <span className="meta-view-build">View build <span aria-hidden="true">›</span></span>
                    </button>
                  </li>
                ))}
              </ul>}
            </>
          )}
        </>
      )}
    </section>
  );
}
