begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'purchase_request_status'
  ) then
    create type public.purchase_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete restrict,
  requester_email text not null,
  department text not null,
  supplier_name text,
  title text not null,
  justification text not null,
  status public.purchase_request_status not null default 'pending',
  manager_comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_name text not null,
  qty numeric(12, 2) not null check (qty > 0),
  unit text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (qty * unit_price) stored
);

create index if not exists idx_purchase_requests_requester_id
  on public.purchase_requests (requester_id);
create index if not exists idx_purchase_requests_status
  on public.purchase_requests (status);
create index if not exists idx_purchase_request_items_request_id
  on public.purchase_request_items (request_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_purchase_requests_updated_at on public.purchase_requests;
create trigger set_purchase_requests_updated_at
before update on public.purchase_requests
for each row
execute function public.set_updated_at();

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

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

drop policy if exists "Requests select by role" on public.purchase_requests;
create policy "Requests select by role"
on public.purchase_requests
for select
to authenticated
using (
  public.current_user_role() = 'admin'
  or requester_id = auth.uid()
  or (
    public.current_user_role() = 'manager'
    and status = 'pending'
  )
);

drop policy if exists "Requests insert staff own or admin" on public.purchase_requests;
create policy "Requests insert staff own or admin"
on public.purchase_requests
for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'staff'
    and requester_id = auth.uid()
  )
);

drop policy if exists "Requests update manager pending" on public.purchase_requests;
create policy "Requests update manager pending"
on public.purchase_requests
for update
to authenticated
using (
  public.current_user_role() = 'manager'
  and status = 'pending'
)
with check (
  public.current_user_role() = 'manager'
  and status in ('pending', 'approved', 'rejected')
);

drop policy if exists "Requests update admin" on public.purchase_requests;
create policy "Requests update admin"
on public.purchase_requests
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Requests delete admin only" on public.purchase_requests;
create policy "Requests delete admin only"
on public.purchase_requests
for delete
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Items select by role" on public.purchase_request_items;
create policy "Items select by role"
on public.purchase_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_requests pr
    where pr.id = request_id
      and (
        public.current_user_role() = 'admin'
        or pr.requester_id = auth.uid()
        or (
          public.current_user_role() = 'manager'
          and pr.status = 'pending'
        )
      )
  )
);

drop policy if exists "Items insert staff own request or admin" on public.purchase_request_items;
create policy "Items insert staff own request or admin"
on public.purchase_request_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.purchase_requests pr
    where pr.id = request_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() = 'staff'
          and pr.requester_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Items update admin only" on public.purchase_request_items;
create policy "Items update admin only"
on public.purchase_request_items
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Items delete admin only" on public.purchase_request_items;
create policy "Items delete admin only"
on public.purchase_request_items
for delete
to authenticated
using (public.current_user_role() = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.purchase_requests to authenticated;
grant select, insert, update, delete on public.purchase_request_items to authenticated;

commit;
