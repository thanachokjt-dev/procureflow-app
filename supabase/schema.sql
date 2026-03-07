begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
  ) then
    create type public.app_role as enum ('staff', 'manager', 'admin');
  end if;
end $$;

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

create sequence if not exists public.purchase_request_no_seq start with 1001;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  department text,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('REQ-' || lpad(nextval('public.purchase_request_no_seq')::text, 5, '0')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  requester_name text not null,
  title text not null,
  category text not null,
  department text,
  vendor_name text,
  needed_by date,
  justification text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  requested_total numeric(12, 2) not null default 0 check (requested_total >= 0),
  status public.purchase_request_status not null default 'pending',
  manager_note text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_name text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_purchase_requests_updated_at on public.purchase_requests;
create trigger set_purchase_requests_updated_at
before update on public.purchase_requests
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'staff'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

drop policy if exists "Profiles select own or admin" on public.profiles;
create policy "Profiles select own or admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.get_my_role() = 'admin'::public.app_role
);

drop policy if exists "Profiles insert own or admin" on public.profiles;
create policy "Profiles insert own or admin"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.get_my_role() = 'admin'::public.app_role
);

drop policy if exists "Profiles update own or admin" on public.profiles;
create policy "Profiles update own or admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.get_my_role() = 'admin'::public.app_role
)
with check (
  id = auth.uid()
  or public.get_my_role() = 'admin'::public.app_role
);

drop policy if exists "Profiles delete admin only" on public.profiles;
create policy "Profiles delete admin only"
on public.profiles
for delete
to authenticated
using (public.get_my_role() = 'admin'::public.app_role);

drop policy if exists "Requests select by role" on public.purchase_requests;
create policy "Requests select by role"
on public.purchase_requests
for select
to authenticated
using (
  public.get_my_role() = 'admin'::public.app_role
  or (
    public.get_my_role() = 'manager'::public.app_role
    and status = 'pending'::public.purchase_request_status
  )
  or created_by = auth.uid()
);

drop policy if exists "Requests insert staff own or admin" on public.purchase_requests;
create policy "Requests insert staff own or admin"
on public.purchase_requests
for insert
to authenticated
with check (
  public.get_my_role() = 'admin'::public.app_role
  or (
    public.get_my_role() = 'staff'::public.app_role
    and created_by = auth.uid()
  )
);

drop policy if exists "Requests update manager pending" on public.purchase_requests;
create policy "Requests update manager pending"
on public.purchase_requests
for update
to authenticated
using (
  public.get_my_role() = 'manager'::public.app_role
  and status = 'pending'::public.purchase_request_status
)
with check (
  public.get_my_role() = 'manager'::public.app_role
  and status in (
    'pending'::public.purchase_request_status,
    'approved'::public.purchase_request_status,
    'rejected'::public.purchase_request_status
  )
);

drop policy if exists "Requests update admin" on public.purchase_requests;
create policy "Requests update admin"
on public.purchase_requests
for update
to authenticated
using (public.get_my_role() = 'admin'::public.app_role)
with check (public.get_my_role() = 'admin'::public.app_role);

drop policy if exists "Requests delete admin only" on public.purchase_requests;
create policy "Requests delete admin only"
on public.purchase_requests
for delete
to authenticated
using (public.get_my_role() = 'admin'::public.app_role);

drop policy if exists "Items select by visible requests" on public.purchase_request_items;
create policy "Items select by visible requests"
on public.purchase_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_requests pr
    where pr.id = request_id
      and (
        public.get_my_role() = 'admin'::public.app_role
        or (
          public.get_my_role() = 'manager'::public.app_role
          and pr.status = 'pending'::public.purchase_request_status
        )
        or pr.created_by = auth.uid()
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
        public.get_my_role() = 'admin'::public.app_role
        or (
          public.get_my_role() = 'staff'::public.app_role
          and pr.created_by = auth.uid()
        )
      )
  )
);

drop policy if exists "Items update admin only" on public.purchase_request_items;
create policy "Items update admin only"
on public.purchase_request_items
for update
to authenticated
using (public.get_my_role() = 'admin'::public.app_role)
with check (public.get_my_role() = 'admin'::public.app_role);

drop policy if exists "Items delete admin only" on public.purchase_request_items;
create policy "Items delete admin only"
on public.purchase_request_items
for delete
to authenticated
using (public.get_my_role() = 'admin'::public.app_role);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.purchase_requests to authenticated;
grant select, insert, update, delete on public.purchase_request_items to authenticated;
grant usage, select on sequence public.purchase_request_no_seq to authenticated;

commit;

-- Example role updates (run manually in SQL editor):
-- update public.profiles set role = 'manager' where id = '<user-uuid>';
-- update public.profiles set role = 'admin' where id = '<user-uuid>';
