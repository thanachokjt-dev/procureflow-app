begin;

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

alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.item_supplier_map enable row level security;

drop policy if exists "Suppliers select by role" on public.suppliers;
create policy "Suppliers select by role"
on public.suppliers
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'procurement', 'md_assistant', 'accounting', 'admin')
  or (public.current_user_role() in ('staff', 'requester') and active = true)
);

drop policy if exists "Items select by role" on public.items;
create policy "Items select by role"
on public.items
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'procurement', 'md_assistant', 'accounting', 'admin')
  or (public.current_user_role() in ('staff', 'requester') and active = true)
);

drop policy if exists "Item supplier map select by role" on public.item_supplier_map;
create policy "Item supplier map select by role"
on public.item_supplier_map
for select
to authenticated
using (
  public.current_user_role() in ('manager', 'procurement', 'md_assistant', 'accounting', 'admin')
  or (
    public.current_user_role() in ('staff', 'requester')
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

commit;
