/** Run from the repository root. Usage: node scripts/benchmark-planner.mjs [output.json] [reference.json] */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { plannerCases, plannerPosition } = await vite.ssrLoadModule('/src/dev/plannerPositions.ts');
  const { LocalEngine, SeededRNG } = await vite.ssrLoadModule('/vendor/cyberpunk-engine/engine.mjs');
  const { botDecision, botDeckTypePrior, botView } = await vite.ssrLoadModule('/src/lib/play/engineSession.ts');
  const { planTurn } = await vite.ssrLoadModule('/src/lib/play/coachPlanner.ts');
  const { explainMove } = await vite.ssrLoadModule('/src/lib/play/coachTeaching.ts');

  const repetitions = 5;
  const cases = [];
  for (const name of plannerCases) {
    const position = plannerPosition(name);
    const { state, known, legendMemory } = position.checkpoint;
    const memory = new Map([...(legendMemory ?? [])].filter(([id]) => known.get(id)?.has('player')));
    const knowledge = { legends: memory, deckTypePrior: botDeckTypePrior(position.setup.player.mainDeck) };
    const view = botView(new LocalEngine(state), 'player', memory);
    // Fingerprint the actual inputs to strategy comparisons, including payment choices.
    // This lets a later run detect fixture drift separately from a changed recommendation.
    const inputHash = createHash('sha256').update(JSON.stringify([view, knowledge.deckTypePrior])).digest('hex');

    const decisions = {};
    for (const policy of ['coach', 'standard', 'sharp', 'masterful']) {
      const samples = [];
      let decision;
      for (let i = 0; i <= repetitions; i++) {
        const fresh = structuredClone(position);
        let result, elapsed;
        if (policy === 'coach') {
          const start = performance.now();
          const plan = planTurn(fresh);
          elapsed = performance.now() - start;
          result = { focus: plan.focus, line: plan.steps.map(step => step.title), alternative: plan.alternative?.title };
        } else {
          // Use the bot's automatic payment path, seated on the pictured side of the table.
          delete fresh.checkpoint.state.G.manualPaymentPlayerId;
          const engine = new LocalEngine(fresh.checkpoint.state);
          const rng = new SeededRNG('planner-decision:' + name);
          const start = performance.now();
          const move = botDecision(engine, 'player', () => rng.next(), policy, undefined, knowledge);
          elapsed = performance.now() - start;
          assert.ok(move && move.move !== 'concede', `${name}: ${policy} returned no playable move`);
          const response = engine.processCommand({ commandID: 'benchmark', move: move.move, input: { args: move.args ?? {} } }, 'player');
          assert.ok(response.success, `${name}: ${policy} returned an illegal move: ${response.error}`);
          result = { ...move, title: explainMove(view, move).title };
        }
        if (i > 0) {
          assert.deepEqual(result, decision, `${name}: ${policy} decision changed between samples`);
          samples.push(elapsed);
        }
        decision = result;
      }
      samples.sort((a, b) => a - b);
      decisions[policy] = { ...decision, medianMs: Number(samples[Math.floor(repetitions / 2)].toFixed(2)) };
    }
    cases.push({ name, inputHash, decisions });
  }
  if (process.argv[3]) {
    const reference = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const inputs = rows => rows.map(({ name, inputHash }) => [name, inputHash]);
    assert.deepEqual(inputs(cases), inputs(reference.cases), 'Public positions differ from the reference benchmark');
  }
  const report = { environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0].model },
    timing: { warmups: 1, samples: repetitions, statistic: 'median, milliseconds', scope: 'local full coach plan or one local opponent decision' }, cases };
  const output = JSON.stringify(report, null, 2) + '\n';
  if (process.argv[2]) writeFileSync(process.argv[2], output);
  else process.stdout.write(output);
} finally {
  await vite.close();
}
