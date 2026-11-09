import type { Color } from '../lib/data';
import { Pip } from '../components/bits';

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

export function MetaLearn() {
  return (
    <section aria-labelledby="meta-learn-title">
      <header className="meta-section-head">
        <h2 id="meta-learn-title">Learn</h2>
        <p>Game basics, colour identities, and a snapshot of deck-building popularity.</p>
      </header>
      <div className="meta-learn-topics">
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>How it plays</summary>
          <ul className="meta-rules">
            <li><b>Win:</b> start your turn with <b>7 Gigs</b> (dice). You only own 6, so you must steal. After turn 7 it&apos;s overtime: first to hold a majority wins.</li>
            <li><b>Stealing:</b> attack the Rival&apos;s Gig area. 1-9 power steals 1 Gig, 10-19 steals 2, 20+ steals 3. Power 0 steals nothing.</li>
            <li><b>Eddies (€$):</b> sell one card with a sell tag (Gear and Programs) per turn. Each Legend can also be spent for 1 €$.</li>
            <li><b>Combat:</b> attacking spends your Unit, and only spent Units can be attacked. Blockers redirect attacks. Quick cards fire on the Rival&apos;s turn.</li>
            <li><b>Legends:</b> Call one per turn (1 €$, flip face-up). Go Solo Legends become an attacker that can hit the same turn.</li>
          </ul>
        </details>
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>Colour identities</summary>
          <div className="grid cols-4 meta-identity-grid">
            {IDENTITY.map((x) => (
              <section className="meta-colour-identity" key={x.color}>
                <h3><Pip color={x.color} bare /> {x.color}</h3>
                <p className="label accent">{x.title}</p>
                <p>{x.body}</p>
              </section>
            ))}
          </div>
        </details>
        <details className="panel meta-disclosure meta-learn-topic" open>
          <summary>What players were building</summary>
          <p className="callout meta-data-note"><b>Honest read</b> · These charts show deck-building popularity. The percentages measure picks and pairings.
            Tournament performance and win rates require a separate results dataset.</p>
          <div className="grid cols-2 meta-learn-charts">
            <section className="meta-chart">
              <h3>Most-picked Legends</h3>
              <p className="meta-chart-source">September 2026 · 716 public decks · compiled by Mythras</p>
              {LEGEND_PICKS.map(([name, color, pct]) => (
                <div className="hbar" key={name}>
                  <span className="tiny"><Pip color={color} bare /> {name}</span>
                  <span className="track" aria-hidden="true"><span style={{ width: `${(pct / 30) * 100}%`, background: CARD_COLOR[color] }} /></span>
                  <span className="num">{pct}%</span>
                </div>
              ))}
              <p className="meta-chart-source">Source data from the official deck builder.</p>
            </section>
            <section className="meta-chart">
              <h3>Colour pairings</h3>
              <p className="meta-chart-source">Selected colour combinations and mono-colour decks.</p>
              {COMBOS.map(([name, pct]) => (
                <div className="hbar" key={name}>
                  <span className="tiny">{name}</span>
                  <span className="track" aria-hidden="true"><span style={{ width: `${(pct / 30) * 100}%` }} /></span>
                  <span className="num">{pct}%</span>
                </div>
              ))}
            </section>
          </div>
          <details className="meta-disclosure meta-community-opinion">
            <summary>Community opinion</summary>
            <p>In November 2026, TCG Contender’s early tier list put a Red/Yellow crew of Adam Smasher, Dum Dum, and V: Streetkid on top.</p>
          </details>
        </details>
      </div>
    </section>
  );
}
