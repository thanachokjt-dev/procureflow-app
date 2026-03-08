begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

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

create table if not exists public.pr_number_counters (
  year_value integer primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.generate_pr_number(p_year integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_year integer := coalesce(
    p_year,
    extract(year from timezone('utc', now()))::integer
  );
  next_sequence integer;
begin
  if target_year < 2000 or target_year > 9999 then
    raise exception 'Invalid PR year: %', target_year;
  end if;

  insert into public.pr_number_counters as counters (year_value, last_value, updated_at)
  values (target_year, 1, timezone('utc', now()))
  on conflict (year_value)
  do update
    set last_value = counters.last_value + 1,
        updated_at = timezone('utc', now())
  returning last_value into next_sequence;

  return format('PR-%s-%s', target_year, lpad(next_sequence::text, 4, '0'));
end;
$$;

create table if not exists public.pr_headers (
  id uuid primary key default gen_random_uuid(),
  pr_number text not null unique,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  requester_name text not null,
  department text,
  purpose text,
  needed_by_date date,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_pr_headers_status check (
    status in ('draft', 'submitted', 'approved', 'rejected', 'converted_to_po', 'closed')
  )
);

create table if not exists public.pr_lines (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references public.pr_headers(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  sku text,
  item_name text not null,
  description text,
  unit text not null,
  requested_qty numeric(14, 2) not null check (requested_qty > 0),
  estimated_unit_price numeric(14, 2) not null default 0 check (estimated_unit_price >= 0),
  estimated_total numeric(14, 2)
    generated always as (coalesce(requested_qty, 0) * coalesce(estimated_unit_price, 0)) stored,
  preferred_supplier_id uuid references public.suppliers(id) on delete set null,
  remarks text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pr_headers_requester_user_id
  on public.pr_headers (requester_user_id);
create index if not exists idx_pr_headers_status
  on public.pr_headers (status);
create index if not exists idx_pr_headers_created_at
  on public.pr_headers (created_at desc);
create index if not exists idx_pr_lines_pr_id
  on public.pr_lines (pr_id);
create index if not exists idx_pr_lines_item_id
  on public.pr_lines (item_id);
create index if not exists idx_pr_lines_preferred_supplier_id
  on public.pr_lines (preferred_supplier_id);

create or replace function public.set_pr_header_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null or btrim(new.status) = '' then
    new.status := 'draft';
  end if;

  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := public.generate_pr_number();
  end if;

  if new.requester_name is null or btrim(new.requester_name) = '' then
    new.requester_name := 'Unknown Requester';
  end if;

  return new;
end;
$$;

drop trigger if exists set_pr_headers_updated_at on public.pr_headers;
create trigger set_pr_headers_updated_at
before update on public.pr_headers
for each row
execute function public.set_updated_at();

drop trigger if exists set_pr_headers_defaults on public.pr_headers;
create trigger set_pr_headers_defaults
before insert on public.pr_headers
for each row
execute function public.set_pr_header_defaults();

alter table public.pr_headers enable row level security;
alter table public.pr_lines enable row level security;

drop policy if exists "PR headers select by role" on public.pr_headers;
create policy "PR headers select by role"
on public.pr_headers
for select
to authenticated
using (
  public.current_user_role() = 'admin'
  or requester_user_id = auth.uid()
  or (
    public.current_user_role() in ('manager', 'procurement', 'md_assistant', 'accounting')
    and status <> 'draft'
  )
);

drop policy if exists "PR headers insert requester own draft or admin" on public.pr_headers;
create policy "PR headers insert requester own draft or admin"
on public.pr_headers
for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() in ('staff', 'requester')
    and requester_user_id = auth.uid()
    and status = 'draft'
  )
);

drop policy if exists "PR headers update requester own draft" on public.pr_headers;
create policy "PR headers update requester own draft"
on public.pr_headers
for update
to authenticated
using (
  public.current_user_role() in ('staff', 'requester')
  and requester_user_id = auth.uid()
  and status = 'draft'
)
with check (
  public.current_user_role() in ('staff', 'requester')
  and requester_user_id = auth.uid()
  and status in ('draft', 'submitted')
);

drop policy if exists "PR headers update manager submitted" on public.pr_headers;
create policy "PR headers update manager submitted"
on public.pr_headers
for update
to authenticated
using (
  public.current_user_role() = 'manager'
  and status = 'submitted'
)
with check (
  public.current_user_role() = 'manager'
  and status in ('submitted', 'approved', 'rejected')
);

drop policy if exists "PR headers update admin" on public.pr_headers;
create policy "PR headers update admin"
on public.pr_headers
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "PR headers delete requester own draft or admin" on public.pr_headers;
create policy "PR headers delete requester own draft or admin"
on public.pr_headers
for delete
to authenticated
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() in ('staff', 'requester')
    and requester_user_id = auth.uid()
    and status = 'draft'
  )
);

drop policy if exists "PR lines select by visible header" on public.pr_lines;
create policy "PR lines select by visible header"
on public.pr_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.pr_headers pr
    where pr.id = pr_lines.pr_id
      and (
        public.current_user_role() = 'admin'
        or pr.requester_user_id = auth.uid()
        or (
          public.current_user_role() in ('manager', 'procurement', 'md_assistant', 'accounting')
          and pr.status <> 'draft'
        )
      )
  )
);

drop policy if exists "PR lines insert requester own draft or admin" on public.pr_lines;
create policy "PR lines insert requester own draft or admin"
on public.pr_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.pr_headers pr
    where pr.id = pr_lines.pr_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() in ('staff', 'requester')
          and pr.requester_user_id = auth.uid()
          and pr.status = 'draft'
        )
      )
  )
);

drop policy if exists "PR lines update requester own draft or admin" on public.pr_lines;
create policy "PR lines update requester own draft or admin"
on public.pr_lines
for update
to authenticated
using (
  exists (
    select 1
    from public.pr_headers pr
    where pr.id = pr_lines.pr_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() in ('staff', 'requester')
          and pr.requester_user_id = auth.uid()
          and pr.status = 'draft'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.pr_headers pr
    where pr.id = pr_lines.pr_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() in ('staff', 'requester')
          and pr.requester_user_id = auth.uid()
          and pr.status = 'draft'
        )
      )
  )
);

drop policy if exists "PR lines delete requester own draft or admin" on public.pr_lines;
create policy "PR lines delete requester own draft or admin"
on public.pr_lines
for delete
to authenticated
using (
  exists (
    select 1
    from public.pr_headers pr
    where pr.id = pr_lines.pr_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() in ('staff', 'requester')
          and pr.requester_user_id = auth.uid()
          and pr.status = 'draft'
        )
      )
  )
);

grant select, insert, update, delete on public.pr_headers to authenticated;
grant select, insert, update, delete on public.pr_lines to authenticated;
grant execute on function public.generate_pr_number(integer) to authenticated;

commit;
