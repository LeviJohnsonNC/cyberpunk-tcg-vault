import { useState } from 'react';
import { useStore } from '../lib/store';
import { downloadCollection } from '../lib/exportCollection';
import { ConfirmDialog } from './ui';

/** "Delete collection" button + confirmation. Decks are kept; only collection entries are removed. */
export function DeleteCollection({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { entries, owned, mode, clearCollection, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [backup, setBackup] = useState(true);
  const [busy, setBusy] = useState(false);
  const copies = [...owned.values()].reduce((a, b) => a + b, 0);

  const confirm = async () => {
    setBusy(true);
    if (backup) downloadCollection(entries, 'backup');
    const deleted = await clearCollection();
    setBusy(false);
    if (!deleted) return;
    setOpen(false);
    toast(`Deleted ${copies} cards${backup ? '. Backup downloaded.' : ''}`);
  };

  return (
    <>
      <button className={`btn danger-ghost ${size === 'sm' ? 'sm' : ''}`} disabled={!entries.length} onClick={() => setOpen(true)}>
        Delete collection
      </button>
      <ConfirmDialog
        open={open}
        title="Delete collection?"
        confirmLabel={`Delete ${copies} cards`}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <p>
          This removes all <b>{copies} cards</b> ({owned.size} unique) from your vault
          {mode === 'cloud' ? ' and your account' : ' in this browser'}. Your saved decks stay. This can't be undone.
        </p>
        <label className="toggle" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--color-text)' }}>
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          Download a backup file first (re-import it from Add Cards)
        </label>
      </ConfirmDialog>
    </>
  );
}
