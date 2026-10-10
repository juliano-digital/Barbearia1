import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | undefined;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured()) {
    throw new Error("O agendamento ainda não está configurado. Tente novamente mais tarde.");
  }

  supabase ??= createClient(url, anonKey);
  return supabase;
}
