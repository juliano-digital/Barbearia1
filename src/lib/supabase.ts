import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AgendamentoRow = {
  id: string;
  user_id: string | null;
  servico: string;
  nome_cliente: string;
  whatsapp: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  created_at: string;
  cancellation_reason: string | null;
};

type AgendamentoInsert = {
  id?: string;
  user_id?: string | null;
  servico: string;
  nome_cliente: string;
  whatsapp: string;
  data_agendamento: string;
  horario_agendamento: string;
  status?: string;
  created_at?: string;
  cancellation_reason?: string | null;
};

export type Database = {
  public: {
    Tables: {
      agendamentos: {
        Row: AgendamentoRow;
        Insert: AgendamentoInsert;
        Update: Partial<AgendamentoInsert>;
        Relationships: [];
      };
      admin_users: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      cancelar_agendamento: {
        Args: { p_agendamento_id: string; p_motivo: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let supabase: SupabaseClient<Database> | undefined;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured()) {
    throw new Error("O agendamento ainda não está configurado. Tente novamente mais tarde.");
  }

  supabase ??= createClient<Database>(url, anonKey);
  return supabase;
}
