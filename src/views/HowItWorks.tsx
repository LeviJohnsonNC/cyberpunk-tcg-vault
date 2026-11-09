import { Masthead } from '../components/ui';
import { PRICES } from '../lib/data';

export function HowItWorks({ openFeedback }: { openFeedback: () => void }) {
  return (
    <div className="how">
      <Masthead size="compact" eyebrow="The Afterlife / How it works" title="How it works" sub="Fixer · unofficial · free · open source" />
      <div className="how-grid">
        <section className="panel">
          <div className="panel-title">Your collection</div>
          <p>Add cards by searching, or snap a photo and a vision model suggests matches you confirm. Without an account, everything stays in this browser. Sign in to sync across devices.</p>
          <p>Not ready to add cards? Try the demo collection from the Collection tab. Nothing in demo mode is saved.</p>
        </section>
        <section className="panel">
          <div className="panel-title">Prices</div>
          <p>Near Mint prices come from TCGplayer, refreshed daily via {PRICES.source.includes('tcgcsv') ? 'tcgcsv.com' : 'a public mirror'}. Each copy shows its basis: its own market price, its verified Beta twin's price when a new Retail printing hasn't sold yet, or its lowest listing. Printings without a quote, like many promos, show as Unpriced instead of borrowing a price. Costs to buy always quote a specific printing. Switch USD or CAD in the header.</p>
        </section>
        <section className="panel">
          <div className="panel-title">Deck building</div>
          <p>The builder enforces the real rules: three Legends, 40 to 50 cards, three copies max, and RAM limits per colour. It shows what you own, what you&apos;re missing and what finishing the deck costs.</p>
        </section>
        <section className="panel hot">
          <div className="panel-title">Built from your vault, and the AI</div>
          <p><b>Auto-build</b> is plain code, not AI. It tries every Legend crew you own, scores cards with hand-curated ratings and Legend synergy, and keeps the best three legal decks. Instant and free.</p>
          <p><b>Refine with AI</b> (signed in) sends one of those decks to a language model, which suggests swaps and writes a game plan. The model only proposes: code then checks every card against your collection and the rules, fixes anything illegal, and rejects the result if it can&apos;t. Prices always come from our data, never the model.</p>
          <p>AI use is capped per person and site-wide each day so this stays free to run.</p>
        </section>
        <section className="panel">
          <div className="panel-title">Honest caveats</div>
          <p>Constructed play is days old. The recommended decks and card ratings are informed early takes, labelled with their sources, not a solved meta. Expect them to change as results come in.</p>
        </section>
        <section className="panel">
          <div className="panel-title">Help shape it</div>
          <p>Found a wrong price, a missing card or a better deck? Tell me.</p>
          <div className="row">
            <button className="btn sm" onClick={openFeedback}>Send feedback</button>
            <a className="btn quiet sm" href="https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault" target="_blank" rel="noreferrer">Code on GitHub</a>
          </div>
        </section>
      </div>
    </div>
  );
}
