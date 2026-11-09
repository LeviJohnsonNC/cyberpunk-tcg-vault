import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { BY_SLUG, normalizePrinting } from './data';

export interface Entry {
  slug: string;
  printingId: string;
  qty: number;
  note?: string | null;
}

export interface Deck {
  id: string;
  name: string;
  legends: string[];
  cards: Record<string, number>;
  sideboard: Record<string, number>;
  notes?: string;
  isPublic?: boolean;
  updatedAt: string;
}

type Toast = { id: number; msg: string; tone?: 'ok' | 'err' };

interface StoreValue {
  ready: boolean;
  syncing: boolean; // cloud collection is loading
  mode: 'local' | 'cloud';
  session: Session | null;
  entries: Entry[];
  owned: Map<string, number>; // slug -> total qty
  setQty: (slug: string, printingId: string, qty: number, note?: string | null) => Promise<void>;
  /** Adds (or replaces with) a batch. All-or-nothing: resolves false and changes nothing if the save fails. */
  addMany: (items: Entry[], mode?: 'add' | 'replace') => Promise<boolean>;
  clearCollection: () => Promise<void>;
  /**
   * Move `qty` copies of a card from one printing to another (e.g. resolve "Printing unspecified").
   * All-or-nothing: resolves false and changes nothing on failure. Safe to retry.
   */
  movePrinting: (slug: string, from: string, to: string, qty: number) => Promise<boolean>;
  decks: Deck[];
  saveDeck: (d: Deck) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  localPending: number; // local entries not yet synced after sign-in
  pushLocalToCloud: () => Promise<void>;
  toasts: Toast[];
  toast: (msg: string, tone?: 'ok' | 'err') => void;
  /** Demo mode: a sample collection held in memory. Nothing is saved; exit restores the real vault. */
  demo: boolean;
  startDemo: () => Promise<void>;
  exitDemo: () => void;
}

const Ctx = createContext<StoreValue | null>(null);
const LS_COL = 'cptv.collection.v1';
const LS_DECKS = 'cptv.decks.v1';
const SS_DEMO = 'cptv.demo.v1';
const DEMO_URL = '/imports/levi-collection.json';

const readDemo = (): Entry[] | null => {
  try {
    const v = sessionStorage.getItem(SS_DEMO);
    return v ? (JSON.parse(v) as Entry[]) : null;
  } catch {
    return null;
  }
};

const readLS = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const writeLS = (k: string, v: unknown): boolean => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false; // storage full or blocked
  }
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(16).slice(2)}`;

export function mergeEntries(base: Entry[], items: Entry[], mode: 'add' | 'replace'): Entry[] {
  const map = new Map(base.map((e) => [e.printingId, { ...e }]));
  for (const raw of items) {
    if (!BY_SLUG.has(raw.slug) || !(raw.qty > 0)) continue;
    // Unknown or mismatched printing ids (old exports, typos) keep their copies as "unspecified".
    const it = { ...raw, qty: Math.min(999, Math.round(raw.qty)), printingId: normalizePrinting(raw.slug, raw.printingId) };
    const cur = map.get(it.printingId);
    if (cur && mode === 'add') {
      cur.qty += it.qty;
      if (it.note) cur.note = it.note;
    } else map.set(it.printingId, { ...it });
  }
  return [...map.values()].filter((e) => e.qty > 0);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [realEntries, setEntries] = useState<Entry[]>(() => readLS(LS_COL, [] as Entry[]));
  const [demoEntries, setDemoEntries] = useState<Entry[] | null>(readDemo);
  const demo = demoEntries !== null;
  const entries = demoEntries ?? realEntries;
  const [decks, setDecks] = useState<Deck[]>(() => readLS(LS_DECKS, [] as Deck[]));
  const [localPending, setLocalPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const mode: 'local' | 'cloud' = supabase && session ? 'cloud' : 'local';

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // auth
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // load cloud data when signed in; fall back to local storage when signed out
  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      setEntries(readLS(LS_COL, [] as Entry[]));
      setDecks(readLS(LS_DECKS, [] as Deck[]));
      setLocalPending(0);
      return;
    }
    let cancelled = false;
    setSyncing(true);
    (async () => {
      const [col, dk] = await Promise.all([
        supabase.from('collection_items').select('card_slug, printing_id, qty, note'),
        supabase.from('decks').select('*').order('updated_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setSyncing(false);
      if (col.error || dk.error) {
        toast(`Cloud load failed: ${(col.error || dk.error)?.message}`, 'err');
        return;
      }
      // Rows load exactly as stored (an unknown printing id shows as "Printing unspecified" and is
      // unpriced). Rewriting ids here could leave the original row behind and duplicate copies.
      setEntries(col.data.filter((r) => BY_SLUG.has(r.card_slug)).map((r) => ({ slug: r.card_slug, printingId: r.printing_id, qty: r.qty, note: r.note })));
      setDecks(
        dk.data.map((r) => ({
          id: r.id,
          name: r.name,
          legends: r.legends ?? [],
          cards: r.cards ?? {},
          sideboard: r.sideboard ?? {},
          notes: r.notes ?? '',
          isPublic: r.is_public,
          updatedAt: r.updated_at,
        })),
      );
      const local = readLS(LS_COL, [] as Entry[]);
      setLocalPending(col.data.length === 0 ? local.length : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, toast]);

  // persist local mode
  useEffect(() => {
    if (mode === 'local') writeLS(LS_COL, realEntries);
  }, [realEntries, mode]);
  useEffect(() => {
    try {
      if (demoEntries) sessionStorage.setItem(SS_DEMO, JSON.stringify(demoEntries));
      else sessionStorage.removeItem(SS_DEMO);
    } catch {
      /* storage blocked: demo lasts until reload */
    }
  }, [demoEntries]);
  useEffect(() => {
    if (mode === 'local') writeLS(LS_DECKS, decks);
  }, [decks, mode]);

  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.slug, (m.get(e.slug) ?? 0) + e.qty);
    return m;
  }, [entries]);

  const upsertCloud = async (items: Entry[]): Promise<boolean> => {
    if (!supabase || !session) return false;
    let ok = true;
    const del = items.filter((e) => e.qty <= 0).map((e) => e.printingId);
    const up = items
      .filter((e) => e.qty > 0)
      .map((e) => ({ user_id: session.user.id, card_slug: e.slug, printing_id: e.printingId, qty: e.qty, note: e.note ?? null }));
    if (up.length) {
      const { error } = await supabase.from('collection_items').upsert(up, { onConflict: 'user_id,printing_id' });
      if (error) {
        toast(`Save failed: ${error.message}`, 'err');
        ok = false;
      }
    }
    if (del.length) {
      const { error } = await supabase.from('collection_items').delete().in('printing_id', del);
      if (error) {
        toast(`Delete failed: ${error.message}`, 'err');
        ok = false;
      }
    }
    return ok;
  };

  const setQty = async (slug: string, printingId: string, qty: number, note?: string | null) => {
    const q = Math.max(0, Math.min(999, Math.round(qty)));
    const ex = entries.find((e) => e.printingId === printingId);
    const changed: Entry = { slug, printingId, qty: q, note: note === undefined ? ex?.note ?? null : note };
    if (demo) {
      setDemoEntries((prev) => [...(prev ?? []).filter((e) => e.printingId !== printingId), ...(q > 0 ? [changed] : [])]);
      return;
    }
    setEntries((prev) => {
      const rest = prev.filter((e) => e.printingId !== printingId);
      return q > 0 ? [...rest, changed] : rest;
    });
    if (mode === 'cloud') await upsertCloud([changed]);
  };

  const addMany = async (items: Entry[], m: 'add' | 'replace' = 'add'): Promise<boolean> => {
    const next = mergeEntries(m === 'replace' ? [] : entries, items, 'add');
    if (demo) {
      setDemoEntries(next);
      return true;
    }
    if (mode === 'cloud' && supabase && session) {
      // Upsert first (one statement, so it lands whole or not at all), then trim rows a replace dropped.
      if (!(await upsertCloud(next))) return false;
      if (m === 'replace') {
        const keep = new Set(next.map((e) => e.printingId));
        const drop = entries.filter((e) => !keep.has(e.printingId)).map((e) => ({ ...e, qty: 0 }));
        if (drop.length && !(await upsertCloud(drop))) return false;
      }
    } else if (!writeLS(LS_COL, next)) {
      toast('Could not save: this browser\'s storage is full or blocked.', 'err');
      return false;
    }
    setEntries(next);
    return true;
  };

  const clearCollection = async () => {
    if (demo) {
      setDemoEntries([]);
      return;
    }
    if (mode === 'cloud' && supabase && session) {
      const { error } = await supabase.from('collection_items').delete().eq('user_id', session.user.id);
      if (error) return toast(error.message, 'err');
    }
    setEntries([]);
  };

  const saveDeck = async (d: Deck) => {
    const deck = { ...d, updatedAt: new Date().toISOString() };
    setDecks((prev) => [deck, ...prev.filter((x) => x.id !== d.id)]);
    if (mode === 'cloud' && supabase && session) {
      const { error } = await supabase.from('decks').upsert({
        id: deck.id,
        user_id: session.user.id,
        name: deck.name,
        legends: deck.legends,
        cards: deck.cards,
        sideboard: deck.sideboard,
        notes: deck.notes ?? '',
        is_public: !!deck.isPublic,
        updated_at: deck.updatedAt,
      });
      if (error) toast(`Deck save failed: ${error.message}`, 'err');
    }
  };

  const deleteDeck = async (id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id));
    if (mode === 'cloud' && supabase) await supabase.from('decks').delete().eq('id', id);
  };

  const reloadCloud = async () => {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from('collection_items').select('card_slug, printing_id, qty, note');
    if (!error && data) setEntries(data.filter((r) => BY_SLUG.has(r.card_slug)).map((r) => ({ slug: r.card_slug, printingId: r.printing_id, qty: r.qty, note: r.note })));
  };

  const movePrinting = async (slug: string, from: string, to: string, qty: number): Promise<boolean> => {
    const src = entries.find((e) => e.printingId === from);
    const n = Math.floor(qty);
    if (!src || from === to || n <= 0 || n > src.qty) return false;
    const dst = entries.find((e) => e.printingId === to);
    const next = entries
      .map((e) => (e.printingId === from ? { ...e, qty: e.qty - n } : e.printingId === to ? { ...e, qty: e.qty + n, note: e.note ?? src.note ?? null } : e))
      .filter((e) => e.qty > 0);
    if (!dst) next.push({ slug, printingId: to, qty: n, note: src.note ?? null });
    if (demo) {
      setDemoEntries(next);
      return true;
    }
    if (mode === 'cloud' && supabase && session) {
      // One transaction on the server, guarded by the quantity we saw (see migration 004).
      const { error } = await supabase.rpc('move_copies', { p_slug: slug, p_from: from, p_to: to, p_qty: n, p_expect_from: src.qty });
      if (error) {
        const missing = /move_copies/.test(error.message) && /(not find|does not exist)/i.test(error.message);
        toast(missing ? 'Moving copies needs database migration 004. Nothing was changed.' : `Couldn't move copies: ${error.message}. Nothing was changed.`, 'err');
        if (/stale move/.test(error.message)) await reloadCloud(); // another device or a retry already moved them
        return false;
      }
    } else if (!writeLS(LS_COL, next)) {
      toast('Could not save: this browser\'s storage is full or blocked.', 'err');
      return false;
    }
    setEntries(next);
    return true;
  };

  const startDemo = async () => {
    try {
      const r = await fetch(DEMO_URL);
      const data = (await r.json()) as { entries: Entry[] };
      setDemoEntries(mergeEntries([], data.entries, 'add'));
    } catch {
      toast('Could not load the demo collection. Try again.', 'err');
    }
  };
  const exitDemo = () => setDemoEntries(null);

  const pushLocalToCloud = async () => {
    const local = readLS(LS_COL, [] as Entry[]);
    const localDecks = readLS(LS_DECKS, [] as Deck[]);
    const merged = mergeEntries(realEntries, local, 'add');
    if (supabase && session) await upsertCloud(merged);
    setEntries(merged);
    for (const d of localDecks) await saveDeck(d);
    setLocalPending(0);
    toast(`Synced ${local.length} entries and ${localDecks.length} decks to your account`);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const value: StoreValue = {
    ready, syncing, mode, session, entries, owned, setQty, addMany, clearCollection,
    decks, saveDeck, deleteDeck, signOut, localPending, pushLocalToCloud, toasts, toast,
    demo, startDemo, exitDemo, movePrinting,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
