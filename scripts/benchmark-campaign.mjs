/** Deterministic campaign matchup smoke test. Bot policies are proxies, not human win rates. */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck, matchDeckIssues } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { newCampaign, ENCOUNTERS, encounterDeck, generateReward } = await vite.ssrLoadModule('/src/lib/play/campaign.ts');
  const recommended = (await vite.ssrLoadModule('/src/data/decks.json')).default;
  const { BY_SLUG, fitsRam, ramLimits } = await vite.ssrLoadModule('/src/lib/data.ts');
  const { rating, synergy } = await vite.ssrLoadModule('/src/lib/autobuild.ts');
  const { validate } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const seeds = Number(process.env.CAMPAIGN_SEEDS ?? 6);
  const policies = (process.env.CAMPAIGN_POLICIES ?? 'starter,one-swap,three-swaps').split(',');
  const encounters = (process.env.CAMPAIGN_ENCOUNTERS ?? '1,2,3,4,5,6,7,8,9').split(',').map(Number);
  const finalRival = process.env.CAMPAIGN_FINAL_RIVAL;
  const results = [];
  for (const starter of ['the-heist', 'embracing-power']) for (const policy of policies) for (let seed = 0; seed < seeds; seed++) {
    const run = newCampaign(starter, `${starter}:${policy}:${seed}`, `campaign-benchmark:${seed}`);
    if (finalRival) {
      const selected = recommended.find(deck => deck.id === finalRival);
      if (!selected) throw new Error(`Unknown candidate: ${finalRival}`);
      run.opponents[8] = { id: `candidate:${finalRival}`, name: selected.name, legends: selected.legends, cards: selected.cards, sideboard: {}, notes: selected.summary, updatedAt: '' };
    }
    for (let encounter = 0; encounter < ENCOUNTERS.length; encounter++) {
      run.encounter = encounter;
      const opponent = ENCOUNTERS[encounter];
      const key = `${starter}:${seed}:${encounter}`;
      if (encounters.includes(encounter + 1)) {
        const setup = { player: prepareMatchDeck(run.deck), rival: prepareMatchDeck(encounterDeck(run)) };
        const engine = new LocalEngine(initialEngineState(setup, key, key));
        const rng = new SeededRNG(key + ':moves');
        let view, error;
        for (let command = 0; command < 800; command++) {
          view = engine.getFilteredView('player');
          if (view.gameEnded) break;
          const active = ['player', 'rival'].find(seat => ['action', 'choice'].includes(engine.getFilteredView(seat).prompt.status));
          if (!active) { error = 'No active decision'; break; }
          const move = botDecision(engine, active, () => rng.next(), active === 'player' ? 'sharp' : opponent.skill);
          if (!move) { error = `No move for ${active}`; break; }
          const result = engine.processCommand({ commandID: String(command), move: move.move, input: move.args ? { args: move.args } : undefined }, active);
          if (!result.success) { error = result.error; break; }
        }
        if (!view?.gameEnded && !error) error = 'Command cap reached';
        results.push({ starter, policy, seed, encounter: encounter + 1, opponent: opponent.id, winner: view?.winnerId, turns: view?.turnNumber, error });
        console.log(`${starter} ${policy} #${seed} ${encounter + 1}: ${error ?? view.winnerId}`);
      }
      if (encounter >= ENCOUNTERS.length - 1) continue;
      const pack = generateReward(run);
      for (const slug of pack.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
      const chosen = pack.offers.find(slug => BY_SLUG.get(slug)?.type !== 'Legend') ?? pack.offers[0];
      run.inventory[chosen] = (run.inventory[chosen] ?? 0) + 1;
      if (policy === 'starter') continue;
      const score = slug => rating(slug).power + synergy(BY_SLUG.get(slug), run.deck.legends);
      const available = Object.keys(run.inventory).filter(slug => BY_SLUG.get(slug)?.type !== 'Legend'
        && (run.inventory[slug] ?? 0) > (run.deck.cards[slug] ?? 0) && fitsRam(BY_SLUG.get(slug), ramLimits(run.deck.legends)))
        .sort((a, b) => score(b) - score(a));
      for (let n = 0; n < (policy === 'one-swap' ? 1 : 3); n++) {
        const weakest = Object.keys(run.deck.cards).filter(slug => run.deck.cards[slug] > 0).sort((a, b) => score(a) - score(b))[0];
        const addition = available.find(slug => run.deck.cards[slug] < run.inventory[slug] && score(slug) > score(weakest) + .2);
        if (!addition) break;
        const cards = { ...run.deck.cards, [weakest]: run.deck.cards[weakest] - 1, [addition]: (run.deck.cards[addition] ?? 0) + 1 };
        if (!cards[weakest]) delete cards[weakest];
        if (validate({ ...run.deck, cards }).legal && !matchDeckIssues({ ...run.deck, cards }).length) run.deck.cards = cards;
      }
    }
  }
  const report = { description: 'A Sharp reference player against the campaign skill settings. Synthetic swap policies; seeds are not human win rates.', seeds, policies, encounters, finalRival: finalRival ?? 'campaign default', results };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  for (const index of ENCOUNTERS.keys()) {
    const played = results.filter(result => result.encounter === index + 1);
    if (played.length) console.log(`${index + 1} ${ENCOUNTERS[index].title}: ${played.filter(result => result.winner === 'player').length}/${played.length} reference wins, ${played.filter(result => result.error).length} errors`);
  }
  if (results.some(result => result.error)) process.exitCode = 1;
} finally { await vite.close(); }
