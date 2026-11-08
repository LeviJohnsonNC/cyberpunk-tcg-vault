import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the app runs in local-only mode (no Supabase env vars configured). */
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const cloudEnabled = !!supabase;
