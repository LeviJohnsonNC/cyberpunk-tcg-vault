import { useMemo, useState } from 'react';
import { BY_SLUG, COLORS, RECOMMENDED, type Color } from '../lib/data';
import { estimateText } from '../lib/currency';
import { useStore } from '../lib/store';
import { CardImg, Pip } from '../components/bits';
import { Masthead } from '../components/ui';
import { VaultBuilds } from '../components/VaultBuilds';
import { CLOSE_THRESHOLD, completion, deckFromRecommended, matchesFilter, validate, type BuildFilter, costRank } from '../lib/decks';

const CARD_COLOR: Record<string, string> = {
  Yellow: 'var(--color-card-yellow)',
  Blue: 'var(--color-card-blue)',
  Red: 'var(--color-card-red)',
  Green: 'var(--color-card-green)',
};
const LEGEND_PICKS: [string, string, number][] = [
  ['River Ward', 'Yellow', 27.8],
  ['Judy Álvarez', 'Blue', 23.5],
  ['Alt Cunningham', 'Blue', 20.3],
  ['Hanako Arasaka', 'Green', 19.8],
  ['V: Streetkid', 'Red', 15.1],
  ['Dum Dum', 'Yellow', 15.1],
];
const COMBOS: [string, number][] = [
  ['Red / Yellow', 20.5],
  ['Blue / Green', 13.3],
  ['Green / Red', 11.9],
  ['Blue / Red', 11.0],
  ['Mono Yellow', 9.5],
  ['Mono Blue', 9.2],
];
const IDENTITY: { color: Color; title: string; body: string }[] = [
  { color: 'Red', title: 'Maximize, overpower', body: 'The biggest bodies and the most direct removal. Pushes Gigs to 8+ to discount Carnage and Octant, and turns fights into extra steals. Weak to being out-tempoed early.' },
  { color: 'Yellow', title: 'Diverge, equip, repurpose', body: 'Efficient Units carrying cheap Cyberware that draws, adjusts Gigs to different values and doubles steals. River Ward and Viktor find and deploy Gear. Little interaction on the Rival’s turn.' },
  { color: 'Green', title: 'Align, outnumber', body: 'Rewards value-pairs of Gigs and even Street Cred. Spends rival Units, goes wide with Nomads, and has haste via Adrenaline. Needs careful Gig planning.' },
  { color: 'Blue', title: 'Minimize, hack, disable', body: 'Pushes your own Gigs to their minimum for draw and keeps Street Cred low (unblockable MT0D12, double Towerfall). The best Quick interaction in the game.' },
];
const KIND_LABEL = { budget: 'Budget', meta: 'Community meta', brew: 'Brew' } as const;
const LS_KEY = 'cptv.meta.filters.v1';

type SortKey = 'fit' | 'cost' | 'name';
interface Filters {
  build: BuildFilter;
  colors: Color[];
  sort: SortKey;
}
const loadFilters = (): Filters => {
  try {
    return { build: 'all', colors: [], sort: 'fit', ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
  } catch {
    return { build: 'all', colors: [], sort: 'fit' };
  }
};

export function MetaIntel({ onOpen, openInBuilder, goAdd }: { onOpen: (slug: string) => void; openInBuilder: (id: string) => void; goAdd: () => void }) {
  const { owned, entries } = useStore();
  const [f, setF] = useState<Filters>(loadFilters);
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };

  const scored = useMemo(
    () => RECOMMENDED.map((d) => ({ d, c: completion(d, owned), legal: validate(deckFromRecommended(d.id)!).legal })),
    [owned],
  );
  const shown = scored
    .filter(({ d, c }) => matchesFilter(c, f.build) && (f.colors.length === 0 || d.colors.some((x) => f.colors.includes(x))))
    .sort((a, b) =>
      f.sort === 'name'
        ? a.d.name.localeCompare(b.d.name)
        : f.sort === 'cost'
          ? costRank(a.c.estimate) - costRank(b.c.estimate) || b.c.pct - a.c.pct
          : b.c.pct - a.c.pct || costRank(a.c.estimate) - costRank(b.c.estimate),
    );
  const closest = [...scored].sort((a, b) => b.c.pct - a.c.pct)[0];
  const buildLabel: Record<BuildFilter, string> = { all: 'All decks', close: `${CLOSE_THRESHOLD}%+ owned`, owned: 'Fully owned' };

  return (
    <section>
      <Masthead
        eyebrow="The Afterlife / Fixer's Notes"
        title="Meta Intel"
        sub={<>How it plays <span className="sep" aria-hidden="true">◆</span> early data <span className="sep" aria-hidden="true">◆</span> {RECOMMENDED.length} decks scored against your vault</>}
      />

      <div className="callout section-gap" style={{ marginBottom: 16 }}>
        <b>Honest read:</b> sanctioned constructed play only started on Nov 6, 2026, and the first Edgerunner Open Regional
        (Chicago) is Dec 11-13. There is no tournament-proven tier list yet. The data below is deck-building popularity, and the
        decks are adapted from WeirdCo team concepts and popular community lists, each labelled with its source and our confidence.
        Expect it to shift once results come in.
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="panel hot">
          <div className="panel-title">How it plays</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
            <li><b>Win:</b> start your turn with <b>7 Gigs</b> (dice). You only own 6, so you must steal. After turn 7 it&apos;s overtime: first to hold a majority wins.</li>
            <li><b>Stealing:</b> attack the Rival&apos;s Gig area. 1-9 power steals 1 Gig, 10-19 steals 2, 20+ steals 3. Power 0 steals nothing.</li>
            <li><b>Eddies (€$):</b> sell one card with a sell tag (Gear and Programs) per turn. Each Legend can also be spent for 1 €$.</li>
            <li><b>Combat:</b> attacking spends your Unit, and only spent Units can be attacked. Blockers redirect attacks. Quick cards fire on the Rival&apos;s turn.</li>
            <li><b>Legends:</b> Call one per turn (1 €$, flip face-up). Go Solo Legends become an attacker that can hit the same turn.</li>
          </ul>
        </div>
        <div className="panel">
          <div className="panel-title">Most-picked Legends <span className="aside">716 public decks, Sep 2026</span></div>
          {LEGEND_PICKS.map(([n, c, p]) => (
            <div className="hbar" key={n}>
              <span className="tiny"><Pip color={c} bare /> {n}</span>
              <span className="track" role="img" aria-label={`${p}% of decks`}><div style={{ width: `${(p / 30) * 100}%`, background: CARD_COLOR[c] }} /></span>
              <span className="num">{p}%</span>
            </div>
          ))}
          <p className="tiny muted" style={{ marginBottom: 0 }}>Source: official deck builder data compiled by Mythras (gamertagmythras.com).</p>
        </div>
        <div className="panel">
          <div className="panel-title">Colour pairings</div>
          {COMBOS.map(([n, p]) => (
            <div className="hbar" key={n}>
              <span className="tiny">{n}</span>
              <span className="track" role="img" aria-label={`${p}% of decks`}><div style={{ width: `${(p / 22) * 100}%` }} /></span>
              <span className="num">{p}%</span>
            </div>
          ))}
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Early tier lists (tcgcontender.com, Nov 2026) put Adam Smasher / Dum Dum / V: Streetkid Red/Yellow on top.
          </p>
        </div>
      </div>

      <div className="grid cols-4">
        {IDENTITY.map((x) => (
          <div className="panel" key={x.color}>
            <div className="panel-title" style={{ fontSize: 19 }}><Pip color={x.color} bare /> {x.color}</div>
            <div className="label accent" style={{ marginBottom: 6 }}>{x.title}</div>
            <p className="tiny" style={{ margin: 0, lineHeight: 1.5 }}>{x.body}</p>
          </div>
        ))}
      </div>

      <div className="subhead">
        <h2>Your decks</h2>
        <p>Built from the cards you own right now.</p>
      </div>
      <VaultBuilds onOpen={onOpen} openPending={() => openInBuilder('__pending')} goAdd={goAdd} />

      <div className="subhead">
        <h2>Meta decks</h2>
        <p>Curated lists. Completion and cost to finish update live against your vault.</p>
      </div>
      <div className="toolbar" role="group" aria-label="Deck filters">
        <span className="label">Show</span>
        <div className="chips" role="group" aria-label="Build status">
          {(['all', 'close', 'owned'] as BuildFilter[]).map((b) => (
            <button key={b} className="chip" aria-pressed={f.build === b} onClick={() => set({ build: b })}>{buildLabel[b]}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Colours">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`chip c-${c} ${f.colors.includes(c) ? 'on' : ''}`}
              aria-pressed={f.colors.includes(c)}
              onClick={() => set({ colors: f.colors.includes(c) ? f.colors.filter((x) => x !== c) : [...f.colors, c] })}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="sr-only" htmlFor="meta-sort">Sort decks</label>
        <select id="meta-sort" className="select" value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          <option value="fit">Sort: best fit for my vault</option>
          <option value="cost">Sort: cheapest to finish</option>
          <option value="name">Sort: name</option>
        </select>
        <span className="label" aria-live="polite">{shown.length} of {RECOMMENDED.length}</span>
      </div>

      {shown.length === 0 ? (
        <div className="callout y">
          <p style={{ margin: '0 0 8px' }}>
            {entries.length === 0
              ? 'Your vault is empty, so nothing matches yet. Add cards, or show all decks to browse.'
              : `No deck matches those filters yet. Closest: ${closest.d.name} at ${closest.c.pct}% owned, ${estimateText(closest.c.estimate)} to finish.`}
          </p>
          <button className="btn quiet sm" onClick={() => set({ build: 'all', colors: [] })}>Show all decks</button>
        </div>
      ) : (
        <div className="grid cols-2">
          {shown.map(({ d, c, legal }) => {
            const base = d.base ? RECOMMENDED.find((x) => x.id === d.base)?.name : null;
            return (
              <article key={d.id} className={`panel deck-card ${c.have === c.total ? 'hot' : ''}`} aria-labelledby={`deck-${d.id}`}>
                <div className="row">
                  <div style={{ minWidth: 0 }}>
                    <div className="arch">{KIND_LABEL[d.kind]}{base ? ` · upgrade of ${base}` : ''} · {d.archetype}</div>
                    <h3 id={`deck-${d.id}`}>{d.name}</h3>
                  </div>
                  <span className="spacer" />
                  {d.colors.map((col) => <Pip key={col} color={col} bare />)}
                  <span className={`badge ${legal ? 'ok' : 'low'}`}>{legal ? 'Legal' : 'Check'}</span>
                  <span className="badge">Confidence: {d.confidence}</span>
                </div>
                <div className="legend-row">
                  {d.legends.map((s) => (
                    <button key={s} onClick={() => onOpen(s)} title={BY_SLUG.get(s)?.display} aria-label={`Open ${BY_SLUG.get(s)?.display}`}>
                      <CardImg className="noart" slug={s} alt="" />
                    </button>
                  ))}
                  <div className="completion">
                    <div className="stat-line">You own <b>{c.have}/{c.total}</b> ({c.pct}%)</div>
                    <div className="track" role="img" aria-label={`${c.pct}% owned`}>
                      <div className={c.have === c.total ? 'done' : ''} style={{ width: `${c.pct}%` }} />
                    </div>
                    <div className="stat-line">To finish <b className={c.estimate.copies ? (c.estimate.unpriced ? 'weak' : '') : 'good'}>{estimateText(c.estimate)}</b></div>
                    <button className="btn sm" onClick={() => openInBuilder(d.id)}>Open in builder</button>
                  </div>
                </div>
                <p>{d.summary}</p>
                <div>
                  <div className="group-h">Game plan</div>
                  <ol>{d.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
                </div>
                <div>
                  <div className="group-h">Key cards</div>
                  <ul>
                    {d.keyCards.map((k) => (
                      <li key={k.slug}>
                        <a href="#" onClick={(e) => { e.preventDefault(); onOpen(k.slug); }}>{BY_SLUG.get(k.slug)?.display}</a>: {k.why}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="tiny"><span className="label">Mulligan</span> {d.mulligan}</div>
                <div className="tiny weak"><span className="label danger-text">Weak spots</span> {d.weaknesses}</div>
                <div className="tiny faint"><span className="label">Source</span> {d.source}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
