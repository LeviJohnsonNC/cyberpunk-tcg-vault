import { useMemo, useRef, useState } from 'react';
import { BY_SLUG, CARDS, defaultPrinting, priceFor, searchCards, shortSet } from '../lib/data';
import { money } from '../lib/currency';
import { useStore, type Entry } from '../lib/store';
import { StarterAddedBanner, StarterIntake, type StarterAdded } from '../components/StarterIntake';
import { cloudEnabled } from '../lib/supabase';
import { CardImg, Pip } from '../components/bits';
import { Masthead } from '../components/ui';
import { DeleteCollection } from '../components/DeleteCollection';
import { downloadCollection } from '../lib/exportCollection';

interface ScanRow {
  key: string;
  slug: string;
  qty: number;
  printingId: string;
  confidence: number;
  read: string;
  on: boolean;
}

async function shrink(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const sortedCards = [...CARDS].sort((a, b) => a.display.localeCompare(b.display));

export function AddCards({ onOpen }: { onOpen: (slug: string) => void }) {
  const { addMany, setQty, entries, session, mode, toast } = useStore();
  const [justAdded, setJustAdded] = useState<StarterAdded | null>(null);
  const [q, setQ] = useState('');
  const [qtyFor, setQtyFor] = useState<Record<string, number>>({});
  const [printFor, setPrintFor] = useState<Record<string, string>>({});
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (q.trim() ? searchCards(q).slice(0, 30) : []), [q]);
  const ownedQty = (pid: string) => entries.find((e) => e.printingId === pid)?.qty ?? 0;

  const quickAdd = (slug: string) => {
    const c = BY_SLUG.get(slug)!;
    const pid = printFor[slug] ?? defaultPrinting(c).id;
    const n = qtyFor[slug] ?? 1;
    setQty(slug, pid, ownedQty(pid) + n);
    toast(`+${n} ${c.display}`);
  };

  const runScan = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    if (cloudEnabled && !session) return toast('Sign in to scan photos (it keeps the shared AI budget fair).', 'err');
    const found: ScanRow[] = [];
    for (let i = 0; i < list.length; i++) {
      setScanning(`Scanning photo ${i + 1} of ${list.length}…`);
      try {
        const image = await shrink(list[i]);
        const r = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ image }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast(data.error ?? `Scan failed (${r.status})`, 'err');
          continue;
        }
        for (const m of data.matches ?? []) {
          const c = BY_SLUG.get(m.slug);
          if (!c) continue;
          const ex = found.find((f) => f.slug === m.slug);
          if (ex) ex.qty += m.qty;
          else found.push({ key: `${m.slug}-${found.length}`, slug: m.slug, qty: m.qty, printingId: defaultPrinting(c).id, confidence: m.confidence ?? 0.8, read: m.read ?? '', on: true });
        }
        if (data.unmatched?.length) toast(`Couldn't match: ${data.unmatched.slice(0, 5).join(', ')}`, 'err');
        if (typeof data.remaining === 'number') toast(`${data.remaining} scans left today`);
      } catch (e) {
        toast(`Scan error: ${(e as Error).message}`, 'err');
      }
    }
    setScanning('');
    setScan((prev) => [...prev, ...found]);
  };

  const [committing, setCommitting] = useState(false);
  const commitScan = async () => {
    if (committing) return;
    const items: Entry[] = scan.filter((s) => s.on && s.qty > 0).map((s) => ({ slug: s.slug, printingId: s.printingId, qty: s.qty }));
    setCommitting(true);
    const ok = await addMany(items, 'add');
    setCommitting(false);
    if (!ok) return; // keep the reviewed rows so nothing is lost; the store already showed why
    toast(`Added ${items.reduce((a, x) => a + x.qty, 0)} cards from photo`);
    setScan([]);
  };
  const editScan = (key: string, patch: Partial<ScanRow>) => setScan((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const importJson = async (file: File, how: 'add' | 'replace') => {
    try {
      const data = JSON.parse(await file.text());
      const items: Entry[] = (data.entries ?? data).filter((e: Entry) => BY_SLUG.has(e.slug));
      if (!(await addMany(items, how))) return;
      toast(`Imported ${items.reduce((a, x) => a + x.qty, 0)} cards`);
    } catch {
      toast('That file is not a valid collection export', 'err');
    }
  };
  const loadSample = async (how: 'add' | 'replace') => {
    const r = await fetch('/imports/levi-collection.json');
    const data = await r.json();
    if (!(await addMany(data.entries, how))) return;
    toast(`Loaded ${data.entries.reduce((a: number, x: Entry) => a + x.qty, 0)} cards`);
  };
  const scanTotal = scan.filter((s) => s.on).reduce((a, s) => a + s.qty, 0);

  return (
    <section>
      <Masthead
        eyebrow="The Afterlife / Intake"
        title="Add Cards"
        sub={<>Starter decks <span className="sep" aria-hidden="true">◆</span> search <span className="sep" aria-hidden="true">◆</span> scan a photo <span className="sep" aria-hidden="true">◆</span> import a file</>}
      />
      {justAdded && <StarterAddedBanner added={justAdded} onDismiss={() => setJustAdded(null)} goPrices={() => (window.location.hash = '/prices')} />}
      <section className="panel starter-panel" aria-labelledby="starter-panel-title">
        <div className="panel-title" id="starter-panel-title">
          Starter decks <span className="aside">Whole box in one click</span>
        </div>
        <StarterIntake onAdded={setJustAdded} compact />
      </section>
      <p className="muted" style={{ maxWidth: '70ch' }}>
        Type to search, or upload photos of your cards laid out on a table. The scanner proposes matches, and nothing is saved until you confirm.
      </p>
      <div className="grid cols-2 section-gap">
        <div className="panel hot">
          <div className="panel-title">Search &amp; add</div>
          <label className="sr-only" htmlFor="add-search">Search cards</label>
          <input
            id="add-search"
            autoFocus
            className="input search"
            style={{ width: '100%' }}
            placeholder="Start typing a card name… (Enter adds the top hit)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) quickAdd(results[0].slug); }}
          />
          <div className="result-list" style={{ marginTop: 10 }}>
            {results.map((c) => {
              const pid = printFor[c.slug] ?? defaultPrinting(c).id;
              const pr = priceFor(c.slug, pid);
              return (
                <div key={c.slug} className="result">
                  <div onClick={() => onOpen(c.slug)} style={{ cursor: 'pointer' }}><CardImg className="thumb" slug={c.slug} alt="" /></div>
                  <div>
                    <div className="cname">{c.display}</div>
                    <div className="row tiny" style={{ gap: 8 }}>
                      <Pip color={c.color} /> <span className="muted">{c.type}</span>
                      <select className="select" style={{ padding: '3px 6px', fontSize: 12 }} value={pid} onChange={(e) => setPrintFor((m) => ({ ...m, [c.slug]: e.target.value }))}>
                        {c.printings.map((p) => <option key={p.id} value={p.id}>{shortSet(p.set)} #{p.num}</option>)}
                      </select>
                      <span className="mono">{pr ? money(pr.cad) : ''}</span>
                      <span className="muted">own {ownedQty(pid)}</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input" type="number" min={1} max={99} style={{ width: 58, padding: '6px' }} value={qtyFor[c.slug] ?? 1} onChange={(e) => setQtyFor((m) => ({ ...m, [c.slug]: Math.max(1, +e.target.value || 1) }))} />
                    <button className="btn sm" onClick={() => quickAdd(c.slug)}>Add</button>
                  </div>
                </div>
              );
            })}
            {q && !results.length && <p className="muted">No cards match "{q}".</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Photo scan <span className="aside">{mode === 'cloud' ? 'AI-assisted' : cloudEnabled ? 'Sign in required' : 'Needs server'}</span></div>
          <div
            className={`dropzone ${over ? 'over' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Upload card photos"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); runScan(e.dataTransfer.files); }}
          >
            <div className="big">Drop photos or tap to upload</div>
            <p className="muted tiny" style={{ marginBottom: 0 }}>
              Best results: cards flat in a grid, names readable, good light, about 20 to 30 cards per photo. Duplicates are counted.
              On mobile you can shoot straight from the camera.
            </p>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && runScan(e.target.files)} />
          </div>
          {scanning && <div className="row" style={{ marginTop: 12 }}><span className="loader" /> <span className="mono tiny">{scanning}</span></div>}
          {scan.length > 0 && (
            <>
              <div className="row" style={{ margin: '12px 0 8px' }}>
                <span className="mono tiny">REVIEW {scan.length} MATCHES · {scanTotal} CARDS</span>
                <span className="spacer" />
                <button className="btn quiet sm" onClick={() => setScan([])}>Discard</button>
                <button className="btn sm" onClick={commitScan} disabled={committing || scanTotal === 0}>{committing ? "Saving…" : `Add ${scanTotal} to vault`}</button>
              </div>
              <div className="result-list">
                {scan.map((s) => {
                  const c = BY_SLUG.get(s.slug)!;
                  return (
                    <div key={s.key} className="scan-row" style={{ opacity: s.on ? 1 : 0.45 }}>
                      <input type="checkbox" checked={s.on} onChange={(e) => editScan(s.key, { on: e.target.checked })} style={{ accentColor: 'var(--color-accent)' }} aria-label="Include this match" />
                      <CardImg className="thumb" slug={s.slug} alt="" />
                      <div>
                        <select className="select" style={{ width: '100%', padding: '4px 6px' }} value={s.slug} onChange={(e) => editScan(s.key, { slug: e.target.value, printingId: defaultPrinting(BY_SLUG.get(e.target.value)!).id })}>
                          {sortedCards.map((x) => <option key={x.slug} value={x.slug}>{x.display}</option>)}
                        </select>
                        <div className="tiny muted">
                          {s.read && <>read "{s.read}" · </>}
                          <span className={s.confidence < 0.6 ? 'danger-text' : undefined}>{Math.round(s.confidence * 100)}% sure</span>
                        </div>
                      </div>
                      <select className="select" style={{ padding: '4px 6px', fontSize: 12 }} value={s.printingId} onChange={(e) => editScan(s.key, { printingId: e.target.value })}>
                        {c.printings.map((p) => <option key={p.id} value={p.id}>{shortSet(p.set)} #{p.num}</option>)}
                      </select>
                      <input className="input" type="number" min={0} max={99} style={{ padding: '6px', width: '100%' }} value={s.qty} onChange={(e) => editScan(s.key, { qty: Math.max(0, +e.target.value || 0) })} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Import / export</div>
        <div className="row">
          <button className="btn quiet" onClick={() => downloadCollection(entries)} disabled={!entries.length}>Export collection (.json)</button>
          <button className="btn quiet" onClick={() => importRef.current?.click()}>Import file (merge)</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0], 'add')} />
          <button className="btn quiet" onClick={() => loadSample(entries.length ? 'add' : 'replace')}>Load sample collection (101 cards)</button>
        </div>
        <p className="tiny muted">
          The sample is the project creator's own collection: The Heist starter deck plus Welcome to Night City boosters.
        </p>
        <div className="danger-zone row">
          <span className="tiny muted">Starting over? Delete every card in your vault. Decks are kept.</span>
          <span className="spacer" />
          <DeleteCollection />
        </div>
      </div>
    </section>
  );
}
