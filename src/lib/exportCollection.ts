import type { Entry } from './store';

/** Download the collection as a re-importable JSON file. */
export function downloadCollection(entries: Entry[], tag = 'collection') {
  const blob = new Blob(
    [JSON.stringify({ app: 'cyberpunk-tcg-vault', version: 1, exportedAt: new Date().toISOString(), entries }, null, 1)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cyberpunk-tcg-${tag}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
