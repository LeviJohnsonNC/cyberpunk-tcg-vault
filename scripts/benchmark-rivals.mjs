/** Reproducible public-information AI smoke/latency benchmark. Not a strength rating. */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, initialEngineState } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { prepareMatchDeck } = await vite.ssrLoadModule('/src/lib/play/matchDeck.ts');
  const { deckFromRecommended } = await vite.ssrLoadModule('/src/lib/decks.ts');
  const { RECOMMENDED } = await vite.ssrLoadModule('/src/lib/data.ts');
  const results = [];
  for (const skill of ['standard', 'sharp', 'masterful']) for (const [index, list] of RECOMMENDED.entries()) for (const side of ['player', 'rival']) {
    if (process.env.BENCH_DECK && list.id !== process.env.BENCH_DECK) continue;
    if (process.env.BENCH_SKILL && skill !== process.env.BENCH_SKILL) continue;
    const other = RECOMMENDED[(index + 5) % RECOMMENDED.length];
    const names = side === 'player' ? [list, other] : [other, list];
    const seed = `vault-roster-v1:${index}:${side}`;
    const setup = Object.fromEntries(['player','rival'].map((seat,i) => [seat, prepareMatchDeck(deckFromRecommended(names[i].id))]));
    const engine = new LocalEngine(initialEngineState(setup, seed, seed));
    const rng = new SeededRNG(seed + ':moves');
    const timings = [], counts = {}; let error, steps = 0, view;
    const started = performance.now();
    try {
      for (; steps < 800; steps++) {
        view = engine.getFilteredView(side);
        if (view.gameEnded) break;
        const active = ['player','rival'].find(seat => ['action','choice'].includes(engine.getFilteredView(seat).prompt.status));
        if (!active) throw new Error('No active decision');
        const t = performance.now();
        const move = botDecision(engine, active, () => rng.next(), active === side ? skill : 'standard');
        if (active === side) timings.push(performance.now() - t);
        if (!move) throw new Error('No move returned');
        counts[move.move] = (counts[move.move] ?? 0) + 1;
        const result = engine.processCommand({ commandID: String(steps), move: move.move, input: move.args ? { args: move.args } : undefined }, active);
        if (!result.success) throw new Error(`${active} ${move.move}: ${result.error}`);
      }
      if (!view?.gameEnded) throw new Error('Command cap reached');
    } catch (cause) { error = String(cause); }
    timings.sort((a,b)=>a-b);
    const result = { skill, deck: list.id, opponent: other.id, side, seed, steps, turns: view?.turnNumber, winner: view?.winnerId, reason: view?.winReason, error, p95Ms: Math.round(timings[Math.floor(timings.length*.95)] ?? 0), maxMs: Math.round(timings.at(-1) ?? 0), elapsedMs: Math.round(performance.now()-started), moves: counts };
    results.push(result); console.log(JSON.stringify(result));
  }
  const output = process.argv[2];
  if (output) writeFileSync(output, JSON.stringify({ description: 'Each curated list at all three skills, both seats, versus a Standard opponent. Seeds and pairings are fixed; this is coverage and latency evidence, not a calibrated strength estimate.', results }, null, 2) + '\n');
  if (results.some(r=>r.error)) process.exitCode = 1;
} finally { await vite.close(); }
