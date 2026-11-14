import { readFile, writeFile } from 'node:fs/promises';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const WEDNESDAY = Date.UTC(1970, 0, 7);
export const weekStart = (date) => new Date(Math.floor((Date.parse(date.slice(0, 10)) - WEDNESDAY) / WEEK) * WEEK + WEDNESDAY).toISOString().slice(0, 10);
const cents = (price) => Number.isFinite(price) && price > 0 ? Math.round(price * 100) || null : null;

export function priceSnapshot(date, printings) {
  const quotes = Object.entries(printings).flatMap(([id, { market, low }]) => {
    const quote = [cents(market), cents(low)];
    return quote.some((price) => price !== null) ? [[id, quote]] : [];
  });
  return { date: date.slice(0, 10), quotes: Object.fromEntries(quotes.sort(([a], [b]) => a.localeCompare(b))) };
}

export function retainWeekly(snapshots, snapshot) {
  if (!Object.keys(snapshot.quotes).length) return snapshots;
  const byWeek = new Map(snapshots.map((item) => [weekStart(item.date), item]));
  const week = weekStart(snapshot.date);
  const saved = byWeek.get(week);
  // Keep the earliest successful capture in each week, regardless of sync retries.
  if (!saved || snapshot.date < saved.date) byWeek.set(week, snapshot);
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
}

export async function saveWeekly(path, snapshot) {
  let snapshots = [];
  try {
    snapshots = JSON.parse(await readFile(path, 'utf8')).snapshots;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const next = retainWeekly(snapshots, snapshot);
  if (JSON.stringify(next) === JSON.stringify(snapshots)) return;
  await writeFile(path, JSON.stringify({ version: 1, snapshots: next }) + '\n');
}

export function archiveQuotes(printings, rows) {
  const key = (productId, finish) => `${productId}:${finish}`;
  const catalog = new Map();
  for (const [id, { productId, url, finish }] of Object.entries(printings)) {
    const product = productId ?? url?.match(/\/product\/(\d+)(?:\/|$)/)?.[1];
    if (!product || !finish) continue;
    const match = key(product, finish);
    catalog.set(match, catalog.has(match) ? null : id);
  }
  const matches = new Map();
  for (const { productId, subTypeName, marketPrice, lowPrice } of rows) {
    const id = catalog.get(key(productId, subTypeName));
    if (!id) continue;
    const quote = { market: marketPrice, low: lowPrice };
    const previous = matches.get(id);
    if (previous === null || (previous && (previous.market !== quote.market || previous.low !== quote.low))) {
      matches.set(id, null);
    } else {
      matches.set(id, quote);
    }
  }
  return Object.fromEntries([...matches].filter(([, quote]) => quote !== null));
}
