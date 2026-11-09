import { useMemo, useRef, useState } from 'react';
import { CardImg } from '../components/bits';
import { IntakeIcon } from '../components/IntakeIcon';
import { PrintingArt } from '../components/PrintingArt';
import { BY_SLUG, isUnspecified, MAX_PRINTING_COPIES, printingLabel } from '../lib/data';
import { previewVaultImport, readVaultFile } from '../lib/intake';
import { useStore } from '../lib/store';

const copyCount = (qty: number) => `${qty.toLocaleString()} ${qty === 1 ? 'copy' : 'copies'}`;
const printingCount = (qty: number) => `${qty.toLocaleString()} ${qty === 1 ? 'printing' : 'printings'}`;

export function VaultFileIntake() {
  const { addMany, collectionReady, entries, demo, startDemo } = useStore();
  const [draft, setDraft] = useState<({ name: string } & ReturnType<typeof readVaultFile>) | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const version = useRef(0);
  const locked = useRef(false);
  const preview = useMemo(() => draft && previewVaultImport(draft.items, entries), [draft, entries]);

  const load = async (file: File) => {
    const current = ++version.current;
    setReading(true);
    setError('');
    setDone('');
    try {
      const text = await file.text();
      if (current !== version.current) return;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error('This file isn’t valid JSON. Choose a Vault collection export.');
      }
      setDraft({ name: file.name, ...readVaultFile(value) });
      requestAnimationFrame(() => previewHeading.current?.focus());
    } catch (problem) {
      if (current === version.current) setError(problem instanceof Error ? problem.message : 'The file couldn’t be read.');
    } finally {
      if (current === version.current) setReading(false);
    }
  };

  const confirm = async () => {
    if (!draft || !preview?.total || !collectionReady || reading || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      if (await addMany(preview.additions, 'add')) {
        setDraft(null);
        setDone(`Added ${copyCount(preview.total)} across ${printingCount(preview.additions.length)}.`);
      } else {
        setError('The import couldn’t be saved. Your draft is ready to retry.');
      }
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={`intake-import${draft ? ' has-draft' : ''}`}>
      <section className="panel intake-panel">
        <h2 className="intake-heading">Import a Vault file</h2>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && !locked.current) void load(file);
        }} />
        {done && <p className="callout intake-import-done" role="status">{done} <a href="#/collection">Open Collection</a></p>}
        {error && <p className="callout y" role="alert">{error}</p>}
        {reading && <p className="muted" role="status">Reading file…</p>}
        {draft && preview ? (
          <>
            <div className="intake-filebar">
              <span className="intake-file-icon"><IntakeIcon name="import" /></span>
              <strong title={draft.name}>{draft.name}</strong>
              <button type="button" className="btn ghost sm" disabled={saving} onClick={() => fileInput.current?.click()}>Change file</button>
            </div>
            <p className="intake-description intake-import-description">Review how this file will update your collection.</p>
            <h3 className="intake-preview-title" ref={previewHeading} tabIndex={-1}><span>Preview changes</span></h3>
            {collectionReady && preview.rows.length > 5 && (
              <button type="button" className="linklike intake-receipt-jump" onClick={() => {
                receiptHeading.current?.scrollIntoView({ block: 'start' });
                receiptHeading.current?.focus({ preventScroll: true });
              }}>Go to pending additions <span aria-hidden="true">↓</span></button>
            )}
            {!collectionReady ? <p className="muted">Current quantities will appear when your collection loads.</p> : preview.rows.length ? (
              <table className="intake-import-table">
                <caption className="sr-only">Quantities by printing before and after import</caption>
                <colgroup><col /><col className="intake-quantity-col" /><col className="intake-quantity-col" /><col className="intake-quantity-col" /></colgroup>
                <thead><tr><th scope="col">Card</th><th scope="col">In vault</th><th scope="col">From file</th><th scope="col">After import</th></tr></thead>
                <tbody>
                  {preview.rows.map(({ entry, before, fromFile, after }) => {
                    const card = BY_SLUG.get(entry.slug)!;
                    return (
                      <tr key={entry.printingId}>
                        <th scope="row">
                          <span className="intake-import-card">
                            <span className="intake-import-art">
                              {isUnspecified(entry.printingId) ? <CardImg slug={entry.slug} alt="" /> : <PrintingArt slug={entry.slug} printingId={entry.printingId} alt="" pocket />}
                            </span>
                            <span><strong>{card.name}</strong>{card.sub && <small>{card.sub}</small>}<small>{printingLabel(entry.printingId, false)}</small></span>
                          </span>
                        </th>
                        <td>{before}</td><td>{fromFile.toLocaleString()}</td><td>{after}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="muted">This file has no collection entries the Vault can import.</p>}
          </>
        ) : (
          <>
            <p className="intake-description">Choose a Vault JSON backup to preview the copies it will add to your collection.</p>
            <button type="button" className="btn" disabled={reading} onClick={() => fileInput.current?.click()}><IntakeIcon name="import" /> Choose Vault file</button>
            <p className="intake-import-help">Looking for your backup? Use Export in <a href="#/collection">Collection</a>.</p>
            {!demo && <p className="intake-import-help"><button type="button" className="linklike" onClick={() => void startDemo()}>Try the sample vault</button> to explore with a separate demo collection.</p>}
          </>
        )}
      </section>
      {draft && preview && (
        <aside className="intake-receipt-frame" aria-labelledby="intake-receipt-heading">
          <div className="intake-receipt">
            <h2 id="intake-receipt-heading" ref={receiptHeading} tabIndex={-1}>Pending additions <span aria-hidden="true">///</span></h2>
            <p className="intake-receipt-total"><IntakeIcon name="starter" />
              {collectionReady ? `${copyCount(preview.total)} across ${printingCount(preview.additions.length)}` : 'Checking vault…'}
            </p>
            {collectionReady && preview.additions.length > 0 && (
              <ul className="intake-receipt-list">
                {preview.additions.slice(0, 5).map((entry) => <li key={entry.printingId}>
                  <span>{BY_SLUG.get(entry.slug)?.display}<small>{printingLabel(entry.printingId, false)}</small></span>
                  <b>{copyCount(entry.qty)}</b>
                </li>)}
                {preview.additions.length > 5 && <li className="intake-receipt-more">+ {printingCount(preview.additions.length - 5)} in the preview</li>}
              </ul>
            )}
            {(draft.skipped > 0 || draft.unverified > 0 || (collectionReady && (preview.capped > 0 || preview.unspecified > 0 || preview.rows.some((row) => row.noteChanges)))) && (
              <ul className="intake-receipt-notes">
                {draft.skipped > 0 && <li>{draft.skipped} {draft.skipped === 1 ? 'row skipped' : 'rows skipped'} with unknown cards or invalid quantities.</li>}
                {draft.unverified > 0 && <li>{draft.unverified} {draft.unverified === 1 ? 'row has' : 'rows have'} a missing or unrecognized printing.</li>}
                {collectionReady && preview.unspecified > 0 && <li>{copyCount(preview.unspecified)} will be saved as Printing unspecified and stay unpriced.</li>}
                {collectionReady && preview.capped > 0 && <li>{printingCount(preview.capped)} limited to {MAX_PRINTING_COPIES} copies in your vault.</li>}
                {collectionReady && preview.rows.some((row) => row.noteChanges) && <li>Notes from the file replace existing notes for matching printings.</li>}
              </ul>
            )}
            <div className="intake-receipt-actions">
              <button type="button" className="btn intake-import-confirm" onClick={() => void confirm()}
                disabled={!collectionReady || !preview.total || reading || saving}>
                {saving ? 'Saving…' : preview.total ? `Add ${copyCount(preview.total)}` : 'Add copies'}
              </button>
              <button type="button" className="linklike" disabled={saving} onClick={() => {
                version.current++;
                setDraft(null);
                setReading(false);
                setError('');
              }}>Discard draft</button>
            </div>
            <p className="intake-receipt-footer">Review all changes before adding.</p>
          </div>
        </aside>
      )}
    </div>
  );
}
