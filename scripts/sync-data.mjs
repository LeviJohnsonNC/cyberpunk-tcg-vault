#!/usr/bin/env node
// Pulls the full Cyberpunk TCG card database (official netdeck.gg API),
// TCGplayer prices (via tcgcsv.com daily mirror) and the USD->CAD rate,
// then writes src/data/cards.json and src/data/prices.json.
// Run: node scripts/sync-data.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const CARD_API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const TCG = 'https://tcgcsv.com/tcgplayer/92';
const OUT = new URL('../src/data/', import.meta.url);

const getJSON = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': 'cyberpunk-tcg-vault/1.0' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

const isFrench = (s) => /\bFR\b|French/.test(s);
const tcgSetName = (s) =>
  s.replace(/ — /g, ' - ').replace(/ S 1$/, ' Season 1').replace(/Showdown S1/, 'Showdown Season 1');
const normNum = (n) => (n || '').replace(/^β/, 'B').replace(/^0+(?=\d)/, '').toLowerCase();

async function cards() {
  const all = [];
  for (let offset = 0; ; offset += 60) {
    const page = await getJSON(`${CARD_API}?offset=${offset}&limit=60`);
    all.push(...page.items);
    if (all.length >= page.total || page.items.length === 0) break;
  }
  return all.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    sub: c.subname || null,
    display: c.display_name,
    color: c.color || 'Colorless',
    type: c.card_type,
    cost: c.cost,
    power: c.power,
    ram: c.ram,
    traits: c.classifications || [],
    keywords: c.keywords || [],
    rarity: c.rarity,
    sellable: !!c.is_eddiable && c.card_type !== 'Legend',
    text: c.rules_text || '',
    flavor: c.flavor_text || null,
    artist: c.artist,
    legal: (c.legalities || {}).standard || 'legal',
    printings: (c.printings || [])
      .filter((p) => !isFrench(p.set.name))
      .map((p) => ({ id: p.id, set: p.set.name, num: p.collector_number, rarity: p.rarity, artist: p.artist })),
  }));
}

async function tcgplayer() {
  const groups = (await getJSON(`${TCG}/groups`)).results;
  const rows = [];
  for (const g of groups) {
    const [prods, prices] = await Promise.all([
      getJSON(`${TCG}/${g.groupId}/products`),
      getJSON(`${TCG}/${g.groupId}/prices`),
    ]);
    const byId = new Map(prods.results.map((p) => [p.productId, p]));
    for (const pr of prices.results) {
      const p = byId.get(pr.productId);
      if (!p) continue;
      const ext = Object.fromEntries((p.extendedData || []).map((e) => [e.name, e.value]));
      rows.push({
        set: g.name,
        name: p.name,
        num: ext.Number || null,
        finish: pr.subTypeName,
        market: pr.marketPrice,
        low: pr.lowPrice,
        mid: pr.midPrice,
        url: p.url,
      });
    }
  }
  return { rows, groups: groups.map((g) => g.name) };
}

async function fx() {
  try {
    const d = await getJSON('https://open.er-api.com/v6/latest/USD');
    return { usdToCad: d.rates.CAD, asOf: d.time_last_update_utc };
  } catch {
    const d = await getJSON('https://api.frankfurter.app/latest?from=USD&to=CAD');
    return { usdToCad: d.rates.CAD, asOf: d.date };
  }
}

const main = async () => {
  const [cardList, tcg, rate] = await Promise.all([cards(), tcgplayer(), fx()]);
  // index TCGplayer rows by set + collector number
  const idx = new Map();
  for (const r of tcg.rows) {
    if (!r.num) continue;
    const k = `${r.set}|${normNum(r.num)}`;
    if (!idx.has(k)) idx.set(k, r);
  }
  const printings = {};
  let matched = 0;
  for (const c of cardList) {
    for (const p of c.printings) {
      const r = idx.get(`${tcgSetName(p.set)}|${normNum(p.num)}`);
      if (!r) continue;
      matched++;
      const usd = r.market ?? r.low ?? r.mid;
      if (usd == null) continue;
      printings[p.id] = {
        usd,
        src: r.market != null ? 'market' : r.low != null ? 'low' : 'mid',
        finish: r.finish,
        url: r.url,
      };
    }
  }
  // Card-level reference price: base-art Retail booster/starter printing, Beta as fallback proxy.
  const order = [
    'Welcome to Night City — Retail',
    'The Heist — Retail Starter Deck',
    'Embracing Power — Retail Starter Deck',
    'Welcome to Night City — Beta',
    'The Heist — Beta Starter Deck',
    'Embracing Power — Beta Starter Deck',
  ];
  const ref = {};
  for (const c of cardList) {
    const base = c.printings.filter((p) => order.includes(p.set) && p.rarity === c.rarity);
    base.sort((a, b) => order.indexOf(a.set) - order.indexOf(b.set));
    let pick = null;
    for (const p of base) {
      const pr = printings[p.id];
      if (!pr) continue;
      if (pr.src === 'market') { pick = { ...pr, printingId: p.id, set: p.set }; break; }
      if (!pick) pick = { ...pr, printingId: p.id, set: p.set };
    }
    // Thinly traded retail: if only a listing exists, cap it with the Beta market price.
    if (pick && pick.src !== 'market') {
      const beta = base.find((p) => p.set.includes('Beta') && printings[p.id]?.src === 'market');
      if (beta && printings[beta.id].usd < pick.usd) pick = { ...printings[beta.id], printingId: beta.id, set: beta.set, src: 'beta-proxy' };
    }
    if (pick) ref[c.slug] = pick;
  }
  await mkdir(OUT, { recursive: true });
  cardList.sort((a, b) => a.display.localeCompare(b.display));
  await writeFile(new URL('cards.json', OUT), JSON.stringify(cardList));
  await writeFile(
    new URL('prices.json', OUT),
    JSON.stringify({ updatedAt: new Date().toISOString(), source: 'TCGplayer market (via tcgcsv.com)', fx: rate, ref, printings }),
  );
  const names = cardList.filter((c) => c.text || c.type === 'Legend').map((c) => ({ slug: c.slug, name: c.name, display: c.display }));
  await writeFile(
    new URL('../api/_cards.ts', import.meta.url),
    `// Generated by scripts/sync-data.mjs. Do not edit.\nexport const CARD_NAMES: { slug: string; name: string; display: string }[] = ${JSON.stringify(names)};\n`,
  );
  console.log(`cards=${cardList.length} printingPrices=${Object.keys(printings).length} matched=${matched} refPrices=${Object.keys(ref).length} usdToCad=${rate.usdToCad}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
