// "Share deck" in the Deck Builder: one unlisted snapshot link per saved deck (migration 005).
import { useEffect, useRef, useState } from 'react';
import { useStore, type Deck } from '../lib/store';
import { getShare, publishShare, revokeShare, shareBlockers, shareStatus, shareUrl, type Share } from '../lib/share';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

type Confirming = null | 'replace' | 'revoke';

export function ShareDialog({
  open,
  onClose,
  deck,
  saved,
  dirty,
  save,
  copyList,
}: {
  open: boolean;
  onClose: () => void;
  deck: Deck;
  saved: boolean;
  dirty: boolean;
  /** Saves the deck; resolves true only once the server confirmed it. */
  save: () => Promise<boolean>;
  copyList: () => void;
}) {
  const { mode, session, decks, toast } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const signedIn = mode === 'cloud' && !!session;
  const blockers = shareBlockers(deck);
  const status = shareStatus(deck);
  const needsSave = !saved || dirty;
  const savedAt = decks.find((d) => d.id === deck.id)?.updatedAt;
  const stale = !!share && !!savedAt && new Date(savedAt) > new Date(share.createdAt);
  const url = share ? shareUrl(share.token) : '';
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      closeRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  // Load the current link for a saved deck each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirming(null);
    setShare(null);
    if (!signedIn || !savedRef.current) return;
    let cancelled = false;
    setLoading(true);
    getShare(deck.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.error) setError(r.error);
      setShare(r.share);
    });
    return () => {
      cancelled = true;
    };
    // Only on open: "Save and share" saves mid-flow, and refetching then could race the publish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn]);

  const run = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    try {
      // Publishing snapshots the deck as stored on the server, so it must be saved first.
      if (needsSave && !(await save())) {
        setError('The deck could not be saved, so no link was created. Try again.');
        return;
      }
      const r = await publishShare(deck.id, replace);
      if (r.error || !r.share) {
        setError(`No link was created: ${r.error ?? 'unknown error'}`);
        return;
      }
      setShare(r.share);
      setConfirming(null);
      toast(replace ? 'New link created. The old link no longer works.' : 'Share link ready');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    const r = await revokeShare(deck.id);
    setBusy(false);
    if (!r.ok) return setError(`The link was not revoked: ${r.error}`);
    setShare(null);
    setConfirming(null);
    toast('Link revoked');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Clipboard blocked by browser. Select the link and copy it.', 'err');
    }
  };

  return (
    <dialog
      ref={ref}
      className="al-dialog tone-accent share-dialog"
      aria-labelledby="share-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="al-dialog-body">
        <h2 id="share-title">Share deck</h2>
        <div className="al-dialog-content">
          <p className="share-deckname">
            <b>{deck.name || 'Untitled deck'}</b> <span className={`status-tag ${status.legal ? 'legal' : 'draft'}`}>{status.label}</span>
          </p>
          <p>
            Anyone with the link can view a snapshot of this list: its name, Legends, main deck and sideboard. Your notes, collection and prices are never shared. Visitors can compare it to their own cards and open a copy.
          </p>

          {!signedIn ? (
            <p className="share-note">Sign in to create a share link. You can still copy the list as text and paste it anywhere.</p>
          ) : blockers.length > 0 ? (
            <div className="share-note bad" role="alert">
              <p>Fix these before sharing:</p>
              <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ) : loading ? (
            <p aria-busy="true">Checking for an existing link…</p>
          ) : share ? (
            <>
              <label className="share-label" htmlFor="share-url">Link</label>
              <div className="share-url">
                <input id="share-url" className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn" onClick={copyLink} disabled={busy}>Copy link</button>
              </div>
              <p className="tiny muted">Snapshot from {when(share.createdAt)}. Editing the deck does not change what the link shows.</p>
              {(stale || dirty) && (
                <p className="share-note">
                  {dirty ? 'You have unsaved changes. ' : 'You have saved changes since this snapshot. '}
                  The link still shows the earlier version. Replace the link to share the current list.
                </p>
              )}
            </>
          ) : status.legal ? null : (
            <p className="share-note">This list isn't legal yet, so it will be labelled Draft. That's fine for asking for feedback.</p>
          )}

          {confirming && (
            <div className="share-note" role="alert">
              {confirming === 'replace'
                ? <p>{needsSave ? 'Save the deck and create a new link? ' : 'Create a new link? '}The current link stops working right away.</p>
                : <p>Revoke this link? It stops working right away. You can create a new one later.</p>}
            </div>
          )}

          {error && <p className="share-note bad" role="alert">{error}</p>}
        </div>

        <div className="al-dialog-actions share-actions">
          <button ref={closeRef} className="btn ghost" onClick={onClose} disabled={busy}>Close</button>
          {!signedIn ? (
            <button className="btn" onClick={copyList}>Copy list</button>
          ) : blockers.length || loading ? null : confirming ? (
            <>
              <button className="btn quiet" onClick={() => setConfirming(null)} disabled={busy}>Keep link</button>
              {confirming === 'replace' ? (
                <button className="btn" onClick={() => run(true)} disabled={busy}>{busy ? 'Working…' : 'Replace link'}</button>
              ) : (
                <button className="btn danger" onClick={revoke} disabled={busy}>{busy ? 'Working…' : 'Revoke link'}</button>
              )}
            </>
          ) : share ? (
            <>
              <button className="btn danger-ghost" onClick={() => setConfirming('revoke')} disabled={busy}>Revoke link</button>
              <button className="btn quiet" onClick={() => setConfirming('replace')} disabled={busy}>Replace shared link</button>
            </>
          ) : (
            <button className="btn" onClick={() => run(false)} disabled={busy}>
              {busy ? 'Working…' : needsSave ? 'Save and share' : 'Create link'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
