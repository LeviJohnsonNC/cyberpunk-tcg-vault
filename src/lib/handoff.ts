// Moving decks between screens without touching saved data: a one-shot sessionStorage slot
// read by the destination view. The source deck and the collection are never modified.
import type { Deck } from './store';

export const PENDING_DECK_KEY = 'cptv.pendingDeck';
export const UPGRADE_SOURCE_KEY = 'cptv.upgradeSource';

export interface UpgradeSource {
  name: string;
  kind: 'starter' | 'saved' | 'generated' | 'current';
  legends: string[];
  cards: Record<string, number>;
  budget?: number; // preset to open with (display currency)
}

const put = (k: string, v: unknown) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: destination opens without it */
  }
};

/** Open a deck in the Deck Builder as a new, unsaved copy. */
export function openInBuilder(deck: Deck) {
  put(PENDING_DECK_KEY, deck);
  window.location.hash = '/builder?deck=__pending';
}

/** Open the upgrade planner with a starting deck. */
export function openPlanner(source: UpgradeSource) {
  put(UPGRADE_SOURCE_KEY, source);
  window.location.hash = '/upgrade';
}

export function readUpgradeSource(): UpgradeSource | null {
  try {
    const raw = sessionStorage.getItem(UPGRADE_SOURCE_KEY);
    return raw ? (JSON.parse(raw) as UpgradeSource) : null;
  } catch {
    return null;
  }
}
