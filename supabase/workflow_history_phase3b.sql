begin;

create extension if not exists pgcrypto;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(role::text)
  from public.profiles
  where id = auth.uid();
$$;

create table if not exists public.workflow_history (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('pr', 'po')),
  document_id uuid not null,
  action text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  comment text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workflow_history_document
  on public.workflow_history (document_type, document_id, created_at desc);
create index if not exists idx_workflow_history_actor_user
  on public.workflow_history (actor_user_id, created_at desc);
create index if not exists idx_workflow_history_action
  on public.workflow_history (action);

alter table public.workflow_history enable row level security;

drop policy if exists "Workflow history select visible" on public.workflow_history;
create policy "Workflow history select visible"
on public.workflow_history
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or public.current_user_role() in (
    'manager',
    'procurement',
    'md_assistant',
    'accounting',
    'admin'
  )
);

drop policy if exists "Workflow history insert own actor" on public.workflow_history;
create policy "Workflow history insert own actor"
on public.workflow_history
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
);

drop policy if exists "Workflow history update admin only" on public.workflow_history;
create policy "Workflow history update admin only"
on public.workflow_history
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Workflow history delete admin only" on public.workflow_history;
create policy "Workflow history delete admin only"
on public.workflow_history
for delete
to authenticated
using (public.current_user_role() = 'admin');

grant select, insert, update, delete on public.workflow_history to authenticated;

commit;
