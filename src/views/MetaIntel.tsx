import { BY_SLUG, RECOMMENDED, cad, refPrice } from '../lib/data';
import { useStore } from '../lib/store';
import { CardImg, Pip } from '../components/bits';
import { validate, deckFromRecommended } from './DeckBuilder';

const LEGEND_PICKS: [string, string, number][] = [
  ['River Ward: Detective on the Hunt', 'Yellow', 27.8],
  ['Judy Álvarez: Braindance Maestro', 'Blue', 23.5],
  ['Alt Cunningham: Soulkiller Architect', 'Blue', 20.3],
  ['Hanako Arasaka: Daughter of the Emperor', 'Green', 19.8],
  ['V: Streetkid', 'Red', 15.1],
  ['Dum Dum: Maelstrom Triggerman', 'Yellow', 15.1],
];
const COMBOS: [string, number][] = [
  ['Red / Yellow', 20.5],
  ['Blue / Green', 13.3],
  ['Green / Red', 11.9],
  ['Blue / Red', 11.0],
  ['Mono Yellow', 9.5],
  ['Mono Blue', 9.2],
];

export function MetaIntel({ onOpen, openInBuilder }: { onOpen: (slug: string) => void; openInBuilder: (id: string) => void }) {
  const { owned } = useStore();

  const completion = (id: string) => {
    const d = RECOMMENDED.find((x) => x.id === id)!;
    const need: Record<string, number> = { ...d.cards };
    for (const l of d.legends) need[l] = (need[l] ?? 0) + 1;
    let have = 0, total = 0, cost = 0;
    for (const [s, n] of Object.entries(need)) {
      const h = Math.min(n, owned.get(s) ?? 0);
      have += h;
      total += n;
      cost += (n - h) * refPrice(s);
    }
    return { have, total, cost };
  };

  return (
    <section>
      <div className="section-head">
        <h2>Meta Intel</h2>
        <p>How the game plays, what the early data says, and five Yellow and Blue decks ranked against your collection.</p>
      </div>

      <div className="callout" style={{ marginBottom: 16 }}>
        <b>Honest read:</b> sanctioned constructed play only started on Nov 6, 2026, and the first Edgerunner Open Regional
        (Chicago) is Dec 11-13. There is no tournament-proven tier list yet. The data below is deck-building popularity, not
        win rates. The deck recommendations are reasoned from card efficiency and colour identity, and labelled with a
        confidence level. Expect them to shift once results come in.
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="panel hot">
          <div className="panel-title">How it plays</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
            <li><b>Win:</b> start your turn with <b>7 Gigs</b> (dice). You only own 6, so you must steal. After turn 7 it's overtime: first to hold a majority wins.</li>
            <li><b>Stealing:</b> attack the Rival's Gig area. 1-9 power steals 1 Gig, 10-19 steals 2, 20+ steals 3. Power 0 steals nothing.</li>
            <li><b>Eddies (€$):</b> sell one card with a sell tag (Gear and Programs) per turn. Each Legend can also be spent for 1 €$.</li>
            <li><b>Combat:</b> attacking spends your Unit, and only spent Units can be attacked. Blockers redirect attacks. Quick cards fire on the Rival's turn.</li>
            <li><b>Legends:</b> Call one per turn (1 €$, flip face-up). Go Solo Legends become an 8-power attacker that can hit the same turn.</li>
          </ul>
        </div>
        <div className="panel">
          <div className="panel-title">Most-picked Legends <span className="aside">716 public decks, Sep 2026</span></div>
          {LEGEND_PICKS.map(([n, c, p]) => (
            <div className="hbar" key={n} style={{ gridTemplateColumns: '1fr 70px 52px' }}>
              <span className="tiny"><Pip color={c} bare /> {n.split(':')[0]}</span>
              <div className="track"><div style={{ width: `${(p / 30) * 100}%`, background: c === 'Yellow' ? 'var(--c-yellow)' : c === 'Blue' ? 'var(--c-blue)' : c === 'Red' ? 'var(--c-red)' : 'var(--c-green)' }} /></div>
              <span className="num tiny">{p}%</span>
            </div>
          ))}
          <p className="tiny muted" style={{ marginBottom: 0 }}>Source: official deck builder data compiled by Mythras (gamertagmythras.com).</p>
        </div>
        <div className="panel">
          <div className="panel-title">Colour pairings</div>
          {COMBOS.map(([n, p]) => (
            <div className="hbar" key={n} style={{ gridTemplateColumns: '1fr 80px 52px' }}>
              <span className="tiny">{n}</span>
              <div className="track"><div style={{ width: `${(p / 22) * 100}%` }} /></div>
              <span className="num tiny">{p}%</span>
            </div>
          ))}
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Yellow and Blue are the only colours that support single-colour decks well (68 and 66 mono builds, against 8 Red and 7 Green).
          </p>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-title"><Pip color="Yellow" bare /> Yellow: diverge, equip, repurpose</div>
          <p style={{ margin: 0 }}>
            Gear-centric. Efficient Units (Rockn' Rockerboy 5 cost, 8 power) carry cheap Cyberware that draws cards, adjusts Gigs to
            different values and turns single steals into double steals (Gorilla Arms). Key Legends: River Ward (free Gear at Quick
            speed) and Viktor Vektor (Gear tutor). Weakness: little interaction on the Rival's turn.
          </p>
        </div>
        <div className="panel">
          <div className="panel-title"><Pip color="Blue" bare /> Blue: minimize, hack, disable</div>
          <p style={{ margin: 0 }}>
            Push your own Gigs to their minimum value, which keeps your Street Cred low. That powers draw (Jackie, Three Mouths,
            Trust No One), makes MT0D12 Flathead unblockable and doubles Towerfall. The best interaction in the game: Floor It,
            Reboot Optics and Pyramid Song all work on the Rival's turn or remove threats outright.
          </p>
        </div>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 18 }}>Recommended decks</h2><p>Completion and cost update live against your collection.</p></div>
      <div className="grid cols-2">
        {RECOMMENDED.map((d) => {
          const comp = completion(d.id);
          const v = validate(deckFromRecommended(d.id)!);
          const pct = Math.round((comp.have / comp.total) * 100);
          return (
            <div key={d.id} className={`panel deck-card ${d.tier === 'owned' ? 'hot' : 'red'}`}>
              <div className="row">
                <div>
                  <div className="arch">{d.tier === 'owned' ? 'Budget build' : `Upgrade${d.base ? ` of ${RECOMMENDED.find((x) => x.id === d.base)?.name}` : ''}`} · {d.archetype}</div>
                  <h3>{d.name}</h3>
                </div>
                <span className="spacer" />
                <span className={`badge ${v.legal ? 'ok' : 'low'}`}>{v.legal ? 'Legal' : 'Check'}</span>
                <span className="badge warn">Confidence: {d.confidence}</span>
              </div>
              <div className="legend-row">
                {d.legends.map((s) => (
                  <div key={s} style={{ cursor: 'pointer' }} onClick={() => onOpen(s)} title={BY_SLUG.get(s)?.display}>
                    <CardImg slug={s} alt={BY_SLUG.get(s)?.display ?? s} />
                  </div>
                ))}
                <div style={{ display: 'grid', alignContent: 'center', gap: 6, marginLeft: 8 }}>
                  <div className="mono tiny">YOU OWN <b style={{ color: 'var(--y)' }}>{comp.have}/{comp.total}</b> ({pct}%)</div>
                  <div className="track" style={{ height: 8, width: 160, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--ok)' : 'var(--y)' }} />
                  </div>
                  <div className="mono tiny">TO COMPLETE <b style={{ color: comp.cost ? 'var(--red)' : 'var(--ok)' }}>{comp.cost ? cad(comp.cost) : 'nothing'}</b></div>
                  <button className="btn sm" onClick={() => openInBuilder(d.id)}>Open in builder</button>
                </div>
              </div>
              <p style={{ margin: 0 }}>{d.summary}</p>
              <div>
                <div className="group-h">Game plan</div>
                <ol>{d.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </div>
              <div>
                <div className="group-h">Key cards</div>
                <ul>
                  {d.keyCards.map((k) => (
                    <li key={k.slug}><a href="#" onClick={(e) => { e.preventDefault(); onOpen(k.slug); }}>{BY_SLUG.get(k.slug)?.display}</a>: {k.why}</li>
                  ))}
                </ul>
              </div>
              <div className="tiny"><b className="mono">MULLIGAN</b> {d.mulligan}</div>
              <div className="tiny" style={{ color: '#ffb3c1' }}><b className="mono">WEAK SPOTS</b> {d.weaknesses}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
