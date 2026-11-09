// Pure price-building logic for scripts/sync-data.mjs (no network, unit-tested in
// src/lib/priceBuild.test.ts). Turns the card catalog plus TCGplayer rows into exact per-printing
// quotes and verified Retail/Beta equivalence pairs.
//
// Rules:
// - A printing only gets a quote from a TCGplayer row matched by set + collector number.
// - If more than one distinct row matches (e.g. Normal and Foil rows under one number), the match
//   is ambiguous: the catalog has no finish data to choose, so the printing stays unpriced.
// - Only market price and lowest listing are kept. Mid price is not used.
// - Pairs: a Retail printing and its Beta twin (same card, same rarity, same collector number in the
//   twin set) are verified equivalents. The app may use the Beta market price to value a thinly
//   traded Retail holding, labelled "Beta proxy". Pairs are never used for buying estimates.

export const PAIR_SETS = [
  ['Welcome to Night City — Retail', 'Welcome to Night City — Beta'],
  ['The Heist — Retail Starter Deck', 'The Heist — Beta Starter Deck'],
  ['Embracing Power — Retail Starter Deck', 'Embracing Power — Beta Starter Deck'],
  ['Box Toppers — Retail', 'Box Toppers — Beta'],
  ['Pre-Release Retail', 'Pre-Release Beta'],
];

export const tcgSetName = (s) =>
  s.replace(/ — /g, ' - ').replace(/ S 1$/, ' Season 1').replace(/Showdown S1/, 'Showdown Season 1');
export const normNum = (n) => (n || '').replace(/^β/, 'B').replace(/^0+(?=\d)/, '').toLowerCase();
const digits = (n) => (n || '').replace(/^β/, '').replace(/^0+(?=\d)/, '');
const pos = (x) => (typeof x === 'number' && x > 0 ? Math.round(x * 100) / 100 : null);

/**
 * @param cardList catalog cards with printings [{id,set,num,rarity}]
 * @param rows TCGplayer rows [{set,num,productId,finish,market,low,url}]
 */
export function buildPrices(cardList, rows) {
  const idx = new Map();
  for (const r of rows) {
    if (!r.num) continue;
    const k = `${r.set}|${normNum(r.num)}`;
    const list = idx.get(k) ?? [];
    // the same product+finish listed twice is one row, not an ambiguity
    if (!list.some((x) => x.productId === r.productId && x.finish === r.finish)) list.push(r);
    idx.set(k, list);
  }
  const printings = {};
  const ambiguous = [];
  let matched = 0;
  for (const c of cardList) {
    for (const p of c.printings) {
      const hits = idx.get(`${tcgSetName(p.set)}|${normNum(p.num)}`) ?? [];
      if (!hits.length) continue;
      if (hits.length > 1) {
        ambiguous.push({ printingId: p.id, card: c.slug, set: p.set, num: p.num, finishes: hits.map((h) => h.finish) });
        continue;
      }
      matched++;
      const r = hits[0];
      const market = pos(r.market);
      const low = pos(r.low);
      if (market == null && low == null) continue;
      printings[p.id] = { market, low, finish: r.finish ?? null, url: r.url ?? null };
    }
  }
  const pairs = {};
  for (const c of cardList) {
    for (const [retailSet, betaSet] of PAIR_SETS) {
      for (const p of c.printings.filter((x) => x.set === retailSet)) {
        const twins = c.printings.filter((q) => q.set === betaSet && q.rarity === p.rarity && digits(q.num) === digits(p.num));
        if (twins.length === 1) pairs[p.id] = twins[0].id;
      }
    }
  }
  return { printings, pairs, ambiguous, matched };
}
