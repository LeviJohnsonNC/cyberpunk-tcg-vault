// "Built from your vault": deterministic auto-builder (instant, local) plus optional AI refinement (signed in).
import { useMemo, useState } from 'react';
import { VaultSelect } from './VaultSelect';
import { BY_SLUG, COLORS, type Color } from '../lib/data';
import { money, estimateText, moneyOr } from '../lib/currency';
import { autobuild, type Build, type Style } from '../lib/autobuild';
import { newId, useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { CardImg, Pip } from './bits';
import { RefinePanel, refineKey, type RefineResult } from './RefinePanel';
import { PENDING_DECK_KEY, openPlanner } from '../lib/handoff';

const STYLES: { id: Style; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggro', label: 'Aggro' },
  { id: 'control', label: 'Control' },
];

function upgradeEstimate(ups: Build['upgrades']) {
  return {
    knownCad: ups.reduce((a, u) => a + (u.quote ? u.quote.cad * u.add : 0), 0),
    unpriced: ups.reduce((a, u) => a + (u.quote ? 0 : u.add), 0),
    copies: ups.reduce((a, u) => a + u.add, 0),
  };
}

function shortName(slug: string) {
  return BY_SLUG.get(slug)?.name ?? slug;
}

export function VaultBuilds({ onOpen, openPending, goAdd }: { onOpen: (slug: string) => void; openPending: () => void; goAdd: () => void }) {
  const { owned, mode, demo, startDemo } = useStore();
  const [refining, setRefining] = useState<Build | null>(null);
  const canRefine = mode === 'cloud' && !demo;
  const [colors, setColors] = useState<Color[]>([]);
  const [style, setStyle] = useState<Style>('balanced');
  const [must, setMust] = useState<string[]>([]);

  const ownedOptions = useMemo(
    () =>
      [...owned.keys()]
        .map((s) => BY_SLUG.get(s))
        .filter((c) => c && c.ram != null && (c.text || c.type === 'Legend'))
        .sort((a, b) => a!.display.localeCompare(b!.display)),
    [owned],
  );
  const result = useMemo(() => autobuild(owned, { colors, style, mustInclude: must }), [owned, colors, style, must]);

  const open = (b: { legends: string[]; cards: Record<string, number> }, ai?: RefineResult) => {
    const notes = ai
      ? ['Refined with AI from a Vault auto-build.', ai.summary, ...ai.plan.map((p, i) => `${i + 1}. ${p}`), ai.mulligan && `Mulligan: ${ai.mulligan}`]
          .filter(Boolean)
          .join('\n')
      : 'Built by the Vault auto-builder from your collection.';
    const deck = {
      id: newId(),
      name: `${ai ? 'AI' : 'Vault'}: ${b.legends.map(shortName).join(' / ')}`.slice(0, 80),
      legends: b.legends,
      cards: b.cards,
      sideboard: {},
      notes,
      updatedAt: '',
    };
    try {
      sessionStorage.setItem(PENDING_DECK_KEY, JSON.stringify(deck));
    } catch {
      /* storage blocked: builder will just open empty */
    }
    openPending();
  };

  return (
    <section className="panel hot vault-builds" aria-labelledby="vault-builds-title">
      <div className="panel-title" id="vault-builds-title">
        Built from your vault <span className="aside">Instant · uses only cards you own</span>
      </div>
      <div className="toolbar" role="group" aria-label="Auto-build options">
        <div className="chips" role="group" aria-label="Allowed colours">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`chip c-${c} ${colors.includes(c) ? 'on' : ''}`}
              aria-pressed={colors.includes(c)}
              onClick={() => setColors((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Play style">
          {STYLES.map((s) => (
            <button key={s.id} className="chip" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor="vault-must">Must include a card</label>
        <VaultSelect
          id="vault-must"
          value=""
          placeholder={must.length >= 2 ? 'Max 2 must-includes' : 'Must include… (optional)'}
          disabled={must.length >= 2 || ownedOptions.length === 0}
          onValueChange={(value) => setMust((m) => [...m, value].slice(0, 2))}
          options={ownedOptions.filter((c) => !must.includes(c!.slug)).map((c) => ({ value: c!.slug, label: c!.display }))}
        />
        {must.map((s) => (
          <button key={s} className="chip on" onClick={() => setMust((m) => m.filter((x) => x !== s))} aria-label={`Remove ${BY_SLUG.get(s)?.display}`}>
            {shortName(s)} ×
          </button>
        ))}
      </div>

      {!result.ok ? (
        <div className="callout y">
          <p style={{ margin: '0 0 8px' }}>{result.message}</p>
          {result.reason === 'need-legends' && result.suggestions.length > 0 && (
            <p className="tiny" style={{ margin: '0 0 8px' }}>
              Good-value Legends to pick up:{' '}
              {result.suggestions.map((s, i) => (
                <span key={s.slug}>
                  {i > 0 && ', '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onOpen(s.slug); }}>{BY_SLUG.get(s.slug)?.display}</a> ({moneyOr(s.quote?.cad)})
                </span>
              ))}
            </p>
          )}
          <div className="row">
            <button className="btn quiet sm" onClick={goAdd}>Add cards</button>
            {owned.size === 0 && !demo && <button className="btn ghost sm" onClick={startDemo}>Try the demo</button>}
            {(colors.length > 0 || must.length > 0) && (
              <button className="btn quiet sm" onClick={() => { setColors([]); setMust([]); }}>Clear options</button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Tried {result.considered} Legend {result.considered === 1 ? 'crew' : 'crews'} from your collection and kept the best {result.builds.length}. Scores come from
            curated card ratings plus Legend synergy. They&apos;re a strong starting point, not a solved list. <a href="#/about">How this works</a>
          </p>
          <div className="grid cols-3">
            {result.builds.map((b, i) => (
              <article key={b.legends.join()} className="vault-build" aria-label={`Build ${i + 1}`}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="label accent">{i === 0 ? 'Best fit' : `Option ${i + 1}`}</span>
                  <span className="spacer" />
                  {b.colors.map((c) => <Pip key={c} color={c} bare />)}
                  <span className="badge">Score {Math.round(b.score)}</span>
                </div>
                <div className="legend-row">
                  {b.legends.map((s) => (
                    <button key={s} onClick={() => onOpen(s)} title={BY_SLUG.get(s)?.display} aria-label={`Open ${BY_SLUG.get(s)?.display}`}>
                      <CardImg className="noart" slug={s} alt="" />
                    </button>
                  ))}
                </div>
                <h3 className="vault-build-title">{b.legends.map(shortName).join(' · ')}</h3>
                <div className="stat-line">
                  Units <b>{b.stats.units}</b> · Sellable <b>{b.stats.sellable}</b> · Removal <b>{b.stats.removal}</b> · Avg cost <b>{b.stats.avgCost.toFixed(2)}</b>
                </div>
                <div className="tiny">
                  <span className="label">Key cards</span>{' '}
                  {b.highlights.map((s, j) => (
                    <span key={s}>
                      {j > 0 && ', '}
                      <a href="#" onClick={(e) => { e.preventDefault(); onOpen(s); }}>{shortName(s)}</a>
                    </span>
                  ))}
                </div>
                {b.notes.length > 0 && <div className="tiny weak">{b.notes.join(' ')}</div>}
                {b.upgrades.length > 0 && (
                  <details className="vault-upgrades">
                    <summary>Upgrades to buy ({estimateText(upgradeEstimate(b.upgrades))})</summary>
                    <ul>
                      {b.upgrades.map((u) => (
                        <li key={u.slug + (u.replaces ?? '')}>
                          +{u.add} <a href="#" onClick={(e) => { e.preventDefault(); onOpen(u.slug); }}>{shortName(u.slug)}</a>
                          {u.replaces && <span className="muted"> for {shortName(u.replaces)}</span>} <span className="num">{u.quote ? money(u.quote.cad * u.add) : 'Unpriced'}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="row" style={{ marginTop: 'auto' }}>
                  <button className="btn sm" onClick={() => open(b)}>Open in builder</button>
                  <button
                    className="btn ghost sm"
                    onClick={() => openPlanner({ name: `Vault: ${b.legends.map(shortName).join(' / ')}`.slice(0, 80), kind: 'generated', legends: b.legends, cards: b.cards })}
                  >
                    Upgrade
                  </button>
                  {canRefine ? (
                    <button
                      className="btn quiet sm"
                      aria-pressed={refining === b}
                      onClick={() => setRefining(b)}
                      disabled={refining != null && refineKey(refining, style, must) === refineKey(b, style, must)}
                    >
                      Refine with AI
                    </button>
                  ) : demo ? (
                    <span className="vault-ai-hint">AI refine works on your own cards</span>
                  ) : supabase ? (
                    <span className="vault-ai-hint">Sign in to refine with AI</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {refining && result.builds.includes(refining) && (
            <RefinePanel
              key={refineKey(refining, style, must)}
              build={refining}
              style={style}
              must={must}
              onOpen={onOpen}
              onOpenDeck={(r) => open(r, r)}
              onClose={() => setRefining(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
