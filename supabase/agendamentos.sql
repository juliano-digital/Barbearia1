create extension if not exists "uuid-ossp";

create table if not exists public.agendamentos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  servico text not null,
  nome_cliente text not null,
  whatsapp text not null,
  data_agendamento date not null,
  horario_agendamento time not null,
  status text not null default 'confirmado',
  created_at timestamp with time zone not null default now()
);

alter table public.agendamentos
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.agendamentos
  add column if not exists cancellation_reason text;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

drop index if exists public.agendamentos_horario_confirmado_unique;
drop index if exists public.agendamentos_horario_ativo_unique;
create unique index agendamentos_horario_ativo_unique
  on public.agendamentos (data_agendamento, horario_agendamento)
  where status in ('pendente', 'confirmado');

alter table public.agendamentos
  alter column status set default 'pendente';

alter table public.agendamentos enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Agendamentos disponíveis para consulta pública"
  on public.agendamentos;
create policy "Agendamentos disponíveis para consulta pública"
  on public.agendamentos for select
  to anon
  using (true);

drop policy if exists "Administradores podem consultar agendamentos"
  on public.agendamentos;
create policy "Administradores podem consultar agendamentos"
  on public.agendamentos for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

drop policy if exists "Clientes podem consultar seus próprios agendamentos"
  on public.agendamentos;
create policy "Clientes podem consultar seus próprios agendamentos"
  on public.agendamentos for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Administradores podem excluir agendamentos"
  on public.agendamentos;
drop policy if exists "Agendamentos podem ser excluídos publicamente"
  on public.agendamentos;
create policy "Agendamentos podem ser excluídos publicamente"
  on public.agendamentos for delete
  to anon, authenticated
  using (true);

create or replace function public.cancelar_agendamento(
  p_agendamento_id uuid,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_motivo, ''))) not between 5 and 500 then
    raise exception 'Informe um motivo com pelo menos 5 caracteres.';
  end if;

  update public.agendamentos
  set status = 'cancelado',
      cancellation_reason = btrim(p_motivo)
  where id = p_agendamento_id
    and status in ('pendente', 'confirmado')
    and (data_agendamento + horario_agendamento) >
      (now() at time zone 'America/Sao_Paulo') + interval '20 minutes';

  return found;
end;
$$;

revoke all on function public.cancelar_agendamento(uuid, text) from public, anon, authenticated;
grant execute on function public.cancelar_agendamento(uuid, text) to anon, authenticated;

drop policy if exists "Administradores podem consultar seu próprio acesso"
  on public.admin_users;
create policy "Administradores podem consultar seu próprio acesso"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Agendamentos podem ser criados publicamente"
  on public.agendamentos;
drop policy if exists "Agendamentos só podem ser criados por clientes verificados"
  on public.agendamentos;
create policy "Agendamentos podem ser criados publicamente"
  on public.agendamentos for insert
  to anon, authenticated
  with check (
    status = 'pendente'
    and servico in ('Corte masculino', 'Barba', 'Corte + Barba')
    and length(trim(nome_cliente)) > 0
    and length(trim(whatsapp)) > 0
    and (user_id is null or user_id = (select auth.uid()))
    and horario_agendamento between time '08:00' and time '18:00'
    and (data_agendamento + horario_agendamento) >
      (now() at time zone 'America/Sao_Paulo')
  );

drop policy if exists "Clientes podem cancelar seus próprios agendamentos com antecedência"
  on public.agendamentos;
create policy "Clientes podem cancelar seus próprios agendamentos com antecedência"
  on public.agendamentos for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'confirmado'
    and (data_agendamento + horario_agendamento) >
      (now() at time zone 'America/Sao_Paulo') + interval '20 minutes'
  )
  with check (
    user_id = (select auth.uid())
    and status = 'cancelado'
    and cancellation_reason is not null
    and length(trim(cancellation_reason)) between 5 and 500
  );

grant usage on schema public to anon, authenticated;
revoke all privileges on table public.agendamentos from anon, authenticated;
grant select (
  id,
  servico,
  nome_cliente,
  whatsapp,
  data_agendamento,
  horario_agendamento,
  status
)
  on public.agendamentos to anon;
grant select on table public.agendamentos to authenticated;
revoke insert on table public.agendamentos from anon, authenticated;
grant insert (user_id, servico, nome_cliente, whatsapp, data_agendamento, horario_agendamento, status)
  on public.agendamentos to anon, authenticated;
revoke delete on table public.agendamentos from anon, authenticated;
grant delete on table public.agendamentos to anon, authenticated;
revoke update on table public.agendamentos from anon, authenticated;
grant update (status, cancellation_reason) on public.agendamentos to authenticated;

revoke all on public.admin_users from anon, authenticated;
grant select (user_id) on public.admin_users to authenticated;

-- Para habilitar o painel real:
-- 1. Crie a conta do administrador em Supabase > Authentication > Users.
-- 2. Insira o UUID dessa conta em public.admin_users:
-- insert into public.admin_users (user_id)
-- values ('UUID-DO-USUARIO-ADMIN')
-- on conflict (user_id) do nothing;

-- A consulta pública da agenda também exibe os dados de contato dos agendamentos.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'agendamentos'
     ) then
    execute 'alter publication supabase_realtime add table public.agendamentos';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Agendamentos antigos sem user_id não podem ser associados automaticamente a um cliente.
