#!/usr/bin/env node
// Pass extracted TCGCSV date directories, e.g. node scripts/backfill-price-history.mjs /tmp/2026-10-14
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { archiveQuotes, priceSnapshot, saveWeekly } from './price-history.mjs';

const dates = process.argv.slice(2);
if (!dates.length) throw new Error('Pass one or more extracted YYYY-MM-DD archive directories.');
const latest = JSON.parse(await readFile(new URL('../src/data/prices.json', import.meta.url), 'utf8'));
const output = new URL('../src/data/price-history.json', import.meta.url);

for (const path of dates) {
  const date = basename(path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error(`Invalid archive date: ${date}`);
  const category = join(path, '92');
  const groups = await readdir(category, { withFileTypes: true });
  const rows = [];
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const data = JSON.parse(await readFile(join(category, group.name, 'prices'), 'utf8'));
    rows.push(...data.results);
  }
  const snapshot = priceSnapshot(date, archiveQuotes(latest.printings, rows));
  const count = Object.keys(snapshot.quotes).length;
  if (!count) throw new Error(`No verified Cyberpunk quotes matched for ${date}`);
  await saveWeekly(output, snapshot);
  console.log(`${date} · ${count} matched printings`);
}

await saveWeekly(output, priceSnapshot(latest.updatedAt, latest.printings));
