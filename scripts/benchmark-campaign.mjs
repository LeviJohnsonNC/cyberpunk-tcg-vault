/** Fixed-seed engine calibration. Results describe the reference bots and deck policies. */
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const seats = ['player', 'rival'];
const policiesByName = {
  starter: { swaps: 0, style: 'balanced' },
  casual: { swaps: 1, style: 'balanced', modestOffer: true },
  balanced: { swaps: 2, style: 'balanced' },
  pressure: { swaps: 2, style: 'aggro', recruit: true },
  control: { swaps: 2, style: 'control', recruit: true },
};
const seedCount = Number(process.env.CAMPAIGN_SEEDS ?? 6);
const firstSeed = Number(process.env.CAMPAIGN_FIRST_SEED ?? 0);
const policies = (process.env.CAMPAIGN_POLICIES ?? 'casual,balanced,pressure,control').split(',');
const encounters = (process.env.CAMPAIGN_ENCOUNTERS ?? '1,2,3,4,5,6,7,8,9').split(',').map(Number);
const starters = (process.env.CAMPAIGN_STARTERS ?? 'the-heist,embracing-power').split(',');
const playerSkill = process.env.CAMPAIGN_PLAYER_SKILL ?? 'sharp';
const fixedRivalSkill = process.env.CAMPAIGN_RIVAL_SKILL;
const legacy = process.env.CAMPAIGN_BALANCE === 'legacy';
const trials = process.env.CAMPAIGN_TRIALS ? JSON.parse(readFileSync(process.env.CAMPAIGN_TRIALS, 'utf8')) : {};
const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { newCampaign, ENCOUNTERS, encounterDeck, encounterSkill, generateReward, campaignDeckIssues } = await vite.ssrLoadModule('/src/lib/play/campaign.ts');
  const { deckFromRecommended } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const { BY_SLUG, fitsRam, ramLimits } = await vite.ssrLoadModule('/src/lib/data.ts');
  const { cardScore, scoreDeck } = await vite.ssrLoadModule('/src/lib/autobuild.ts');

  function upgrade(run, pack, policy) {
    const score = slug => cardScore(BY_SLUG.get(slug), run.deck.legends, policy.style);
    const main = pack.offers.filter(slug => BY_SLUG.get(slug).type !== 'Legend').sort((a, b) => score(b) - score(a));
    const recruit = policy.recruit ? pack.offers.filter(slug => BY_SLUG.get(slug).type === 'Legend')
      .flatMap(slug => run.deck.legends.map(prior => ({
        slug, prior, deck: { ...run.deck, legends: run.deck.legends.map(l => l === prior ? slug : l) },
      })))
      .filter(({ slug, prior, deck }) => BY_SLUG.get(slug).color === BY_SLUG.get(prior).color
        && BY_SLUG.get(slug).ram >= BY_SLUG.get(prior).ram
        && !campaignDeckIssues({ ...run, inventory: { ...run.inventory, [slug]: 1 } }, deck).length)
      .sort((a, b) => scoreDeck(b.deck.legends, b.deck.cards, policy.style) - scoreDeck(a.deck.legends, a.deck.cards, policy.style))[0] : undefined;
    const choice = recruit?.slug ?? (policy.modestOffer ? main.at(-1) : main[0]);
    for (const slug of [...pack.cards, choice]) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    if (recruit) run.deck = recruit.deck;
    const limits = ramLimits(run.deck.legends);
    const candidates = Object.keys(run.inventory).filter(slug => BY_SLUG.get(slug).type !== 'Legend' && fitsRam(BY_SLUG.get(slug), limits));
    for (let swap = 0; swap < policy.swaps; swap++) {
      let best, bestScore = scoreDeck(run.deck.legends, run.deck.cards, policy.style) + .2;
      for (const add of candidates) {
        if ((run.deck.cards[add] ?? 0) >= run.inventory[add]) continue;
        for (const remove of Object.keys(run.deck.cards)) {
          if (add === remove) continue;
          const cards = { ...run.deck.cards, [remove]: run.deck.cards[remove] - 1, [add]: (run.deck.cards[add] ?? 0) + 1 };
          if (!cards[remove]) delete cards[remove];
          const score = scoreDeck(run.deck.legends, cards, policy.style);
          if (score > bestScore) { best = cards; bestScore = score; }
        }
      }
      if (!best) break;
      run.deck.cards = best;
    }
    const issues = campaignDeckIssues(run, run.deck);
    if (issues.length) throw new Error(issues.join(' '));
  }

  function play(run, rivalDeck, rivalSkill, seat, seed) {
    const player = prepareMatchDeck(run.deck), rival = prepareMatchDeck(rivalDeck);
    const setup = seat === 'player' ? { player, rival } : { player: rival, rival: player };
    const engine = new LocalEngine(initialEngineState(setup, seed, seed));
    const referenceRng = new SeededRNG(seed + ':reference'), opponentRng = new SeededRNG(seed + ':opponent');
    let view, error, commands = 0, slowestMs = 0;
    for (; commands < 800; commands++) {
      view = engine.getFilteredView(seat);
      if (view.gameEnded) break;
      const active = seats.find(side => ['action', 'choice'].includes(engine.getFilteredView(side).prompt.status));
      if (!active) { error = 'No active decision'; break; }
      const reference = active === seat;
      const rng = reference ? referenceRng : opponentRng;
      const started = performance.now();
      const move = botDecision(engine, active, () => rng.next(), reference ? playerSkill : rivalSkill);
      slowestMs = Math.max(slowestMs, performance.now() - started);
      if (!move || move.move === 'concede') { error = `No playable move for ${active}`; break; }
      const result = engine.processCommand({ commandID: String(commands), move: move.move, input: move.args ? { args: move.args } : undefined }, active);
      if (!result.success) { error = `${active} ${move.move}: ${result.error}`; break; }
    }
    if (!view?.gameEnded && !error) error = 'Command cap reached';
    return { outcome: view?.winnerId ? view.winnerId === seat ? 'win' : 'loss' : 'draw',
      turns: view?.turnNumber, commands, slowestMs: Math.round(slowestMs), error };
  }

  const results = [];
  const matchCache = new Map();
  for (const starter of starters) for (const name of policies) {
    const policy = policiesByName[name];
    if (!policy) throw new Error(`Unknown upgrade policy: ${name}`);
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed++) {
      const run = newCampaign(starter, `${starter}:${seed}`, `campaign-balance:${seed}`);
      if (legacy) { delete run.balanceVersion; run.opponents = []; }
      const original = { ...run.deck.cards };
      for (const encounter of ENCOUNTERS.keys()) {
        run.encounter = encounter;
        if (encounters.includes(encounter + 1)) {
          const stageTrial = trials[encounter + 1];
          const trial = stageTrial?.byStarter?.[starter] ?? stageTrial;
          const rival = trial?.deck ? deckFromRecommended(trial.deck) : encounterDeck(run);
          if (trial?.legends) rival.legends = trial.legends;
          if (trial?.main) rival.cards = trial.main;
          if (trial?.cards) {
            for (const [slug, delta] of Object.entries(trial.cards)) {
              rival.cards[slug] = (rival.cards[slug] ?? 0) + delta;
              if (!rival.cards[slug]) delete rival.cards[slug];
            }
          }
          const skill = fixedRivalSkill ?? trial?.skill ?? encounterSkill(run);
          const seedKey = `campaign-calibration:${starter}:${seed}:${encounter}`;
          const replaced = Object.entries(original).reduce((n, [slug, qty]) => n + Math.max(0, qty - (run.deck.cards[slug] ?? 0)), 0);
          for (const seat of seats) {
            const key = JSON.stringify([seedKey, seat, skill, run.deck.legends, run.deck.cards, rival.legends, rival.cards]);
            if (!matchCache.has(key)) matchCache.set(key, play(run, rival, skill, seat, seedKey));
            const result = { starter, policy: name, seed, seat, encounter: encounter + 1, opponent: rival.name, skill, replaced,
              ...matchCache.get(key) };
            results.push(result);
            if (result.error) console.error(result);
          }
        }
        if (encounter < ENCOUNTERS.length - 1) upgrade(run, generateReward(run), policy);
      }
    }
  }
  for (const [index, encounter] of ENCOUNTERS.entries()) {
    const played = results.filter(result => result.encounter === index + 1);
    if (!played.length) continue;
    const summary = starters.map(starter => {
      const games = played.filter(game => game.starter === starter);
      return `${starter} ${games.filter(game => game.outcome === 'win').length}/${games.length}`;
    });
    console.log(`${index + 1} ${encounter.title}: ${summary.join(' | ')}`);
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({
    firstSeed, seedCount, policies, encounters, playerSkill, fixedRivalSkill, legacy, trials, results,
  }, null, 2) + '\n');
  if (results.some(result => result.error)) process.exitCode = 1;
} finally { await vite.close(); }
