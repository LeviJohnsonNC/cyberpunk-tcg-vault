#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://api.netdeck.gg/api/cyberpunk/decks/public';
const PAGE_SIZE = 100;
const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const DATA = new URL('../src/data/', import.meta.url);
const normalizeName = name => name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

async function fetchPage(offset) {
  const url = new URL(API);
  url.search = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort: 'recent', format: 'standard' });
  const response = await fetch(url, {
    headers: { 'user-agent': 'cyberpunk-tcg-vault/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Community decks request failed (${response.status}).`);
  return response.json();
}

export async function collectCommunityMeta(cards, now = new Date(), loadPage = fetchPage) {
  const legendsByName = new Map(cards.filter(card => card.type === 'Legend')
    .map(card => [normalizeName(card.display), card]));
  const asOf = now.toISOString().slice(0, 10);
  const cutoff = Date.parse(asOf) - (WINDOW_DAYS - 1) * DAY_MS;
  const windowStart = new Date(cutoff).toISOString().slice(0, 10);
  const legendCounts = new Map();
  const colourCounts = new Map();
  const crewCounts = new Map();
  const seenDecks = new Set();
  let offset = 0;
  let total;
  let previousTime = Infinity;
  let latestDeckAt;
  let deckCount = 0;

  // The public list is sorted by last edit. Read through the cutoff without fetching individual decks.
  pages: do {
    const page = await loadPage(offset);
    total ??= page.total;
    if (!Number.isSafeInteger(total) || total < 1 || page.total !== total || page.offset !== offset
        || !Array.isArray(page.items) || !page.items.length || offset + page.items.length > total) {
      throw new Error('Community deck pagination changed during the refresh.');
    }
    for (const deck of page.items) {
      const updated = Date.parse(deck.updated_at);
      if (!deck.id || seenDecks.has(deck.id) || !Number.isFinite(updated) || updated > previousTime) {
        throw new Error('Community deck results are duplicated or out of date order.');
      }
      seenDecks.add(deck.id);
      previousTime = updated;
      if (updated < cutoff) break pages;
      if (updated > now.getTime() || deck.format?.code !== 'standard' || deck.is_valid !== true) continue;

      const preview = deck.preview;
      // Netdeck puts the three crew Legends first in featured_cards.
      const crew = preview?.featured_cards?.slice(0, 3).map(card => legendsByName.get(normalizeName(card.name)));
      const colours = crew?.map(card => card?.color).sort();
      if (preview?.zone_counts?.legends !== 3 || crew?.length !== 3 || crew.some(card => !card)
          || preview.legend_colors?.slice().sort().join() !== colours.join()) {
        throw new Error('A public deck has an unrecognized Legend preview. Check the official card data and deck feed.');
      }

      latestDeckAt ??= deck.updated_at;
      deckCount++;
      const slugs = crew.map(card => card.slug).sort();
      for (const slug of new Set(slugs)) {
        legendCounts.set(slug, (legendCounts.get(slug) ?? 0) + 1);
      }
      const crewKey = slugs.join('/');
      crewCounts.set(crewKey, (crewCounts.get(crewKey) ?? 0) + 1);
      const combo = [...new Set(colours)].join('/');
      colourCounts.set(combo, (colourCounts.get(combo) ?? 0) + 1);
    }
    offset += page.items.length;
  } while (offset < total);

  if (!deckCount) throw new Error('No public Constructed decks in the snapshot window.');
  const byCount = ([keyA, countA], [keyB, countB]) => countB - countA || keyA.localeCompare(keyB, 'en');
  return {
    asOf,
    windowStart,
    latestDeckAt,
    deckCount,
    legends: [...legendCounts].sort(byCount).map(([slug, count]) => ({ slug, count })),
    colours: [...colourCounts].sort(byCount).map(([combo, count]) => ({ colours: combo.split('/'), count })),
    crews: Object.fromEntries([...crewCounts].sort(byCount)),
  };
}

export async function refreshCommunityMeta(cards) {
  const stats = await collectCommunityMeta(cards);
  await writeFile(new URL('community-meta.json', DATA), JSON.stringify(stats, null, 2) + '\n');
  console.log(`Community meta updated from ${stats.deckCount} Constructed decks through ${stats.asOf}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const cards = JSON.parse(await readFile(new URL('cards.json', DATA), 'utf8'));
    await refreshCommunityMeta(cards);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
