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

alter table public.suppliers
  add column if not exists address text,
  add column if not exists tax_id text;

create table if not exists public.item_supplier_map (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text,
  supplier_item_name text,
  unit_price numeric(14,2),
  currency text not null default 'USD',
  moq numeric(14,2),
  lead_time_days integer,
  is_preferred boolean not null default false,
  last_price_date date,
  remarks text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_item_supplier_unit_price_non_negative check (unit_price is null or unit_price >= 0),
  constraint chk_item_supplier_moq_positive check (moq is null or moq > 0),
  constraint chk_item_supplier_lead_time_non_negative check (
    lead_time_days is null or lead_time_days >= 0
  )
);

alter table public.item_supplier_map
  add column if not exists item_id uuid,
  add column if not exists supplier_id uuid,
  add column if not exists supplier_sku text,
  add column if not exists supplier_item_name text,
  add column if not exists unit_price numeric(14,2),
  add column if not exists currency text default 'USD',
  add column if not exists moq numeric(14,2),
  add column if not exists lead_time_days integer,
  add column if not exists is_preferred boolean default false,
  add column if not exists last_price_date date,
  add column if not exists remarks text,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.item_supplier_map
  alter column item_id set not null,
  alter column supplier_id set not null,
  alter column currency set not null,
  alter column active set not null,
  alter column is_preferred set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_item_supplier_map_item'
  ) then
    alter table public.item_supplier_map
      add constraint fk_item_supplier_map_item
      foreign key (item_id) references public.items(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_item_supplier_map_supplier'
  ) then
    alter table public.item_supplier_map
      add constraint fk_item_supplier_map_supplier
      foreign key (supplier_id) references public.suppliers(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_item_supplier_unit_price_non_negative'
  ) then
    alter table public.item_supplier_map
      add constraint chk_item_supplier_unit_price_non_negative
      check (unit_price is null or unit_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_item_supplier_moq_positive'
  ) then
    alter table public.item_supplier_map
      add constraint chk_item_supplier_moq_positive
      check (moq is null or moq > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_item_supplier_lead_time_non_negative'
  ) then
    alter table public.item_supplier_map
      add constraint chk_item_supplier_lead_time_non_negative
      check (lead_time_days is null or lead_time_days >= 0);
  end if;
end
$$;

create index if not exists idx_item_supplier_map_item_id
  on public.item_supplier_map (item_id);
create index if not exists idx_item_supplier_map_supplier_id
  on public.item_supplier_map (supplier_id);
create index if not exists idx_item_supplier_map_active
  on public.item_supplier_map (active);
create index if not exists idx_item_supplier_map_item_active
  on public.item_supplier_map (item_id, active);

create unique index if not exists uq_item_supplier_map_combo
  on public.item_supplier_map (
    item_id,
    supplier_id,
    coalesce(nullif(lower(trim(supplier_sku)), ''), '__none__')
  );

create unique index if not exists uq_item_supplier_map_one_preferred
  on public.item_supplier_map (item_id)
  where is_preferred = true;

drop trigger if exists set_item_supplier_map_updated_at on public.item_supplier_map;
create trigger set_item_supplier_map_updated_at
before update on public.item_supplier_map
for each row
execute function public.set_updated_at();

alter table public.item_supplier_map enable row level security;

drop policy if exists "Item supplier map select by role" on public.item_supplier_map;
create policy "Item supplier map select by role"
on public.item_supplier_map
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'admin')
  or (
    public.current_user_role() = 'staff'
    and active = true
    and exists (
      select 1
      from public.items i
      where i.id = item_supplier_map.item_id
        and i.active = true
    )
    and exists (
      select 1
      from public.suppliers s
      where s.id = item_supplier_map.supplier_id
        and s.active = true
    )
  )
);

drop policy if exists "Item supplier map insert manager admin" on public.item_supplier_map;
create policy "Item supplier map insert manager admin"
on public.item_supplier_map
for insert
to authenticated
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Item supplier map update manager admin" on public.item_supplier_map;
create policy "Item supplier map update manager admin"
on public.item_supplier_map
for update
to authenticated
using (public.current_user_role() in ('manager', 'admin'))
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Item supplier map delete manager admin" on public.item_supplier_map;
create policy "Item supplier map delete manager admin"
on public.item_supplier_map
for delete
to authenticated
using (public.current_user_role() in ('manager', 'admin'));

create or replace view public.v_item_preferred_supplier as
select
  ism.item_id,
  ism.supplier_id,
  s.supplier_code,
  s.supplier_name,
  ism.unit_price,
  ism.currency,
  ism.lead_time_days,
  ism.last_price_date,
  ism.updated_at
from public.item_supplier_map ism
join public.suppliers s on s.id = ism.supplier_id
where ism.is_preferred = true
  and ism.active = true;

grant select, insert, update, delete on public.item_supplier_map to authenticated;
grant select on public.v_item_preferred_supplier to authenticated;

commit;
