#!/usr/bin/env node
// Pass extracted TCGCSV dates (YYYY-MM-DD directories), or YYYY-MM-DD.json files
// containing the combined price rows from category 92 for each date.
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { archiveQuotes, priceSnapshot, saveDaily } from './price-history.mjs';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass at least one extracted archive date or combined JSON file.');
const latest = JSON.parse(await readFile(new URL('../src/data/prices.json', import.meta.url), 'utf8'));
// Keep earlier verified points for listings that are no longer uniquely matched.
const weekly = JSON.parse(await readFile(new URL('../src/data/price-history.json', import.meta.url), 'utf8'));
const snapshots = [...weekly.snapshots];

for (const path of paths) {
  const file = extname(path) === '.json';
  const date = basename(path, file ? '.json' : '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error(`Invalid archive date: ${date}`);
  let rows;
  if (file) {
    rows = JSON.parse(await readFile(path, 'utf8'));
  } else {
    const category = join(path, '92');
    const groups = await readdir(category, { withFileTypes: true });
    const results = await Promise.all(groups.filter((group) => group.isDirectory()).map(async (group) =>
      JSON.parse(await readFile(join(category, group.name, 'prices'), 'utf8')).results));
    rows = results.flat();
  }
  const snapshot = priceSnapshot(date, archiveQuotes(latest.printings, rows));
  snapshots.push(snapshot);
  console.log(`${date} · ${Object.keys(snapshot.quotes).length} exact printing quotes`);
}
await saveDaily(new URL('../src/data/printing-price-history.json', import.meta.url), snapshots);
