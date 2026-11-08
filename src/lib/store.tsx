import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { BY_SLUG } from './data';

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
  addMany: (items: Entry[], mode?: 'add' | 'replace') => Promise<void>;
  clearCollection: () => Promise<void>;
  decks: Deck[];
  saveDeck: (d: Deck) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  localPending: number; // local entries not yet synced after sign-in
  pushLocalToCloud: () => Promise<void>;
  toasts: Toast[];
  toast: (msg: string, tone?: 'ok' | 'err') => void;
}

const Ctx = createContext<StoreValue | null>(null);
const LS_COL = 'cptv.collection.v1';
const LS_DECKS = 'cptv.decks.v1';

const readLS = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const writeLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(16).slice(2)}`;

function mergeEntries(base: Entry[], items: Entry[], mode: 'add' | 'replace'): Entry[] {
  const map = new Map(base.map((e) => [e.printingId, { ...e }]));
  for (const it of items) {
    if (!BY_SLUG.has(it.slug) || it.qty <= 0) continue;
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
  const [entries, setEntries] = useState<Entry[]>(() => readLS(LS_COL, [] as Entry[]));
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
      setEntries(col.data.map((r) => ({ slug: r.card_slug, printingId: r.printing_id, qty: r.qty, note: r.note })));
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
    if (mode === 'local') writeLS(LS_COL, entries);
  }, [entries, mode]);
  useEffect(() => {
    if (mode === 'local') writeLS(LS_DECKS, decks);
  }, [decks, mode]);

  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.slug, (m.get(e.slug) ?? 0) + e.qty);
    return m;
  }, [entries]);

  const upsertCloud = async (items: Entry[]) => {
    if (!supabase || !session) return;
    const del = items.filter((e) => e.qty <= 0).map((e) => e.printingId);
    const up = items
      .filter((e) => e.qty > 0)
      .map((e) => ({ user_id: session.user.id, card_slug: e.slug, printing_id: e.printingId, qty: e.qty, note: e.note ?? null }));
    if (up.length) {
      const { error } = await supabase.from('collection_items').upsert(up, { onConflict: 'user_id,printing_id' });
      if (error) toast(`Save failed: ${error.message}`, 'err');
    }
    if (del.length) {
      const { error } = await supabase.from('collection_items').delete().in('printing_id', del);
      if (error) toast(`Delete failed: ${error.message}`, 'err');
    }
  };

  const setQty = async (slug: string, printingId: string, qty: number, note?: string | null) => {
    const q = Math.max(0, Math.min(999, Math.round(qty)));
    const ex = entries.find((e) => e.printingId === printingId);
    const changed: Entry = { slug, printingId, qty: q, note: note === undefined ? ex?.note ?? null : note };
    setEntries((prev) => {
      const rest = prev.filter((e) => e.printingId !== printingId);
      return q > 0 ? [...rest, changed] : rest;
    });
    if (mode === 'cloud') await upsertCloud([changed]);
  };

  const addMany = async (items: Entry[], m: 'add' | 'replace' = 'add') => {
    const next = mergeEntries(m === 'replace' ? [] : entries, items, 'add');
    if (mode === 'cloud' && supabase && session) {
      if (m === 'replace') await supabase.from('collection_items').delete().eq('user_id', session.user.id);
      await upsertCloud(next);
    }
    setEntries(next);
  };

  const clearCollection = async () => {
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

  const pushLocalToCloud = async () => {
    const local = readLS(LS_COL, [] as Entry[]);
    const localDecks = readLS(LS_DECKS, [] as Deck[]);
    await addMany(local, 'add');
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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
