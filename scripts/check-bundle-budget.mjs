import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

// Count the entire static import graph, not just app.js. Dynamic routes are excluded.
const manifest = JSON.parse(await readFile(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8'));
const seen = new Set();
const scripts = new Set();
const styles = new Set();
function visit(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  assert.ok(chunk, `Missing manifest entry: ${key}`);
  scripts.add(chunk.file);
  for (const css of chunk.css ?? []) styles.add(css);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
visit('index.html');
async function measure(files) {
  const sizes = await Promise.all([...files].map(async (file) => {
    const bytes = await readFile(new URL(`../dist/${file}`, import.meta.url));
    return { raw: bytes.length, gzip: gzipSync(bytes).length };
  }));
  return sizes.reduce((sum, size) => ({ raw: sum.raw + size.raw, gzip: sum.gzip + size.gzip }), { raw: 0, gzip: 0 });
}
const js = await measure(scripts);
const css = await measure(styles);
console.log(`Initial JS: ${(js.raw / 1000).toFixed(1)} kB raw, ${(js.gzip / 1000).toFixed(1)} kB gzip (${scripts.size} chunks)`);
console.log(`Initial CSS: ${(css.gzip / 1000).toFixed(1)} kB gzip`);
assert.ok(js.gzip <= 285_000, 'Initial JavaScript exceeds the 285 kB gzip budget');
assert.ok(css.gzip <= 35_000, 'Initial CSS exceeds the 35 kB gzip budget');
