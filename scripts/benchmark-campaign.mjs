/** Fixed-seed engine calibration. Results describe the reference bots and deck policies. */
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const seats = ['player', 'rival'];
const referenceSeats = (process.env.CAMPAIGN_SEATS ?? seats.join(',')).split(',');
if (referenceSeats.some(seat => !seats.includes(seat))) throw new Error('CAMPAIGN_SEATS must contain player or rival.');
const policiesByName = {
  starter: { swaps: 0, style: 'balanced' },
  casual: { swaps: 1, style: 'balanced', modestOffer: true },
  balanced: { swaps: 2, style: 'balanced' },
  pressure: { swaps: 2, style: 'aggro', recruit: true },
  control: { swaps: 2, style: 'control', recruit: true },
  'boss-ready': { swaps: 3, style: 'balanced', matchup: true },
};
const seedCount = Number(process.env.CAMPAIGN_SEEDS ?? 6);
const firstSeed = Number(process.env.CAMPAIGN_FIRST_SEED ?? 0);
const policies = (process.env.CAMPAIGN_POLICIES ?? 'casual,balanced,pressure,control').split(',');
const encounters = (process.env.CAMPAIGN_ENCOUNTERS ?? '1,2,3,4,5,6,7,8,9').split(',').map(Number);
const lastEncounter = Math.max(...encounters);
const starters = (process.env.CAMPAIGN_STARTERS ?? 'the-heist,embracing-power').split(',');
const playerSkill = process.env.CAMPAIGN_PLAYER_SKILL ?? 'sharp';
const retryPacks = Number(process.env.CAMPAIGN_RETRY_PACKS ?? 0);
if (!Number.isSafeInteger(retryPacks) || retryPacks < 0) throw new Error('CAMPAIGN_RETRY_PACKS must be a nonnegative integer.');
const useRivalPlan = process.env.CAMPAIGN_RIVAL_PLAN !== 'off';
const fixedRivalSkill = process.env.CAMPAIGN_RIVAL_SKILL;
const balance = process.env.CAMPAIGN_BALANCE ?? 'v5';
const balanceVersions = { legacy: 2, v2: 2, v3: 3, v4: 4, v5: 5 };
if (!Object.hasOwn(balanceVersions, balance)) throw new Error(`Unknown CAMPAIGN_BALANCE: ${balance}.`);
const trace = process.env.CAMPAIGN_TRACE === '1';
const trials = process.env.CAMPAIGN_TRIALS ? JSON.parse(readFileSync(process.env.CAMPAIGN_TRIALS, 'utf8')) : {};
const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { newCampaign, ENCOUNTERS, encounterDeck, encounterRivalPlan, encounterSkill, generateReward, settleCampaignMatch, emptyProfile, campaignDeckIssues } = await vite.ssrLoadModule('/src/lib/play/campaign.ts');
  const { deckFromRecommended, COPY_MAX } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const { BY_SLUG } = await vite.ssrLoadModule('/src/lib/data.ts');
  const { cardScore, scoreDeck, compositionPenalty } = await vite.ssrLoadModule('/src/lib/autobuild.ts');
  const { campaignCardFit, campaignCrew } = await vite.ssrLoadModule('/src/lib/play/campaignDeckRules.ts');

  // Value early attackers and answers to the blockers and Gear in Sato's list.
  // The reference builds with earned cards and keeps its starting Legends.
  const bossPriorities = {
    'the-heist': {
      'dexter-deshawn-one-last-chance': 4, 'psycho-squad': 3, 'offduty-malfini': 3,
      'zetatech-faceplate': 3, 'gilded-mato-n': 5, 'safety-override': 5, 'reboot-optics': 3,
      'towerfall': 6, 'rita-wheeler-no-stupid-questions': 4, 'mox-inciters': 4,
      'augmented-negotiators': 2, 'pyramid-song': 1, 'evelyn-parker-scheming-siren': -4,
      'mandibular-upgrade': -2, 'secondhand-bombus': -1,
    },
    'embracing-power': {
      'ruthless-lowlife': 2, 'swordwise-huscle': 4, 'la-llorona-ghost-of-the-past': 5,
      'meredith-stout-stone-cold-corpo': 4, '6th-street-recruits': 3, 'emergency-atlus': 3,
      'maxtac-av': 4, 'detonate': 4, 'take-control': 3, 'memory-relapse': 4,
      'sandevistan': 3, 'bonnie-and-clyde': 4, 'shattered-memories': -4,
      'corporate-surveillance': -2, 'arasaka-emergency-radioport': -2,
    },
  };

  function bossCardValue(card, starter) {
    const cost = card.cost ?? Infinity;
    return (bossPriorities[starter][card.slug] ?? 0)
      + (card.type === 'Unit' && cost <= 4 && (card.power ?? 0) > 0 ? 1.5 : 0)
      + (card.sellable ? 0.75 : 0)
      - (cost >= 6 ? 1.5 : 0);
  }

  function upgrade(run, pack, policy) {
    if (!policy.swaps) return;
    const matchupValues = new Map();
    const matchup = slug => {
      if (!policy.matchup) return 0;
      if (!matchupValues.has(slug)) matchupValues.set(slug, bossCardValue(BY_SLUG.get(slug), run.starter));
      return matchupValues.get(slug);
    };
    const score = slug => cardScore(BY_SLUG.get(slug), run.deck.legends, policy.style) + matchup(slug);
    const deckScore = cards => {
      const base = scoreDeck(run.deck.legends, cards, policy.style);
      return policy.matchup ? base + Object.entries(cards).reduce((sum, [slug, count]) => sum + count * matchup(slug), 0) : base;
    };
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
    for (const slug of [...pack.cards, ...(choice ? [choice] : [])]) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    if (recruit) run.deck = recruit.deck;
    const crew = campaignCrew(run.deck.legends);
    const candidates = Object.keys(run.inventory).filter(slug => !campaignCardFit(BY_SLUG.get(slug), crew));
    for (let swap = 0; swap < policy.swaps; swap++) {
      let best, bestScore = deckScore(run.deck.cards) + .2;
      for (const add of candidates) {
        if ((run.deck.cards[add] ?? 0) >= Math.min(run.inventory[add], COPY_MAX)) continue;
        for (const remove of Object.keys(run.deck.cards)) {
          if (add === remove) continue;
          const cards = { ...run.deck.cards, [remove]: run.deck.cards[remove] - 1, [add]: (run.deck.cards[add] ?? 0) + 1 };
          if (!cards[remove]) delete cards[remove];
          const score = deckScore(cards);
          if (score > bestScore) { best = cards; bestScore = score; }
        }
      }
      if (!best) break;
      run.deck.cards = best;
    }
    const issues = campaignDeckIssues(run, run.deck);
    if (issues.length) throw new Error(issues.join(' '));
  }

  function play(run, rivalDeck, rivalSkill, plan, seat, seed) {
    const player = prepareMatchDeck(run.deck), rival = prepareMatchDeck(rivalDeck);
    const setup = seat === 'player' ? { player, rival } : { player: rival, rival: player };
    const engine = new LocalEngine(initialEngineState(setup, seed, seed));
    const referenceRng = new SeededRNG(seed + ':reference'), opponentRng = new SeededRNG(seed + ':opponent');
    let view, error, commands = 0, slowestMs = 0;
    const rivalMoves = {};
    const actions = [];
    const rivalOpening = [];
    for (; commands < 800; commands++) {
      view = engine.getFilteredView(seat);
      if (view.gameEnded) break;
      const active = seats.find(side => ['action', 'choice'].includes(engine.getFilteredView(side).prompt.status));
      if (!active) { error = 'No active decision'; break; }
      const reference = active === seat;
      const rng = reference ? referenceRng : opponentRng;
      const started = performance.now();
      const move = botDecision(engine, active, () => rng.next(), reference ? playerSkill : rivalSkill, reference ? undefined : plan);
      slowestMs = Math.max(slowestMs, performance.now() - started);
      if (!move || move.move === 'concede') { error = `No playable move for ${active}`; break; }
      if (!reference && move.move === 'passPhase' && view.gamePhase === 'main' && view.turnNumber <= 6) {
        const rival = view.players[active];
        const bodies = rival.zones.field.filter(card => card.type === 'unit' || card.type === 'legend');
        rivalOpening.push({
          turn: view.turnNumber,
          gigs: rival.gigCount,
          units: bodies.length,
          power: bodies.reduce((total, card) => total + card.effectivePower, 0),
          eddies: rival.zones.eddieArea.length,
        });
      }
      if (trace) {
        const table = engine.getFilteredView(active);
        const visibleCards = Object.values(table.players).flatMap(owner => Object.values(owner.zones)
          .flatMap(zone => Array.isArray(zone) ? zone : []));
        const visibleName = id => visibleCards.find(card => card.instanceId === id)?.cardName ?? undefined;
        const targetIds = move.args?.targetIds ?? move.args?.cardIds
          ?? [move.args?.defenderId ?? move.args?.attachToId ?? move.args?.blockerId];
        actions.push({ turn: table.turnNumber, side: reference ? 'reference' : 'rival', move: move.move,
          card: visibleName(move.args?.cardId ?? move.args?.attackerId ?? move.args?.legendId),
          targets: targetIds.map(visibleName).filter(Boolean), gigs: table.players[active].gigCount });
      }
      const result = engine.processCommand({ commandID: String(commands), move: move.move, input: move.args ? { args: move.args } : undefined }, active);
      if (!result.success) { error = `${active} ${move.move}: ${result.error}`; break; }
      if (!reference) rivalMoves[move.move] = (rivalMoves[move.move] ?? 0) + 1;
    }
    if (!view?.gameEnded && !error) error = 'Command cap reached';
    return { outcome: view?.winnerId ? view.winnerId === seat ? 'win' : 'loss' : 'draw',
      turns: view?.turnNumber, winReason: view?.winReason, referenceWentFirst: view?.players[seat].firstPlayer,
      commands, rivalMoves, rivalOpening, slowestMs: Math.round(slowestMs),
      ...(trace && { trace: actions }), error };
  }

  const results = [];
  const matchCache = new Map();
  for (const starter of starters) for (const name of policies) {
    const policy = policiesByName[name];
    if (!policy) throw new Error(`Unknown upgrade policy: ${name}`);
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed++) {
      const run = newCampaign(starter, `${starter}:${seed}`, `campaign-balance:${seed}`, balanceVersions[balance]);
      if (balance === 'legacy') { delete run.balanceVersion; run.opponents = []; }
      const original = { ...run.deck.cards };
      for (const encounter of ENCOUNTERS.keys()) {
        run.encounter = encounter;
        if (policy.swaps && encounters.includes(encounter + 1)) {
          for (let attempt = 0; attempt < retryPacks; attempt++) {
            const match = { summary: { matchId: `bench-loss:${encounter}:${attempt}`, ended: true } };
            const loss = settleCampaignMatch({ ...run, attempts: attempt, phase: 'inMatch', match }, emptyProfile(), match, 'rival').run;
            upgrade(run, loss.latestRetry, policy);
          }
        }
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
          const plan = useRivalPlan ? trial?.plan ?? encounterRivalPlan(run) : undefined;
          const seedKey = `campaign-calibration:${starter}:${seed}:${encounter}`;
          const replaced = Object.entries(original).reduce((n, [slug, qty]) => n + Math.max(0, qty - (run.deck.cards[slug] ?? 0)), 0);
          for (const seat of referenceSeats) {
            const key = JSON.stringify([seedKey, seat, skill, plan, run.deck.legends, run.deck.cards, rival.legends, rival.cards]);
            if (!matchCache.has(key)) matchCache.set(key, play(run, rival, skill, plan, seat, seedKey));
            const result = { starter, policy: name, seed, seat, encounter: encounter + 1, opponent: rival.name, skill, plan, replaced,
              ...(trace && { deck: run.deck.cards, deckStats: compositionPenalty(run.deck.cards).stats }),
              ...matchCache.get(key) };
            results.push(result);
            if (result.error) console.error(result);
          }
        }
        if (policy.swaps && encounter + 1 < lastEncounter) upgrade(run, generateReward(run), policy);
      }
    }
  }
  for (const [index, encounter] of ENCOUNTERS.entries()) {
    const played = results.filter(result => result.encounter === index + 1);
    if (!played.length) continue;
    console.log(`${index + 1} ${encounter.title}`);
    for (const starter of starters) {
      const summary = policies.map(policy => {
        const games = played.filter(game => game.starter === starter && game.policy === policy);
        return `${policy} ${games.filter(game => game.outcome === 'win').length}/${games.length}`;
      });
      console.log(`  ${starter} ${summary.join(' | ')}`);
    }
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({
    firstSeed, seedCount, policies, encounters, playerSkill, fixedRivalSkill, useRivalPlan, retryPacks, referenceSeats, balance, trials, results,
  }, null, 2) + '\n');
  if (results.some(result => result.error)) process.exitCode = 1;
} finally { await vite.close(); }
