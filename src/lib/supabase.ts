import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the app runs in local-only mode (no Supabase env vars configured). */
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const cloudEnabled = !!supabase;

let providersPromise: Promise<Record<string, boolean>> | null = null;
/** Which OAuth providers are switched on in the Supabase dashboard (so we only show working buttons). */
export function enabledProviders(): Promise<Record<string, boolean>> {
  if (!url || !anon) return Promise.resolve({});
  providersPromise ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { external?: Record<string, boolean> }) => d.external ?? {})
    .catch(() => ({}));
  return providersPromise;
}
