import { BY_SLUG, type Color } from '../lib/data';
import { Pip } from '../components/bits';
import communityMeta from '../data/community-meta.json';

const CARD_COLOR: Record<string, string> = {
  Yellow: 'var(--color-card-yellow)',
  Blue: 'var(--color-card-blue)',
  Red: 'var(--color-card-red)',
  Green: 'var(--color-card-green)',
};
const deckCount = new Intl.NumberFormat('en-CA').format(communityMeta.deckCount);
const dateRange = new Intl.DateTimeFormat('en-CA', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).formatRange(new Date(communityMeta.windowStart), new Date(communityMeta.asOf));
const share = (count: number) => 100 * count / communityMeta.deckCount;
const chartMax = Math.ceil(share(Math.max(communityMeta.legends[0].count, communityMeta.colours[0].count)) / 10) * 10;
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
          <summary>What players are building</summary>
          <p className="meta-data-note">
            <b>{deckCount} public Constructed decks</b> updated {dateRange}. Percentages show deck share.
            {' '}<a href="https://cyberpunktcg.com/decks?tab=community">Official Community Decks</a>
          </p>
          <div className="grid cols-2 meta-learn-charts">
            <section className="meta-chart">
              <h3>Most-picked Legends</h3>
              <p className="meta-chart-source">Decks with each Legend in their crew.</p>
              {communityMeta.legends.slice(0, 6).map(({ slug, count }) => {
                const card = BY_SLUG.get(slug);
                if (!card) return null;
                return (
                  <div className="hbar" key={slug}>
                    <span className="tiny meta-chart-legend">
                      <Pip color={card.color} bare />
                      <span>{card.name}{card.sub && <small>{card.sub}</small>}</span>
                    </span>
                    <span className="track" aria-hidden="true"><span style={{ width: `${(share(count) / chartMax) * 100}%`, background: CARD_COLOR[card.color] }} /></span>
                    <span className="num">{share(count).toFixed(1)}%</span>
                  </div>
                );
              })}
            </section>
            <section className="meta-chart">
              <h3>Colour pairings</h3>
              <p className="meta-chart-source">Top combinations by Legend crew colours.</p>
              {communityMeta.colours.slice(0, 6).map(({ colours, count }) => (
                <div className="hbar" key={colours.join('/')}>
                  <span className="tiny">{colours.length === 1 ? `Mono ${colours[0]}` : colours.join(' / ')}</span>
                  <span className="track" aria-hidden="true"><span style={{ width: `${(share(count) / chartMax) * 100}%` }} /></span>
                  <span className="num">{share(count).toFixed(1)}%</span>
                </div>
              ))}
            </section>
          </div>
        </details>
      </div>
    </section>
  );
}
