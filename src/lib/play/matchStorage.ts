import type { MatchResponse, MatchSummary } from './protocol';
import type { StoredMatch } from './workerController';
import { emptyCircuit, finishUnlocked, settleCircuit, type CircuitProgress, type TableFinish } from './circuit';

const matches = 'matches';
const summaries = 'summaries';
const circuits = 'circuits';
const campaigns = 'campaigns';
let connection: Promise<IDBDatabase> | undefined;

export function openDatabase() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('cptv.play-matches', 3);
    request.onupgradeneeded = () => {
      for (const name of [matches, summaries, circuits, campaigns]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onblocked = () => { blocked = true; reject(new Error('Close other Vault tabs, then try again to finish the Circuit storage upgrade.')); };
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
}

export async function readMatchSummary(scope: string) {
  const db = await openDatabase();
  return new Promise<MatchSummary | undefined>((resolve, reject) => {
    const request = db.transaction(summaries).objectStore(summaries).get(scope);
    request.onsuccess = () => resolve(request.result as MatchSummary | undefined);
    request.onerror = () => reject(request.error);
  });
}

function readProgress(value: CircuitProgress | undefined) {
  if (!value) return emptyCircuit();
  if (value.version !== 1) throw new Error('Circuit progress was saved by a newer version. Refresh the app to continue.');
  return value;
}

export async function readCircuitProgress(scope: string) {
  const db = await openDatabase();
  return new Promise<CircuitProgress>((resolve, reject) => {
    const request = db.transaction(circuits).objectStore(circuits).get(scope);
    request.onsuccess = () => { try { resolve(readProgress(request.result)); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  });
}

export async function equipTableFinish(scope: string, finish: TableFinish) {
  const db = await openDatabase();
  return new Promise<CircuitProgress>((resolve, reject) => {
    const transaction = db.transaction(circuits, 'readwrite');
    const store = transaction.objectStore(circuits), request = store.get(scope);
    let progress: CircuitProgress;
    request.onsuccess = () => {
      try {
        progress = readProgress(request.result);
        if (!finishUnlocked(progress, finish)) throw new Error('Earn this finish before equipping it.');
        progress = { ...progress, finish };
        store.put(progress, scope);
      } catch (error) { transaction.abort(); reject(error); }
    };
    transaction.oncomplete = () => resolve(progress);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function updateSavedMatch(
  scope: string,
  update: (previous: StoredMatch | undefined, progress: CircuitProgress) => { response: MatchResponse; saved?: StoredMatch },
) {
  const db = await openDatabase();
  return new Promise<MatchResponse>((resolve, reject) => {
    // Serialize moves across tabs and publish the new snapshot only after its checkpoint commits.
    const transaction = db.transaction([matches, summaries, circuits], 'readwrite', { durability: 'strict' });
    const store = transaction.objectStore(matches);
    const request = store.get(scope);
    const circuitStore = transaction.objectStore(circuits);
    const progressRequest = circuitStore.get(scope);
    let response: MatchResponse;
    // Both reads are queued before this callback; the write transaction serializes other tabs.
    progressRequest.onsuccess = () => {
      try {
        const previous = request.result as StoredMatch | undefined;
        const progress = readProgress(progressRequest.result);
        const result = update(previous, progress);
        response = result.response;
        if ('snapshot' in response) {
          const match = result.saved ?? previous;
          if (match?.setup.circuit) {
            let receipt = match.circuitReceipt;
            if (!receipt) {
              const settled = settleCircuit(progress, response.snapshot, match.setup);
              if (settled) {
                receipt = settled.receipt;
                result.saved = { ...match, circuitReceipt: receipt };
                circuitStore.put(settled.progress, scope);
              }
            }
            response.snapshot.circuit = { contractId: match.setup.circuit.contractId, skill: match.setup.rivalSkill ?? 'standard', receipt };
          }
        }
        if (result.saved) {
          store.put(result.saved, scope);
          transaction.objectStore(summaries).put(result.saved.summary, scope);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(response);
    transaction.onabort = () => reject(transaction.error);
  });
}
