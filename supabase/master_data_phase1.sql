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

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  supplier_name text not null,
  contact_name text,
  email text,
  phone text,
  payment_terms text,
  lead_time_days integer,
  currency text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  item_name text not null,
  category text,
  brand text,
  model text,
  color text,
  size text,
  unit text not null,
  description text,
  spec_text text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_suppliers_supplier_code on public.suppliers (supplier_code);
create index if not exists idx_suppliers_supplier_name on public.suppliers (supplier_name);
create index if not exists idx_suppliers_active on public.suppliers (active);

create index if not exists idx_items_sku on public.items (sku);
create index if not exists idx_items_item_name on public.items (item_name);
create index if not exists idx_items_brand on public.items (brand);
create index if not exists idx_items_model on public.items (model);
create index if not exists idx_items_category on public.items (category);
create index if not exists idx_items_active on public.items (active);

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

drop trigger if exists set_items_updated_at on public.items;
create trigger set_items_updated_at
before update on public.items
for each row
execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.items enable row level security;

drop policy if exists "Suppliers select by role" on public.suppliers;
create policy "Suppliers select by role"
on public.suppliers
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'admin')
  or (public.current_user_role() = 'staff' and active = true)
);

drop policy if exists "Suppliers insert manager admin" on public.suppliers;
create policy "Suppliers insert manager admin"
on public.suppliers
for insert
to authenticated
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Suppliers update manager admin" on public.suppliers;
create policy "Suppliers update manager admin"
on public.suppliers
for update
to authenticated
using (public.current_user_role() in ('manager', 'admin'))
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Suppliers delete manager admin" on public.suppliers;
create policy "Suppliers delete manager admin"
on public.suppliers
for delete
to authenticated
using (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Items select by role" on public.items;
create policy "Items select by role"
on public.items
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'admin')
  or (public.current_user_role() = 'staff' and active = true)
);

drop policy if exists "Items insert manager admin" on public.items;
create policy "Items insert manager admin"
on public.items
for insert
to authenticated
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Items update manager admin" on public.items;
create policy "Items update manager admin"
on public.items
for update
to authenticated
using (public.current_user_role() in ('manager', 'admin'))
with check (public.current_user_role() in ('manager', 'admin'));

drop policy if exists "Items delete manager admin" on public.items;
create policy "Items delete manager admin"
on public.items
for delete
to authenticated
using (public.current_user_role() in ('manager', 'admin'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.items to authenticated;

commit;
