-- Banco compartilhado do Laboratório Lotofácil (Supabase).
-- Cole tudo no SQL Editor do projeto e clique em Run.
-- Não há senha nos perfis (pedido do projeto): quem abre o site pode ler e gravar.

create table if not exists public.perfis (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.apostas (
  id text primary key,
  perfil_id text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
create index if not exists apostas_perfil_idx on public.apostas (perfil_id);

create table if not exists public.resultados (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;
alter table public.apostas enable row level security;
alter table public.resultados enable row level security;

drop policy if exists "site le e grava" on public.perfis;
drop policy if exists "site le e grava" on public.apostas;
drop policy if exists "site le e grava" on public.resultados;
create policy "site le e grava" on public.perfis for all to anon using (true) with check (true);
create policy "site le e grava" on public.apostas for all to anon using (true) with check (true);
create policy "site le e grava" on public.resultados for all to anon using (true) with check (true);

grant select, insert, update, delete on public.perfis, public.apostas, public.resultados to anon;
