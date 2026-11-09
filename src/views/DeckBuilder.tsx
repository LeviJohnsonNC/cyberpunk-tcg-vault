import { useEffect, useMemo, useState } from 'react';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG, CARDS, COLORS, RECOMMENDED, TYPES, fitsRam, printingLabel, searchCards, type Card } from '../lib/data';
import { money, estimateText, moneyOr } from '../lib/currency';
import { deckFromRecommended, validate, deckNeed, purchaseEstimate } from '../lib/decks';
import { newId, useStore, type Deck } from '../lib/store';
import { Bars, CardImg, Pip } from '../components/bits';
import { Masthead } from '../components/ui';
import { PENDING_DECK_KEY, openPlanner } from '../lib/handoff';
import { ShareDialog } from '../components/ShareDialog';
import { HandTester, type TestDeck } from '../components/HandTester';
import { deckStats } from '../lib/handtest';

const blank = (): Deck => ({ id: newId(), name: 'New crew', legends: [], cards: {}, sideboard: {}, notes: '', updatedAt: '' });
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export function DeckBuilder({ onOpen, initialDeck }: { onOpen: (slug: string) => void; initialDeck?: string }) {
  const { decks, saveDeck, deleteDeck, owned, toast } = useStore();
  const [deck, setDeck] = useState<Deck>(blank);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [legalOnly, setLegalOnly] = useState(true);
  const [target, setTarget] = useState<'main' | 'side'>('main');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [testing, setTesting] = useState<TestDeck[] | null>(null);
  const saved = decks.some((d) => d.id === deck.id);

  useEffect(() => {
    if (!initialDeck) return;
    if (initialDeck === '__pending') {
      try {
        const raw = sessionStorage.getItem(PENDING_DECK_KEY);
        if (raw) {
          setDeck(JSON.parse(raw) as Deck);
          setDirty(true);
          sessionStorage.removeItem(PENDING_DECK_KEY);
        }
      } catch {
        /* ignore malformed handoff */
      }
      return;
    }
    const mine = decks.find((d) => d.id === initialDeck);
    const rec = mine ? null : deckFromRecommended(initialDeck);
    const d = mine ?? rec;
    if (d) {
      setDeck(structuredClone(d));
      setDirty(!!rec);
    }
    // only on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDeck]);

  const v = useMemo(() => validate(deck), [deck]);
  const update = (fn: (d: Deck) => Deck) => {
    setDeck((d) => fn(structuredClone(d)));
    setDirty(true);
  };

  const pool = useMemo(() => {
    let p: Card[] = searchCards(q);
    if (colors.length) p = p.filter((c) => colors.includes(c.color));
    if (type) p = p.filter((c) => c.type === type);
    if (ownedOnly) p = p.filter((c) => owned.has(c.slug));
    if (legalOnly && deck.legends.length) p = p.filter((c) => c.type === 'Legend' || fitsRam(c, v.lim));
    return p.filter((c) => c.legal === 'legal' && c.text).sort((a, b) =>
      (a.type === 'Legend' ? -1 : 0) - (b.type === 'Legend' ? -1 : 0) || (a.cost ?? 0) - (b.cost ?? 0) || a.display.localeCompare(b.display),
    );
  }, [q, colors, type, ownedOnly, legalOnly, deck.legends, v.lim, owned]);

  const add = (c: Card) => {
    if (c.type === 'Legend') {
      if (deck.legends.includes(c.slug)) return toast('Legend already in crew', 'err');
      if (deck.legends.length >= 3) return toast('Crew already has 3 Legends. Remove one first.', 'err');
      return update((d) => ({ ...d, legends: [...d.legends, c.slug] }));
    }
    const zone = target === 'main' ? 'cards' : 'sideboard';
    const total = (deck.cards[c.slug] ?? 0) + (deck.sideboard[c.slug] ?? 0);
    if (total >= 3) return toast('Max 3 copies of a card', 'err');
    update((d) => ({ ...d, [zone]: { ...d[zone], [c.slug]: (d[zone][c.slug] ?? 0) + 1 } }));
  };
  const remove = (slug: string, zone: 'cards' | 'sideboard') =>
    update((d) => {
      const z = { ...d[zone] };
      z[slug] = (z[slug] ?? 0) - 1;
      if (z[slug] <= 0) delete z[slug];
      return { ...d, [zone]: z };
    });

  // stats
  const mainCards = Object.entries(deck.cards).map(([s, n]) => ({ c: BY_SLUG.get(s)!, n })).filter((x) => x.c);
  const stats = deckStats(deck.cards); // shared with the hand tester
  const { curve, sellable, avgCost } = stats;

  // ownership
  const need: Record<string, number> = {};
  for (const s of deck.legends) need[s] = (need[s] ?? 0) + 1;
  for (const [s, n] of Object.entries(deck.cards)) need[s] = (need[s] ?? 0) + n;
  for (const [s, n] of Object.entries(deck.sideboard)) need[s] = (need[s] ?? 0) + n;
  // Same estimator as Meta Intel and the planner. The sideboard is included here; the
  // "Legends + main deck" line matches what the planner and Meta Intel price.
  const toBuy = purchaseEstimate(need, owned);
  const mainOnly = purchaseEstimate(deckNeed(deck), owned);
  const fromScratch = purchaseEstimate(need, new Map());
  const missing = toBuy.lines.map((l) => ({ ...l, c: BY_SLUG.get(l.slug)! }));

  const deckText = () => {
    const lines = [`// ${deck.name}`, '// Legends', ...deck.legends.map((s) => `1 ${BY_SLUG.get(s)?.display}`), '// Main'];
    for (const x of mainCards.sort((a, b) => (a.c.cost ?? 0) - (b.c.cost ?? 0))) lines.push(`${x.n} ${x.c.display}`);
    if (sum(deck.sideboard)) {
      lines.push('// Sideboard');
      for (const [s, n] of Object.entries(deck.sideboard)) lines.push(`${n} ${BY_SLUG.get(s)?.display}`);
    }
    return lines.join('\n');
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast('Clipboard blocked by browser', 'err');
    }
  };
  const doImport = () => {
    const d = blank();
    let zone: 'cards' | 'sideboard' = 'cards';
    const unknown: string[] = [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = new Map<string, Card>();
    for (const c of CARDS) { idx.set(norm(c.display), c); if (!idx.has(norm(c.name))) idx.set(norm(c.name), c); }
    for (const raw of importText.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('//')) {
        const name = line.slice(2).trim();
        if (/sideboard/i.test(name)) zone = 'sideboard';
        else if (/main/i.test(name)) zone = 'cards';
        else if (!/legend/i.test(name) && d.name === 'New crew') d.name = name;
        continue;
      }
      const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      const n = m ? parseInt(m[1], 10) : 1;
      const nm = (m ? m[2] : line).replace(/\s*\(.*\)\s*$/, '');
      const c = idx.get(norm(nm)) ?? idx.get(norm(nm.replace(' - ', ': ')));
      if (!c) { unknown.push(nm); continue; }
      if (c.type === 'Legend') { if (!d.legends.includes(c.slug)) d.legends.push(c.slug); }
      else d[zone][c.slug] = (d[zone][c.slug] ?? 0) + n;
    }
    setDeck(d);
    setDirty(true);
    setShowImport(false);
    toast(unknown.length ? `Imported, but couldn't match: ${unknown.slice(0, 4).join(', ')}` : 'Deck imported', unknown.length ? 'err' : 'ok');
  };

  const loadSel = (val: string) => {
    if (!val) return;
    if (dirty && !confirm('Discard unsaved changes?')) return;
    if (val === '__new') { setDeck(blank()); setDirty(false); return; }
    const mine = decks.find((d) => d.id === val);
    if (mine) { setDeck(structuredClone(mine)); setDirty(false); return; }
    const rec = deckFromRecommended(val);
    if (rec) { setDeck(rec); setDirty(true); }
  };

  const legendCards = deck.legends.map((s) => BY_SLUG.get(s)!).filter(Boolean);
  const groups: { t: string; items: { c: Card; n: number }[] }[] = TYPES.filter((t) => t !== 'Legend').map((t) => ({
    t,
    items: mainCards.filter((x) => x.c.type === t).sort((a, b) => (a.c.cost ?? 0) - (b.c.cost ?? 0) || a.c.display.localeCompare(b.c.display)),
  }));
  const short = (s: string, n: number) => Math.max(0, n - (owned.get(s) ?? 0));

  return (
    <section>
      <Masthead
        eyebrow="The Afterlife / Crew Builder"
        title="Deck Builder"
        sub={<>3 Legends <span className="sep" aria-hidden="true">◆</span> 40 to 50 cards <span className="sep" aria-hidden="true">◆</span> RAM checked live</>}
      />
      <div className="toolbar section-gap">
        <VaultSelect aria-label="Load a deck" value="" placeholder="Load deck…" onValueChange={loadSel} options={[
          { value: '__new', label: '+ New empty deck' },
          ...(decks.length ? [{ label: 'My decks', options: decks.map((d) => ({ value: d.id, label: d.name })) }] : []),
          { label: 'Recommended', options: RECOMMENDED.map((d) => ({ value: d.id, label: `${d.name} (${d.kind})` })) },
        ]} />
        <input className="input deck-name" aria-label="Deck name" value={deck.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value.slice(0, 80) }))} />
        <button className="btn" onClick={async () => { if (await saveDeck(deck)) { setDirty(false); toast('Deck saved'); } }}>{dirty ? 'Save*' : 'Save'}</button>
        <button className="btn quiet" onClick={async () => { const c = { ...structuredClone(deck), id: newId(), name: `${deck.name} (copy)`.slice(0, 80) }; if (await saveDeck(c)) { setDeck(c); setDirty(false); toast('Saved as copy'); } }}>Save copy</button>
        <button
          className="btn ghost"
          disabled={deck.legends.length !== 3}
          title={deck.legends.length !== 3 ? 'Pick three Legends first' : undefined}
          onClick={() => openPlanner({ name: deck.name || 'Untitled deck', kind: decks.some((d) => d.id === deck.id) ? 'saved' : 'current', legends: deck.legends, cards: deck.cards })}
        >
          Upgrade this deck
        </button>
        <button className="btn quiet" onClick={() => copy(deckText(), 'Decklist')}>Copy list</button>
        <button className="btn quiet" aria-haspopup="dialog" onClick={() => setShareOpen(true)}>Share deck</button>
        <button className="btn quiet" aria-haspopup="dialog" onClick={() => setTesting([{ label: 'This deck', ...structuredClone({ name: deck.name, legends: deck.legends, cards: deck.cards, sideboard: deck.sideboard }) }])}>Test hand</button>
        <button className="btn quiet" aria-expanded={showImport} onClick={() => setShowImport((s) => !s)}>Import</button>
        {saved && (
          <button className="btn danger-ghost sm" onClick={async () => { if (confirm(`Delete "${deck.name}"? If it has a share link, that link stops working.`) && (await deleteDeck(deck.id))) { setDeck(blank()); setDirty(false); } }}>Delete</button>
        )}
      </div>

      {testing && <HandTester decks={testing} onClose={() => setTesting(null)} />}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        deck={deck}
        saved={saved}
        dirty={dirty}
        save={async () => {
          const ok = await saveDeck(deck);
          if (ok) setDirty(false);
          return ok;
        }}
        copyList={() => copy(deckText(), 'Decklist')}
      />

      {showImport && (
        <div className="panel hot" style={{ marginBottom: 14 }}>
          <div className="panel-title">Paste a decklist</div>
          <textarea className="input mono" aria-label="Decklist to import" style={{ width: '100%', minHeight: 140 }} placeholder={'1 V: Corporate Exile\n3 Psycho Squad\n// Sideboard\n2 Floor It'} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={doImport}>Import list</button><span className="muted tiny">One card per line, "qty name". Lines starting with // set sections.</span></div>
        </div>
      )}

      <div className="builder">
        {/* POOL */}
        <div className="panel">
          <div className="panel-title">Card pool <span className="aside">{pool.length} cards · click to add</span></div>
          <div className="toolbar">
            <input className="input search grow" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
            <VaultSelect aria-label="Card type" value={type} onValueChange={setType} options={[
              { value: '', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: t })),
            ]} />
          </div>
          <div className="toolbar">
            <div className="chips">
              {COLORS.map((c) => (
                <button key={c} className={`chip c-${c} ${colors.includes(c) ? 'on' : ''}`} onClick={() => setColors((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))}>{c}</button>
              ))}
            </div>
            <label className="toggle"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />Owned only</label>
            <label className="toggle"><input type="checkbox" checked={legalOnly} onChange={(e) => setLegalOnly(e.target.checked)} />Fits RAM</label>
            <div className="chips">
              <button className={`chip ${target === 'main' ? 'on' : ''}`} onClick={() => setTarget('main')}>Add to main</button>
              <button className={`chip ${target === 'side' ? 'on' : ''}`} onClick={() => setTarget('side')}>Add to side</button>
            </div>
          </div>
          <div className="pool">
            {pool.map((c) => {
              const inDeck = c.type === 'Legend' ? (deck.legends.includes(c.slug) ? 1 : 0) : (deck.cards[c.slug] ?? 0) + (deck.sideboard[c.slug] ?? 0);
              const have = owned.get(c.slug) ?? 0;
              const ramBad = deck.legends.length > 0 && !fitsRam(c, v.lim);
              return (
                <button key={c.slug} className={`pcard ${have === 0 ? 'dim' : ''}`} onClick={() => add(c)} onContextMenu={(e) => { e.preventDefault(); onOpen(c.slug); }} title={`Add ${c.display}. Right-click for details.`} aria-label={`Add ${c.display}. You own ${have}${inDeck ? `, ${inDeck} in deck` : ''}`}>
                  <CardImg slug={c.slug} alt={c.display} />
                  <span className="tag">own {have}</span>
                  {inDeck > 0 && <span className="tag inDeck">{inDeck}</span>}
                  {ramBad && <span className="tag bad">RAM {c.ram}</span>}
                  <span className="name">{c.name}{c.sub ? <span className="csub"> · {c.sub}</span> : null}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DECK */}
        <div className="builder-side">
          <div className="panel hot">
            <div className="panel-title">Legend crew <span className="aside">RAM comes from Legends</span></div>
            <div className="legend-slots">
              {[0, 1, 2].map((i) => {
                const c = legendCards[i];
                return (
                  <div key={i} className={`legend-slot ${c ? 'filled' : ''}`}>
                    {c ? (
                      <>
                        <button className="link cname" onClick={() => onOpen(c.slug)}>{c.name}</button>
                        <span className="csub">{c.sub}</span>
                        <span className="row" style={{ gap: 6 }}>
                          <Pip color={c.color} /> <span className="mono tiny">RAM {c.ram}</span>
                          <span className="spacer" />
                          <button className="iconbtn minus" onClick={() => update((d) => ({ ...d, legends: d.legends.filter((s) => s !== c.slug) }))}>×</button>
                        </span>
                      </>
                    ) : (
                      <span className="muted tiny">Empty slot. Click a Legend in the pool.</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ramline" style={{ marginTop: 10 }}>
              {COLORS.map((c) => (
                <span key={c} className={`pip ${c}`} style={{ opacity: v.lim[c] ? 1 : 0.35 }}>{c} RAM {v.lim[c] ?? 0}</span>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Main deck <span className="aside">{v.n} / 40-50</span></div>
            {groups.map((g) =>
              g.items.length ? (
                <div key={g.t}>
                  <div className="group-h">{g.t}s · {g.items.reduce((a, x) => a + x.n, 0)}</div>
                  <div className="decklist">
                    {g.items.map(({ c, n }) => {
                      const s = short(c.slug, n + (deck.sideboard[c.slug] ?? 0));
                      return (
                        <div key={c.slug} className={`dl-row ${c.color} ${s ? 'missing' : ''}`}>
                          <span className="cost">{c.cost ?? '—'}</span>
                          <button className="link" onClick={() => onOpen(c.slug)}>
                            {c.display} {s > 0 && <span className="short">need {s}</span>}
                          </button>
                          <span className="qty">
                            <button className="iconbtn minus" onClick={() => remove(c.slug, 'cards')}>−</button>
                            <b>{n}</b>
                            <button className="iconbtn" onClick={() => add(c)}>+</button>
                          </span>
                          <span />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
            {v.n === 0 && <p className="muted">Click cards in the pool to add them, or load a recommended deck.</p>}
            {sum(deck.sideboard) > 0 && (
              <>
                <div className="group-h">Sideboard · {sum(deck.sideboard)}</div>
                <div className="decklist">
                  {Object.entries(deck.sideboard).map(([s, n]) => {
                    const c = BY_SLUG.get(s)!;
                    return (
                      <div key={s} className={`dl-row ${c.color}`}>
                        <span className="cost">{c.cost ?? '—'}</span>
                        <span>{c.display}</span>
                        <span className="qty"><button className="iconbtn minus" onClick={() => remove(s, 'sideboard')}>−</button><b>{n}</b></span>
                        <span />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">Diagnostics</div>
            <ul className="checks">
              {v.issues.map((i) => <li key={i} className="bad">{i}</li>)}
              {v.passes.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <div className="grid cols-2" style={{ marginTop: 12, gap: 8 }}>
              <div className="stat-line">Units <b>{stats.units}</b> · Gear <b>{stats.gear}</b> · Programs <b>{stats.programs}</b></div>
              <div className="stat-line">Sellable <b className={sellable >= 18 ? 'good' : 'bad'}>{sellable}</b> · Avg cost <b>{avgCost.toFixed(2)}</b></div>
            </div>
            {sellable < 18 && v.n > 0 && (
              <p className="tiny danger-text" style={{ marginBottom: 0 }}>
                Low on sellable cards. Eddies only come from selling Gear or Programs (once per turn) and spending Legends. Most lists run 20 or more.
              </p>
            )}
            <div className="group-h">Cost curve</div>
            <Bars data={curve} />
          </div>

          <div className="panel red">
            <div className="panel-title">
              Acquisition <span className="aside">Whole list from scratch: {estimateText(fromScratch)}</span>
            </div>
            {missing.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-success)' }}>You own every card in this deck. Sleeve up.</p>
            ) : (
              <>
                <div className="row" style={{ marginBottom: 8 }}>
                  <span>Missing <b>{toBuy.copies}</b> {toBuy.copies === 1 ? 'card' : 'cards'}</span>
                  <span className="spacer" />
                  <b className="price-line"><span className="big">{estimateText(toBuy)}</span></b>
                </div>
                {Object.keys(deck.sideboard).length > 0 && (
                  <p className="tiny muted" style={{ margin: '0 0 8px' }}>Legends + main deck only: {estimateText(mainOnly)}. The total above includes the sideboard.</p>
                )}
                <div className="decklist">
                  {missing.map((x) => (
                    <div key={x.slug} className={`dl-row ${x.c.color}`} title={x.quote ? `Quoted on ${printingLabel(x.quote.printingId, false)} (${x.quote.basis})` : 'No printing has a quote yet'}>
                      <span className="cost">{x.buy}×</span>
                      <button className="link" onClick={() => onOpen(x.slug)}>{x.c.display}</button>
                      <span className="mono tiny">{moneyOr(x.quote?.cad)}</span>
                      <span className={`mono tiny ${x.quote ? 'accent' : 'muted'}`}>{x.quote ? money(x.quote.cad * x.buy) : 'Unpriced'}</span>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => copy(missing.map((x) => `${x.buy} ${x.c.name}${x.c.sub ? ` - ${x.c.sub}` : ''}`).join('\n'), 'Shopping list')}>Copy shopping list</button>
                  <a className="btn sm quiet" href="https://www.tcgplayer.com/massentry?productline=Cyberpunk%20TCG" target="_blank" rel="noreferrer">TCGplayer mass entry ↗</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
