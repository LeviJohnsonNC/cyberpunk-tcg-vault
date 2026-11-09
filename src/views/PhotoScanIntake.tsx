import { useRef, useState } from 'react';
import { CardImg } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG, CARDS, editionPrinting, isUnspecified, printingLabel, unspecifiedId } from '../lib/data';
import { useStore, type Entry } from '../lib/store';
import { cloudEnabled } from '../lib/supabase';

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
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

const sortedCards = [...CARDS].sort((a, b) => a.display.localeCompare(b.display));

export function PhotoScanIntake() {
  const { addMany, session, toast, collectionReady } = useStore();
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState('');
  const [over, setOver] = useState(false);
  const [addedCopies, setAddedCopies] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanLock = useRef(false);

  const runScan = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (scanLock.current || committing) return;
    if (!list.length) return toast('Choose an image to scan.', 'err');
    if (cloudEnabled && !session) return toast('Sign in to scan photos (it keeps the shared AI budget fair).', 'err');
    scanLock.current = true;
    setAddedCopies(0);
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
          // The scanner reads names, not printings, so every match starts as "Printing unspecified".
          else found.push({ key: `${m.slug}-${Date.now()}-${found.length}`, slug: c.slug, qty: m.qty, printingId: unspecifiedId(c.slug), confidence: m.confidence ?? 0.8, read: m.read ?? '', on: true });
        }
        if (data.unmatched?.length) toast(`Couldn't match: ${data.unmatched.slice(0, 5).join(', ')}`, 'err');
        if (typeof data.remaining === 'number') toast(`${data.remaining} scans left today`);
      } catch (e) {
        toast(`Scan error: ${(e as Error).message}`, 'err');
      }
    }
    scanLock.current = false;
    setScanning('');
    setScan((prev) => [...prev, ...found]);
  };

  const [committing, setCommitting] = useState(false);
  const commitScan = async () => {
    if (!collectionReady || committing || scanning) return;
    const items: Entry[] = scan.filter((s) => s.on && s.qty > 0).map((s) => ({ slug: s.slug, printingId: s.printingId, qty: s.qty }));
    setCommitting(true);
    const ok = await addMany(items, 'add');
    setCommitting(false);
    if (!ok) return; // keep the reviewed rows so nothing is lost; the store already showed why
    setAddedCopies(items.reduce((sum, item) => sum + item.qty, 0));
    setScan([]);
  };
  const editScan = (key: string, patch: Partial<ScanRow>) => setScan((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** Split one copy off a grouped match so it can get its own printing (e.g. 2 Retail + 1 Beta). */
  const splitScan = (key: string) =>
    setScan((rows) => {
      const i = rows.findIndex((r) => r.key === key);
      if (i < 0 || rows[i].qty < 2) return rows;
      const r = rows[i];
      const copy: ScanRow = { ...r, key: `${r.key}-s${Date.now()}`, qty: 1, printingId: unspecifiedId(r.slug) };
      return [...rows.slice(0, i), { ...r, qty: r.qty - 1 }, copy, ...rows.slice(i + 1)];
    });
  const setAllEdition = (edition: 'Retail' | 'Beta' | null) =>
    setScan((rows) => rows.map((r) => ({ ...r, printingId: edition ? editionPrinting(r.slug, edition)?.id ?? r.printingId : unspecifiedId(r.slug) })));
  const unspecifiedCount = scan.filter((s) => s.on && isUnspecified(s.printingId)).reduce((a, s) => a + s.qty, 0);

  const scanTotal = scan.filter((row) => row.on).reduce((total, row) => total + row.qty, 0);

  return (
    <section className="panel intake-panel">
      <h2 className="intake-heading">Scan card photos</h2>
      <p className="intake-description">Upload photos of your cards, then review the suggested matches before saving.</p>
      <div className={`intake-scan-setup${scan.length === 0 ? ' with-guide' : ''}`}>
        <div className="intake-scan-action">
          {cloudEnabled && !session ? (
            <p className="callout y">Sign in using the top navigation to scan photos.</p>
          ) : (
            <button type="button" className={`dropzone${over ? ' over' : ''}`} disabled={!!scanning || committing}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); if (!scanning) setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(event) => { event.preventDefault(); setOver(false); if (!scanning) void runScan(event.dataTransfer.files); }}>
              <span className="big">Drop photos or tap to upload</span>
              <span className="intake-scan-tip">Try 20 to 30 cards per photo.</span>
            </button>
          )}
          <p className="al-action-feedback intake-scan-feedback" data-tone="success" role="status">
            {addedCopies > 0 ? `Added ${addedCopies} ${addedCopies === 1 ? 'card' : 'cards'} to your vault` : ''}
          </p>
        </div>
        {scan.length === 0 && (
          <figure className="intake-scan-guide">
            <img src="/img/scan-guide.svg" width={460} height={300} loading="lazy"
              alt="Overhead view of a flat grid of spaced cards, all inside the camera frame." />
            <figcaption>
              <strong>Set up your shot</strong>
              <ol>
                <li>Lay cards flat with space between them.</li>
                <li>Shoot straight down in good light.</li>
                <li>Keep every card name readable and in frame.</li>
              </ol>
            </figcaption>
          </figure>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => {
        if (event.target.files?.length) void runScan(event.target.files);
        event.target.value = '';
      }} />
      {scanning && <div className="row" role="status" style={{ marginTop: 12 }}><span className="loader" /> <span className="mono tiny">{scanning}</span></div>}
      {scan.length > 0 && (
        <>
          <div className="row intake-scan-actions" style={{ margin: '12px 0 8px' }}>
            <span className="mono tiny">
              REVIEW {scan.length} MATCHES · {scanTotal} CARDS{unspecifiedCount > 0 && ` · ${unspecifiedCount} PRINTING UNSPECIFIED`}
            </span>
            <span className="spacer" />
            <button className="btn quiet sm" onClick={() => setScan([])} disabled={committing || !!scanning}>Discard</button>
            <button className="btn sm" onClick={commitScan} disabled={!collectionReady || committing || !!scanning || scanTotal === 0}>{committing ? "Saving…" : `Add ${scanTotal} to vault`}</button>
          </div>
          <div className="row scan-bulk" role="group" aria-label="Set printing for every match">
            <span className="tiny muted">Printing for all:</span>
            <button className="chip" onClick={() => setAllEdition('Retail')}>Retail</button>
            <button className="chip" onClick={() => setAllEdition('Beta')}>Beta</button>
            <button className="chip" onClick={() => setAllEdition(null)}>Unspecified</button>
            <span className="tiny muted">Unspecified copies count for deck building but stay unpriced until you set them.</span>
          </div>
          <div className="result-list">
            {scan.map((s) => {
              const c = BY_SLUG.get(s.slug)!;
              return (
                <div key={s.key} className="scan-row" style={{ opacity: s.on ? 1 : 0.45 }}>
                  <input type="checkbox" checked={s.on} onChange={(e) => editScan(s.key, { on: e.target.checked })} style={{ accentColor: 'var(--color-accent)' }} aria-label="Include this match" />
                  <CardImg className="thumb" slug={s.slug} alt="" />
                  <div>
                    <VaultSelect className="scan-card-select" aria-label="Card" value={s.slug}
                      onValueChange={(value) => editScan(s.key, { slug: value, printingId: unspecifiedId(value) })}
                      options={sortedCards.map((x) => ({ value: x.slug, label: x.display }))} />
                    <div className="tiny muted">
                      {s.read && <>read "{s.read}" · </>}
                      <span className={s.confidence < 0.6 ? 'danger-text' : undefined}>{Math.round(s.confidence * 100)}% sure</span>
                    </div>
                  </div>
                  <VaultSelect
                    className={`add-printing-select${isUnspecified(s.printingId) ? ' unspecified' : ''}`}
                    aria-label="Printing"
                    value={s.printingId}
                    onValueChange={(value) => editScan(s.key, { printingId: value })}
                    options={[
                      { value: unspecifiedId(s.slug), label: 'Printing unspecified' },
                      ...c.printings.map((p) => ({ value: p.id, label: printingLabel(p.id) })),
                    ]}
                  />
                  <input className="input" type="number" min={0} max={99} aria-label="Quantity" style={{ padding: '6px', width: '100%' }} value={s.qty} onChange={(e) => editScan(s.key, { qty: Math.max(0, +e.target.value || 0) })} />
                  <button className="btn quiet sm" onClick={() => splitScan(s.key)} disabled={s.qty < 2} title="Split off one copy to give it a different printing">Split</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
