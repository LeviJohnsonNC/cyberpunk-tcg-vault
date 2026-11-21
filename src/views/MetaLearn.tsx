import { BY_SLUG, type Color } from '../lib/data';
import { Pip } from '../components/bits';
import communityMeta from '../data/community-meta.json';
import { showdownMeta } from '../data/showdown-meta';

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
const RULES = 'https://cyberpunktcg.com/comprehensive-rules';
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
        <p>Game rules, tournament results, and the cards shaping Constructed.</p>
      </header>
      <div className="meta-learn-topics">
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>How it plays</summary>
          <ul className="meta-rules">
            <li><b>Winning.</b> Start your turn with <b>7 or more Gigs</b> to win. Overtime begins after both players start back-to-back turns with empty Fixer areas. In overtime, reaching 7 wins immediately.</li>
            <li><b>Stealing.</b> An attack that reaches the Rival&apos;s Gig area steals 1 Gig at 1–9 power, 2 at 10–19, 3 at 20–29, and one more per additional 10 power. At 0 power, you steal zero.</li>
            <li><b>Eddies (€$).</b> Once per turn in your Main Phase, sell a card from hand with a Sell Tag. Effects can sell additional cards. A ready Legend in the Legends area can pay 1 €$ if it&apos;s face-down or has a Sell Tag.</li>
            <li><b>Combat and Quick.</b> Spend a ready Unit to attack the Gig area or a spent Unit, unless a card allows another target. After declaring the attack and resolving its triggers, the defender can Block, Call a Legend or use Quick in any order. Resolve each reaction before the next. On your own turn, play a Quick Program before declaring the attack if you want its effect during that fight.</li>
            <li><b>Legends.</b> Pay 1 €$ to Call a Legend once per turn in your Main Phase or during the React Step when defending. Go Solo puts an eligible Legend in the field as a ready Unit that can attack that turn.</li>
          </ul>
          <p className="meta-data-note">
            <a href="https://cyberpunktcg.com/gameplay-guide">Official Gameplay Guide</a>
            {' · '}<a href={RULES}>Comprehensive Rules</a>
          </p>
        </details>
        <details className="panel meta-disclosure meta-learn-topic" open>
          <summary>Night City Showdowns</summary>
          <p className="meta-data-note">
            <b>{showdownMeta.window}</b> · {showdownMeta.entries} published entries, {showdownMeta.topEight} Top 8 decklists and {showdownMeta.winners} winners with published lists.
            The report covers {showdownMeta.coverage}% of players in its standings sample.
          </p>
          <div className="meta-showdown-results">
            <table className="meta-showdown-table" aria-label="Showdown results by Legend colours">
              <thead>
                <tr><th scope="col">Legend colours</th><th scope="col">Field share</th><th scope="col">Top 8</th><th scope="col">Event wins</th></tr>
              </thead>
              <tbody>
                {showdownMeta.families.map((family) => (
                  <tr key={family.name}>
                    <th scope="row"><abbr title={family.colors}>{family.name}</abbr></th>
                    <td>{(100 * family.entries / showdownMeta.entries).toFixed(1)}%</td>
                    <td>{family.topEight}</td><td>{family.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="meta-data-note meta-showdown-notes">
              <p><b>Most-played crew.</b> Alt / Hanako / Jackie (BBG) appeared in 113 entries.</p>
              <p><b>Most event wins.</b> Smasher / Padre / Streetkid (RRG) won 8 of the events with published winners and reached Top 8 in 32 of its 48 entries.</p>
              <a href={showdownMeta.source}>Full Showdown report from Melee results</a>
            </div>
          </div>
        </details>
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>Cards to prepare for</summary>
          <ul className="meta-rules">
            <li><b>RYY gear ramp.</b> Bootleg Black Sapphire Show accelerates into expensive plays. An early Gig lead can turn on Adrenaline Converter, so count what River Ward can equip for 1 €$ and what Johnny Silverhand can steal after winning a fight.</li>
            <li><b>BBG control.</b> Alt Cunningham discounts and replays Programs. Memory Relapse can deny an attack for a turn, while Towerfall clears small Units to set up Les Élémens. Keep a second threat in reserve and spread your Gear when you can.</li>
            <li><b>Red and Green threats.</b> When a Green deck pairs Gigs, Pepe Najarro can ready two Merc Legends on attack. Against Smasher, track the Rival&apos;s available Eddies and what you can rebuild with after his Go Solo turn.</li>
          </ul>
          <p className="meta-data-note"><a href="https://cyberpunktcg.com/blog/wnc-impactful-cards">WeirdCo&apos;s Nov 20 early meta breakdown</a></p>
        </details>
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>Rules updates and tournament play</summary>
          <ul className="meta-rules">
            <li><b>Fight vs. defeat.</b> Equal power means both Units lose the fight. A Unit at 0 power cannot defeat its opponent in a fight. An effect that prevents defeat can save a Unit that still lost the fight. <a href={`${RULES}#rule-498fdc3d-3d6b-4411-ab4b-c508ff51a9f7`}>Rule 11.4</a></li>
            <li><b>Stealing multiple Gigs.</b> Choose all Gigs before moving any. Apply prevention after choosing, then move the Gigs that can be stolen together. Adjust values before choosing or after the move. <a href={`${RULES}#rule-dfc08f97-bed1-494f-bcef-42bfb54c382a`}>Rule 11.5</a></li>
            <li><b>Triggered conditions.</b> An extra condition on a trigger is checked when it resolves. If a card prints two trigger keywords for one effect, either keyword can trigger it. <a href={`${RULES}#rule-7038d2a6-6bed-4c43-be07-858cb56793f9`}>Rules 10.16.1.1 and 10.17.1</a></li>
            <li><b>Best-of-three Constructed.</b> Bring 3 distinct Legends, 40–50 main-deck cards, and exactly 7 sideboard cards. Keep your Legends and main-deck size fixed when swapping cards between games. <a href="https://cyberpunktcg.com/tournament-rules">Official Tournament Rules</a></li>
          </ul>
          <p className="meta-data-note">
            <a href={RULES}>Nov 17 Comprehensive Rules update</a>
            {' · '}<a href="https://cyberpunktcg.com/rules-faq">Official Rules FAQ</a>
          </p>
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
        <details className="panel meta-disclosure meta-learn-topic">
          <summary>What players are building</summary>
          <p className="meta-data-note">
            <b>{deckCount} public Constructed decks</b> updated {dateRange}. Percentages show share of community deck builds.
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
