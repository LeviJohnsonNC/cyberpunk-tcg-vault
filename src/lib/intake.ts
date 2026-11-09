import { BY_SLUG, CARDS, defaultPrinting, isUnspecified, MAX_PRINTING_COPIES, normalizePrinting, searchCards, type Card } from './data';
import type { Entry } from './store';

const searchKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const numberKey = (text: string) => text.toLowerCase().replace(/^#?\s*/, '').replace(/^(β?)0+(?=\d)/, '$1');

export function searchIntake(query: string) {
  const text = query.trim();
  if (!text) return [];
  const key = searchKey(text);
  const number = numberKey(text);
  const collectorSearch = /^β?\d+$/u.test(number);
  const catalogMatches = new Set(!text.startsWith('#') ? searchCards(text) : []);
  const results: { card: Card; printingId: string; rank: number }[] = [];
  for (const card of CARDS) {
    const base = defaultPrinting(card);
    const numbered = collectorSearch ? card.printings.filter((p) => numberKey(p.num) === number) : [];
    const name = searchKey(card.name);
    const display = searchKey(card.display);
    const rank = numbered.length ? 0
      : !key || text.startsWith('#') ? -1
      : display === key || name === key ? 1
      : name.startsWith(key) || display.startsWith(key) ? 2
      : display.includes(key) ? 3
      : catalogMatches.has(card) ? 4 : -1;
    if (rank < 0) continue;
    results.push({ card, printingId: numbered.find((p) => p.id === base.id)?.id ?? numbered[0]?.id ?? base.id, rank });
  }
  return results.sort((a, b) => a.rank - b.rank || a.card.display.localeCompare(b.card.display));
}

export function readVaultFile(value: unknown) {
  const rows = !Array.isArray(value) && value && typeof value === 'object' && 'entries' in value ? value.entries : value;
  if (!Array.isArray(rows)) throw new Error('Choose a Vault JSON export with a list of collection entries.');
  const items = new Map<string, Entry>();
  let skipped = 0;
  let unverified = 0;

  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.slug !== 'string' || !BY_SLUG.has(row.slug)) {
      skipped++;
      continue;
    }
    const qty = typeof row.qty === 'string' && /^\d+$/.test(row.qty.trim()) ? Number(row.qty) : row.qty;
    if (!Number.isSafeInteger(qty) || qty < 1) {
      skipped++;
      continue;
    }
    const printingId = normalizePrinting(row.slug, typeof row.printingId === 'string' ? row.printingId : undefined);
    if (isUnspecified(printingId) && row.printingId !== printingId) unverified++;
    const entry = items.get(printingId);
    const note = typeof row.note === 'string' && row.note ? row.note : entry?.note;
    items.set(printingId, { slug: row.slug, printingId, qty: (entry?.qty ?? 0) + qty, note });
  }
  return { items: [...items.values()], skipped, unverified };
}

export function previewVaultImport(items: Entry[], entries: Entry[]) {
  const holdings = new Map(entries.map((entry) => [entry.printingId, entry]));
  const rows = items.map((entry) => {
    const current = holdings.get(entry.printingId);
    const before = current?.qty ?? 0;
    const qty = Math.min(entry.qty, Math.max(0, MAX_PRINTING_COPIES - before));
    return { entry: { ...entry, qty }, fromFile: entry.qty, before, after: before + qty, noteChanges: !!(qty && entry.note && current?.note && entry.note !== current.note) };
  });
  const additions = rows.filter((row) => row.entry.qty > 0).map((row) => row.entry);
  const total = additions.reduce((sum, entry) => sum + entry.qty, 0);
  const capped = rows.filter(({ fromFile, entry }) => entry.qty < fromFile).length;
  const unspecified = additions.reduce((sum, entry) => sum + (isUnspecified(entry.printingId) ? entry.qty : 0), 0);
  return { rows, additions, total, capped, unspecified };
}
