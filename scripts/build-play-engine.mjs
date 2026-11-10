import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const revision = '6de59de1c203827edc1bc6faa1bc6184cd126a5f';
const vendor = fileURLToPath(new URL('../vendor/cyberpunk-engine/', import.meta.url));
const source = process.argv[2];
if (!source) throw new Error('Pass the path to a clone of TheCardGoat/tcg-engines.');

const paths = [
  ['@tcg/cyberpunk-types', 'cyberpunk/packages/types'],
  ['@tcg/cyberpunk-cards', 'cyberpunk/packages/cards'],
  ['@tcg/cyberpunk-engine', 'cyberpunk/packages/engine'],
  ['@tcg/bot-core', 'agnostic-simulator/packages/bot-core'],
  ['@tcg/engine-core', 'agnostic-simulator/packages/engine-core'],
  ['@tcg/card-model', 'agnostic-simulator/packages/card-model'],
  ['@tcg/protocol', 'agnostic-simulator/packages/protocol'],
];
const checkout = mkdtempSync(join(tmpdir(), 'vault-engine-'));
try {
  const packages = paths.map(([, path]) => 'submodules/' + path);
  const archive = execFileSync('git', [
    '-C', resolve(source), 'archive', revision, ...packages,
    'submodules/agnostic-simulator/packages/typescript-config',
  ], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', checkout], { input: archive });
  const patches = ['hide-shuffled-legends.patch', 'retail-rules.patch', 'manual-payments.patch', 'program-resolution.patch', 'rules-boundaries.patch'];
  execFileSync('git', ['apply', ...patches.map(file => join(vendor, file))], { cwd: checkout });

  const engine = join(checkout, 'submodules/cyberpunk/packages/engine/src');
  const core = join(checkout, 'submodules/agnostic-simulator/packages/engine-core/src');
  const alias = [
    { find: "@tcg/cyberpunk-engine/view/filter", replacement: join(engine, "view/filter.ts") },
    { find: '@tcg/engine-core/test-simulator', replacement: join(core, 'test-simulator.ts') },
    { find: /^@tcg\/cyberpunk-engine\/automation\/(.*)$/, replacement: engine + '/automation/$1.ts' },
    ...paths.map(([find, path]) => ({ find, replacement: join(checkout, 'submodules', path, 'src/index.ts') })),
    { find: 'mutative', replacement: join(vendor, 'node_modules/mutative/dist/mutative.esm.mjs') },
    { find: 'zod', replacement: join(vendor, 'node_modules/zod/index.js') },
  ];
  const notices = ['LICENSE', 'LICENSE.mutative', 'LICENSE.zod']
    .map(file => readFileSync(join(vendor, file), 'utf8').trim())
    .join('\n\n');
  const [output] = [await build({
    configFile: false,
    resolve: { alias },
    build: {
      target: 'es2023', minify: true, write: false,
      lib: { entry: join(vendor, 'entry.ts'), formats: ['es'] },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  })].flat();
  const [chunk] = output.output;
  if (output.output.length !== 1 || chunk.type !== 'chunk') throw new Error('Expected a single engine module.');
  const code = chunk.code.replace(/^\/\/ .*vault-engine-[^/]+\/(submodules\/.*)$/gm, '// upstream/$1');
  writeFileSync(join(vendor, 'engine.mjs'), `/*! Generated from tcg-engines ${revision}\n\n${notices}\n*/\n${code}`);
} finally {
  rmSync(checkout, { recursive: true, force: true });
}
