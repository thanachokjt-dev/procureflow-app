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
  select lower(trim(role::text))
  from public.profiles
  where id = auth.uid();
$$;

create table if not exists public.po_number_counters (
  year_value integer primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.generate_po_number(p_year integer default null)
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
    raise exception 'Invalid PO year: %', target_year;
  end if;

  insert into public.po_number_counters as counters (year_value, last_value, updated_at)
  values (target_year, 1, timezone('utc', now()))
  on conflict (year_value)
  do update
    set last_value = counters.last_value + 1,
        updated_at = timezone('utc', now())
  returning last_value into next_sequence;

  return format('PO-%s-%s', target_year, lpad(next_sequence::text, 4, '0'));
end;
$$;

create table if not exists public.po_headers (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  source_pr_id uuid not null references public.pr_headers(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name_snapshot text,
  department text,
  requester_name text,
  purpose text,
  needed_by_date date,
  status text not null default 'draft',
  notes text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_po_headers_source_pr_id unique (source_pr_id),
  constraint chk_po_headers_status check (
    status in (
      'draft',
      'pending_variance_confirmation',
      'pending_final_approval',
      'approved_for_payment',
      'pending_accounting_check',
      'accounting_in_review',
      'ordered',
      'partially_received',
      'fully_received',
      'closed',
      'cancelled'
    )
  )
);

alter table public.po_headers
  add column if not exists po_number text,
  add column if not exists source_pr_id uuid,
  add column if not exists supplier_id uuid,
  add column if not exists supplier_name_snapshot text,
  add column if not exists department text,
  add column if not exists requester_name text,
  add column if not exists purpose text,
  add column if not exists needed_by_date date,
  add column if not exists status text default 'draft',
  add column if not exists notes text,
  add column if not exists created_by_user_id uuid,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.po_headers(id) on delete cascade,
  pr_line_id uuid references public.pr_lines(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  sku text,
  item_name text not null,
  description text,
  unit text not null,
  requested_qty numeric(14,2) not null check (requested_qty > 0),
  ordered_qty numeric(14,2) not null check (ordered_qty > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  currency text,
  line_total numeric(14,2) generated always as (coalesce(ordered_qty, 0) * coalesce(unit_price, 0)) stored,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_sku text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  remarks text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.po_lines
  add column if not exists po_id uuid,
  add column if not exists pr_line_id uuid,
  add column if not exists item_id uuid,
  add column if not exists sku text,
  add column if not exists item_name text,
  add column if not exists description text,
  add column if not exists unit text,
  add column if not exists requested_qty numeric(14,2),
  add column if not exists ordered_qty numeric(14,2),
  add column if not exists unit_price numeric(14,2) default 0,
  add column if not exists currency text,
  add column if not exists line_total numeric(14,2) generated always as (coalesce(ordered_qty, 0) * coalesce(unit_price, 0)) stored,
  add column if not exists supplier_id uuid,
  add column if not exists supplier_sku text,
  add column if not exists lead_time_days integer,
  add column if not exists remarks text,
  add column if not exists created_at timestamptz default timezone('utc', now());

create index if not exists idx_po_headers_source_pr_id
  on public.po_headers (source_pr_id);
create index if not exists idx_po_headers_status
  on public.po_headers (status);
create index if not exists idx_po_headers_created_at
  on public.po_headers (created_at desc);
create index if not exists idx_po_lines_po_id
  on public.po_lines (po_id);
create index if not exists idx_po_lines_item_id
  on public.po_lines (item_id);
create index if not exists idx_po_lines_supplier_id
  on public.po_lines (supplier_id);

create or replace function public.set_po_header_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null or btrim(new.status) = '' then
    new.status := 'draft';
  end if;

  if new.po_number is null or btrim(new.po_number) = '' then
    new.po_number := public.generate_po_number();
  end if;

  return new;
end;
$$;

drop trigger if exists set_po_headers_updated_at on public.po_headers;
create trigger set_po_headers_updated_at
before update on public.po_headers
for each row
execute function public.set_updated_at();

drop trigger if exists set_po_headers_defaults on public.po_headers;
create trigger set_po_headers_defaults
before insert on public.po_headers
for each row
execute function public.set_po_header_defaults();

alter table public.po_headers enable row level security;
alter table public.po_lines enable row level security;

drop policy if exists "PO headers select by role" on public.po_headers;
create policy "PO headers select by role"
on public.po_headers
for select
to authenticated
using (
  public.current_user_role() = 'admin'
  or public.current_user_role() = 'procurement'
  or public.current_user_role() = 'md_assistant'
  or public.current_user_role() = 'accounting'
  or created_by_user_id = auth.uid()
  or exists (
    select 1
    from public.pr_headers pr
    where pr.id = po_headers.source_pr_id
      and pr.requester_user_id = auth.uid()
  )
);

drop policy if exists "PO headers insert procurement admin" on public.po_headers;
create policy "PO headers insert procurement admin"
on public.po_headers
for insert
to authenticated
with check (
  public.current_user_role() in ('procurement', 'admin')
  and created_by_user_id = auth.uid()
);

drop policy if exists "PO headers update procurement admin" on public.po_headers;
create policy "PO headers update procurement admin"
on public.po_headers
for update
to authenticated
using (public.current_user_role() in ('procurement', 'admin'))
with check (public.current_user_role() in ('procurement', 'admin'));

drop policy if exists "PO headers delete procurement admin" on public.po_headers;
create policy "PO headers delete procurement admin"
on public.po_headers
for delete
to authenticated
using (public.current_user_role() in ('procurement', 'admin'));

drop policy if exists "PO lines select by visible header" on public.po_lines;
create policy "PO lines select by visible header"
on public.po_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.po_headers po
    where po.id = po_lines.po_id
      and (
        public.current_user_role() = 'admin'
        or public.current_user_role() = 'procurement'
        or public.current_user_role() = 'md_assistant'
        or public.current_user_role() = 'accounting'
        or po.created_by_user_id = auth.uid()
        or exists (
          select 1
          from public.pr_headers pr
          where pr.id = po.source_pr_id
            and pr.requester_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "PO lines insert procurement admin" on public.po_lines;
create policy "PO lines insert procurement admin"
on public.po_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.po_headers po
    where po.id = po_lines.po_id
      and public.current_user_role() in ('procurement', 'admin')
  )
);

drop policy if exists "PO lines update procurement admin" on public.po_lines;
create policy "PO lines update procurement admin"
on public.po_lines
for update
to authenticated
using (
  exists (
    select 1
    from public.po_headers po
    where po.id = po_lines.po_id
      and public.current_user_role() in ('procurement', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.po_headers po
    where po.id = po_lines.po_id
      and public.current_user_role() in ('procurement', 'admin')
  )
);

drop policy if exists "PO lines delete procurement admin" on public.po_lines;
create policy "PO lines delete procurement admin"
on public.po_lines
for delete
to authenticated
using (
  exists (
    select 1
    from public.po_headers po
    where po.id = po_lines.po_id
      and public.current_user_role() in ('procurement', 'admin')
  )
);

grant select, insert, update, delete on public.po_headers to authenticated;
grant select, insert, update, delete on public.po_lines to authenticated;
grant execute on function public.generate_po_number(integer) to authenticated;

commit;
