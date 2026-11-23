/** Full matches for roster smoke testing or paired difficulty comparisons (--paired). */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, botDeckTypePrior, recordLegendPeeks, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { deckFromRecommended } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const { RECOMMENDED } = await vite.ssrLoadModule('/src/lib/data.ts');
  const paired = process.argv.includes('--paired');
  const output = process.argv.slice(2).find(arg => arg !== '--paired');
  const results = [];
  const opponentSkill = process.env.BENCH_OPPONENT_SKILL ?? 'standard';
  const skills = ['standard', 'sharp', 'masterful'];
  if (!skills.includes(opponentSkill) || (process.env.BENCH_SKILL && !skills.includes(process.env.BENCH_SKILL))) {
    throw new Error('Unknown skill');
  }
  const seedPrefix = process.env.BENCH_SEED_PREFIX ?? (paired ? 'vault-calibration-v1' : 'vault-roster-v1');

  function playGame(names, skill, side, seed) {
    const setup = Object.fromEntries(['player','rival'].map((seat,i) => [seat, prepareMatchDeck(deckFromRecommended(names[i].id))]));
    const state = initialEngineState(setup, seed, seed);
    if (paired) delete state.G.manualPaymentPlayerId;
    const engine = new LocalEngine(state);
    const rng = new SeededRNG(seed + ':moves');
    const known = new Map(), legendMemory = new Map();
    const priors = Object.fromEntries(['player', 'rival'].map(seat => [seat, botDeckTypePrior(setup[seat].mainDeck)]));
    const timings = [], counts = {}; let error, steps = 0, view;
    const started = performance.now();
    try {
      for (; steps < 800; steps++) {
        view = engine.getFilteredView(side);
        if (view.gameEnded) break;
        const active = ['player','rival'].find(seat => ['action','choice'].includes(engine.getFilteredView(seat).prompt.status));
        if (!active) throw new Error('No active decision');
        const t = performance.now();
        const move = botDecision(engine, active, () => rng.next(), active === side ? skill : opponentSkill, undefined, {
          legends: new Map([...legendMemory].filter(([id]) => known.get(id)?.has(active))), deckTypePrior: priors[active],
        });
        if (active === side) timings.push(performance.now() - t);
        if (!move) throw new Error('No move returned');
        counts[move.move] = (counts[move.move] ?? 0) + 1;
        const result = engine.processCommand({ commandID: String(steps), move: move.move, input: move.args ? { args: move.args } : undefined }, active);
        if (!result.success) throw new Error(`${active} ${move.move}: ${result.error}`);
        recordLegendPeeks(result.state, result.gameEvents, known, legendMemory);
      }
      if (!view?.gameEnded) throw new Error('Command cap reached');
    } catch (cause) { error = String(cause); }
    timings.sort((a,b)=>a-b);
    const [deck, opponent] = side === 'player' ? names : [names[1], names[0]];
    return {
      skill, opponentSkill, deck: deck.id, opponent: opponent.id, side, seed, steps,
      turns: view?.turnNumber, winner: view?.winnerId, reason: view?.winReason, error,
      p95Ms: Math.round(timings[Math.floor(timings.length * .95)] ?? 0),
      maxMs: Math.round(timings.at(-1) ?? 0), elapsedMs: Math.round(performance.now() - started), moves: counts,
    };
  }

  // In paired mode both policies get each seat on exactly the same deal.
  // Only the policy assignment changes between the two games.
  for (const skill of skills) for (const [index, list] of RECOMMENDED.entries()) for (const side of ['player', 'rival']) {
    if (process.env.BENCH_DECK && list.id !== process.env.BENCH_DECK) continue;
    if (process.env.BENCH_SKILL && skill !== process.env.BENCH_SKILL) continue;
    const other = RECOMMENDED[(index + 5) % RECOMMENDED.length];
    const names = paired || side === 'player' ? [list, other] : [other, list];
    const seed = paired ? `${seedPrefix}:${index}` : `${seedPrefix}:${index}:${side}`;
    const result = playGame(names, skill, side, seed);
    results.push(result);
    console.log(JSON.stringify(result));
  }
  if (!results.length) throw new Error('No matching games');
  const description = paired
    ? 'Identical decks, deal, seats, automatic payment and initial random streams per pair. Only the strategy assignment is swapped.'
    : `Each selected curated list/skill, both seats, versus ${opponentSkill}. Seeds use ${seedPrefix}; this is coverage and latency evidence, not a calibrated strength estimate. Includes registered deck priors and seat-scoped observed Legend memory.`;
  if (output) writeFileSync(output, JSON.stringify({ description, results }, null, 2) + '\n');
  if (results.some(r=>r.error)) process.exitCode = 1;
} finally { await vite.close(); }
