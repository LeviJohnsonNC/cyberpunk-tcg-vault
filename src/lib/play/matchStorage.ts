import type { MatchResponse, MatchSummary } from './protocol';
import type { StoredMatch } from './workerController';

const matches = 'matches';
const summaries = 'summaries';
let connection: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('cptv.play-matches', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(matches);
      request.result.createObjectStore(summaries);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
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

export async function updateSavedMatch(
  scope: string,
  update: (previous?: StoredMatch) => { response: MatchResponse; saved?: StoredMatch },
) {
  const db = await openDatabase();
  return new Promise<MatchResponse>((resolve, reject) => {
    // Serialize moves across tabs and publish the new snapshot only after its checkpoint commits.
    const transaction = db.transaction([matches, summaries], 'readwrite', { durability: 'strict' });
    const store = transaction.objectStore(matches);
    const request = store.get(scope);
    let response: MatchResponse;
    request.onsuccess = () => {
      try {
        const result = update(request.result as StoredMatch | undefined);
        response = result.response;
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
