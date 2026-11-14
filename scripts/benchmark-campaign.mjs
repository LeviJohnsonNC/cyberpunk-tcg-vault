/** Fixed-seed engine calibration. Results describe the reference bots and deck policies. */
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const seats = ['player', 'rival'];
const referenceSeats = (process.env.CAMPAIGN_SEATS ?? seats.join(',')).split(',');
if (referenceSeats.some(seat => !seats.includes(seat))) throw new Error('CAMPAIGN_SEATS must contain player or rival.');
const balanced = { swaps: 2, style: 'balanced' };
const policiesByName = {
  starter: { swaps: 0, style: 'balanced' },
  casual: { swaps: 1, style: 'balanced', modestOffer: true },
  balanced,
  'balanced-win-only': { ...balanced, skipRetryEdits: true },
  pressure: { swaps: 2, style: 'aggro', recruit: true },
  control: { swaps: 2, style: 'control', recruit: true },
  'boss-ready': { swaps: 3, style: 'balanced', matchup: true },
  'act-three-pressure': { swaps: 2, style: 'aggro', actThree: true },
  'act-three-control': { swaps: 2, style: 'control', actThree: true },
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
const maxAttempts = Number(process.env.CAMPAIGN_MAX_ATTEMPTS ?? 0);
if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0 || (maxAttempts && retryPacks)) {
  throw new Error('CAMPAIGN_MAX_ATTEMPTS must be a nonnegative integer and cannot be combined with simulated retry packs.');
}
const useRivalPlan = process.env.CAMPAIGN_RIVAL_PLAN !== 'off';
const fixedRivalSkill = process.env.CAMPAIGN_RIVAL_SKILL;
const balance = process.env.CAMPAIGN_BALANCE ?? 'v5';
const balanceVersions = { legacy: 2, v2: 2, v3: 3, v4: 4, v5: 5 };
if (!Object.hasOwn(balanceVersions, balance)) throw new Error(`Unknown CAMPAIGN_BALANCE: ${balance}.`);
const trace = process.env.CAMPAIGN_TRACE === '1';
const trials = process.env.CAMPAIGN_TRIALS ? JSON.parse(readFileSync(process.env.CAMPAIGN_TRIALS, 'utf8')) : {};
const checkpointPath = process.env.CAMPAIGN_ROUTE_CHECKPOINTS;
const replayEdits = process.env.CAMPAIGN_REPLAY_EDITS;
const replayRetriesOnly = process.env.CAMPAIGN_REPLAY_RETRIES_ONLY === '1';
if (replayEdits && (!checkpointPath || !['one', 'two'].includes(replayEdits))) {
  throw new Error('CAMPAIGN_REPLAY_EDITS requires route checkpoints and must be one or two.');
}
const checkpointStage = Number(process.env.CAMPAIGN_CHECKPOINT_STAGE ?? 0);
if (!Number.isSafeInteger(checkpointStage) || checkpointStage < 0 || (checkpointStage && !maxAttempts)) {
  throw new Error('CAMPAIGN_CHECKPOINT_STAGE requires route mode and a positive encounter number.');
}
if (checkpointPath && maxAttempts) throw new Error('Replay route checkpoints with CAMPAIGN_MAX_ATTEMPTS unset.');
if (replayRetriesOnly && !checkpointPath) throw new Error('CAMPAIGN_REPLAY_RETRIES_ONLY requires route checkpoints.');
const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { newCampaign, ENCOUNTERS, encounterDeck, encounterRivalPlan, encounterSkill, generateReward, prepareCampaignReward, settleCampaignMatch, emptyProfile, campaignDeckIssues } = await vite.ssrLoadModule('/src/lib/play/campaign.ts');
  const { CAMPAIGN_RIVAL_PLANS } = await vite.ssrLoadModule('/src/lib/play/campaignBalance.ts');
  if (encounters.some(stage => !Number.isInteger(stage) || stage < 1 || stage > ENCOUNTERS.length)) {
    throw new Error('CAMPAIGN_ENCOUNTERS must contain valid encounter numbers.');
  }
  const routeEncounters = maxAttempts ? ENCOUNTERS.slice(0, lastEncounter).map((_, index) => index + 1) : encounters;
  const { deckFromRecommended, COPY_MAX } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const { BY_SLUG } = await vite.ssrLoadModule('/src/lib/data.ts');
  const { cardScore, scoreDeck, compositionPenalty, rating } = await vite.ssrLoadModule('/src/lib/autobuild.ts');
  const { campaignCardFit, campaignCrew } = await vite.ssrLoadModule('/src/lib/play/campaignDeckRules.ts');
  const { hostileTakeoverSwaps } = await vite.ssrLoadModule('/src/lib/play/campaignRematch.ts');

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

  function upgrade(run, pack, policy, { cardsAlreadyGranted = false, swaps = policy.swaps } = {}) {
    if (!swaps && !cardsAlreadyGranted) return 0;
    const matchupValues = new Map();
    const matchupTuned = policy.matchup || policy.actThree;
    const matchup = slug => {
      if (!matchupTuned) return 0;
      if (!matchupValues.has(slug)) {
        const card = BY_SLUG.get(slug);
        let value = bossCardValue(card, run.starter);
        if (policy.actThree) {
          const cheapThreat = card.type === 'Unit' && (card.cost ?? Infinity) <= 4 && (card.power ?? 0) > 0;
          const answer = card.sellable && (card.cost ?? Infinity) <= 4 && rating(slug).roles.includes('removal');
          value = (cheapThreat ? 4 : 0) + (answer && policy.style === 'control' ? 4 : 0)
            - ((card.cost ?? 0) >= 6 ? 2 : 0) + value * 0.5;
          if (card.sellable) value += 1.5;
          if (policy.style === 'aggro' && card.type === 'Gear' && (card.power ?? 0) >= 2 && (card.cost ?? 0) <= 3) value += 3;
          if (policy.style === 'control' && rating(slug).roles.includes('blocker')) value += 2;
        }
        matchupValues.set(slug, value);
      }
      return matchupValues.get(slug);
    };
    const score = slug => cardScore(BY_SLUG.get(slug), run.deck.legends, policy.style) + matchup(slug);
    const deckScore = cards => {
      const base = scoreDeck(run.deck.legends, cards, policy.style);
      return matchupTuned ? base + Object.entries(cards).reduce((sum, [slug, count]) => sum + count * matchup(slug), 0) : base;
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
    if (!cardsAlreadyGranted) {
      for (const slug of pack.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    }
    if (choice) run.inventory[choice] = (run.inventory[choice] ?? 0) + 1;
    if (recruit) run.deck = recruit.deck;
    const crew = campaignCrew(run.deck.legends);
    const candidates = Object.keys(run.inventory).filter(slug => !campaignCardFit(BY_SLUG.get(slug), crew));
    let applied = 0;
    for (; applied < swaps; applied++) {
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
    return applied;
  }

  function play(run, rivalDeck, rivalSkill, plan, seat, seed, referenceSlots) {
    const player = prepareMatchDeck(run.deck), rival = prepareMatchDeck(rivalDeck);
    if (referenceSlots) player.mainDeck = referenceSlots;
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
    if (!error && !view?.gameEnded) {
      view = engine.getFilteredView(seat);
      if (!view.gameEnded) error = 'Command cap reached';
    }
    return { outcome: view?.winnerId ? view.winnerId === seat ? 'win' : 'loss' : 'draw',
      turns: view?.turnNumber, winReason: view?.winReason, referenceWentFirst: view?.players[seat].firstPlayer,
      commands, rivalMoves, rivalOpening, slowestMs: Math.round(slowestMs),
      ...(trace && { trace: actions }), error };
  }

  const results = [];
  const routes = [];
  const checkpoints = [];
  const matchCache = new Map();

  function benchmarkMatch(run, original, name, seed, seat, referenceSlots) {
    const { encounter, starter, attempts } = run;
    const stageTrial = trials[encounter + 1];
    const trial = stageTrial?.byStarter?.[starter] ?? stageTrial;
    const rival = trial?.deck ? deckFromRecommended(trial.deck) : encounterDeck(run);
    if (!rival) throw new Error(`Unknown trial deck: ${trial.deck}.`);
    if (trial?.legends) rival.legends = trial.legends;
    if (trial?.main) rival.cards = { ...trial.main };
    if (trial?.cards) {
      for (const [slug, delta] of Object.entries(trial.cards)) {
        rival.cards[slug] = (rival.cards[slug] ?? 0) + delta;
        if (!rival.cards[slug]) delete rival.cards[slug];
      }
    }
    const skill = fixedRivalSkill ?? trial?.skill ?? encounterSkill(run);
    // Register trial profiles in this process so they use the same filtered AI as live rivals.
    const trialPlan = trial?.profile ? `trial:${encounter + 1}:${starter}` : undefined;
    if (trialPlan) CAMPAIGN_RIVAL_PLANS[trialPlan] = trial.profile;
    const plan = useRivalPlan ? trialPlan ?? trial?.plan ?? encounterRivalPlan(run) : undefined;
    const firstAttemptSeed = `campaign-calibration:${starter}:${seed}:${encounter}`;
    const seedKey = attempts ? `${firstAttemptSeed}:retry:${attempts}` : firstAttemptSeed;
    const replaced = Object.entries(original).reduce((n, [slug, qty]) => n + Math.max(0, qty - (run.deck.cards[slug] ?? 0)), 0);
    const key = JSON.stringify([seedKey, seat, skill, plan, run.deck.legends, run.deck.cards, rival.legends, rival.cards, referenceSlots]);
    if (!matchCache.has(key)) matchCache.set(key, play(run, rival, skill, plan, seat, seedKey, referenceSlots));
    const result = { starter, policy: name, seed, seat, encounter: encounter + 1, opponent: rival.name, skill, plan, replaced,
      ...((maxAttempts || checkpointPath) && { attempt: attempts + 1, retryPacksBefore: run.retryPacks ?? 0 }),
      ...(trace && { deck: run.deck.cards, deckStats: compositionPenalty(run.deck.cards).stats }),
      ...matchCache.get(key) };
    results.push(result);
    if (result.error) console.error(result);
    return result;
  }

  function playRoute(initial, original, name, policy, seed, seat) {
    let run = structuredClone(initial);
    let profile = emptyProfile();
    let cleared = 0;
    let defeats = 0;
    let draws = 0;
    let failed = false;
    while (cleared < lastEncounter && run.attempts < maxAttempts) {
      if (checkpointStage && run.encounter + 1 >= checkpointStage) {
        const { match: _match, opponents: _opponents, ...state } = run;
        checkpoints.push({ state: structuredClone(state), seed, seat, policy: name });
      }
      if (run.encounter < ENCOUNTERS.length - 1) run.rewards[run.encounter] = prepareCampaignReward(run);
      run.phase = 'inMatch';
      const result = benchmarkMatch(run, original, name, seed, seat);
      if (result.error) { failed = true; break; }
      const match = { summary: { ended: true, matchId: `bench:${run.encounter}:${run.attempts}` } };
      run.match = match;
      ({ run, profile } = settleCampaignMatch(run, profile, match,
        result.outcome === 'win' ? 'player' : result.outcome === 'loss' ? 'rival' : null));
      if (result.outcome === 'win') {
        cleared++;
        if (cleared === lastEncounter) break;
        result.swapsAfter = upgrade(run, run.rewards[run.encounter], policy, { cardsAlreadyGranted: true });
        run = { ...run, encounter: run.encounter + 1, attempts: 0, defeats: 0, phase: 'upgrading' };
      } else {
        if (result.outcome === 'loss') defeats++;
        else draws++;
        const before = run.deck.cards;
        result.swapsAfter = upgrade(run, run.latestRetry, policy, { cardsAlreadyGranted: true, swaps: policy.skipRetryEdits ? 0 : policy.swaps });
        if (trace) result.retryChanges = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(run.deck.cards)])]
          .map(slug => [slug, (run.deck.cards[slug] ?? 0) - (before[slug] ?? 0)]).filter(([, delta]) => delta));
        run.phase = 'preparing';
      }
    }
    routes.push({ starter: run.starter, policy: name, seed, seat, cleared, defeats, draws,
      retryPacks: run.retryPacks ?? 0, status: failed ? 'error' : cleared === lastEncounter ? 'cleared' : 'attempt-cap' });
    if (process.env.CAMPAIGN_PROGRESS === '1') console.error(`${run.starter} ${name} seed ${seed}: cleared ${cleared}/${lastEncounter} after ${defeats} losses`);
  }

  if (checkpointPath) {
    const entries = JSON.parse(readFileSync(checkpointPath, 'utf8')).checkpoints;
    if (!entries?.length) throw new Error('No route checkpoints were saved.');
    for (const { state, seed, seat, policy } of entries) {
      if ((replayRetriesOnly && !state.attempts) || !encounters.includes(state.encounter + 1) || !starters.includes(state.starter)
          || !policies.includes(policy) || !referenceSeats.includes(seat)) continue;
      const initial = newCampaign(state.starter, state.id, state.seed, balanceVersions[balance]);
      const run = { ...state, opponents: initial.opponents, balanceVersion: initial.balanceVersion };
      if (balance === 'legacy') { delete run.balanceVersion; run.opponents = []; }
      benchmarkMatch(run, initial.deck.cards, policy, seed, seat);
      if (replayEdits && run.encounter === 7) {
        const edited = structuredClone(run);
        const suggestions = hostileTakeoverSwaps(edited).slice(0, replayEdits === 'one' ? 1 : 2);
        // Replay the same shuffle permutation with each incoming copy in its outgoing copy's slot.
        const slots = prepareMatchDeck(run.deck).mainDeck;
        for (const { incoming, outgoing } of suggestions) {
          slots[slots.indexOf(outgoing)] = incoming;
          if (--edited.deck.cards[outgoing] === 0) delete edited.deck.cards[outgoing];
          edited.deck.cards[incoming] = (edited.deck.cards[incoming] ?? 0) + 1;
        }
        const issues = campaignDeckIssues(edited, edited.deck);
        if (issues.length) throw new Error(issues.join(' '));
        const result = benchmarkMatch(edited, initial.deck.cards, `${policy}+${replayEdits}-swap`, seed, seat, slots);
        result.replaySwaps = suggestions.length;
      }
    }
    if (!results.length) throw new Error('No route checkpoints matched the requested sweep.');
  } else for (const starter of starters) for (const name of policies) {
    const policy = policiesByName[name];
    if (!policy) throw new Error(`Unknown upgrade policy: ${name}`);
    if (!maxAttempts && policy.skipRetryEdits) throw new Error(`${name} requires CAMPAIGN_MAX_ATTEMPTS.`);
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed++) {
      const run = newCampaign(starter, `${starter}:${seed}`, `campaign-balance:${seed}`, balanceVersions[balance]);
      if (balance === 'legacy') { delete run.balanceVersion; run.opponents = []; }
      const original = { ...run.deck.cards };
      if (maxAttempts) {
        for (const seat of referenceSeats) playRoute(run, original, name, policy, seed, seat);
        continue;
      }
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
          for (const seat of referenceSeats) benchmarkMatch(run, original, name, seed, seat);
        }
        if (policy.swaps && encounter + 1 < lastEncounter) upgrade(run, generateReward(run), policy);
      }
    }
  }
  const reportedPolicies = replayEdits ? policies.flatMap(name => [name, `${name}+${replayEdits}-swap`]) : policies;
  for (const [index, encounter] of ENCOUNTERS.entries()) {
    const played = results.filter(result => result.encounter === index + 1);
    if (!played.length) continue;
    console.log(`${index + 1} ${encounter.title}`);
    for (const starter of starters) {
      const summary = reportedPolicies.map(policy => {
        const games = played.filter(game => game.starter === starter && game.policy === policy);
        const wins = games.filter(game => game.outcome === 'win').length;
        if (!maxAttempts) return `${policy} ${wins}/${games.length}`;
        const first = games.filter(game => game.attempt === 1);
        return `${policy} ${first.filter(game => game.outcome === 'win').length}/${first.length} first tries, ${wins}/${games.length} total`;
      });
      console.log(`  ${starter} ${summary.join(' | ')}`);
    }
  }
  for (const starter of starters) for (const policy of policies) {
    const group = routes.filter(run => run.starter === starter && run.policy === policy);
    if (group.length) console.log(`${starter} ${policy}: ${group.filter(run => run.status === 'cleared').length}/${group.length} cleared through encounter ${lastEncounter}`);
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({
    firstSeed, seedCount, policies: reportedPolicies, encounters: routeEncounters,
    playerSkill, fixedRivalSkill, useRivalPlan, retryPacks, referenceSeats, balance, trials, results,
    ...(maxAttempts && { maxAttempts, routes }), ...(checkpointStage && { checkpoints }),
  }, null, 2) + '\n');
  if (results.some(result => result.error)) process.exitCode = 1;
} finally { await vite.close(); }
