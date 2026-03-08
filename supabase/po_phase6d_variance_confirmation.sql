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

alter table public.po_headers enable row level security;
alter table public.po_lines enable row level security;

drop policy if exists "PO headers select by role" on public.po_headers;
create policy "PO headers select by role"
on public.po_headers
for select
to authenticated
using (
  public.current_user_role() in ('admin', 'manager', 'procurement', 'md_assistant', 'accounting')
  or created_by_user_id = auth.uid()
  or exists (
    select 1
    from public.pr_headers pr
    where pr.id = po_headers.source_pr_id
      and pr.requester_user_id = auth.uid()
  )
);

drop policy if exists "PO headers update procurement admin" on public.po_headers;
drop policy if exists "PO headers update manager variance confirmation" on public.po_headers;
drop policy if exists "PO headers update admin" on public.po_headers;

create policy "PO headers update procurement admin"
on public.po_headers
for update
to authenticated
using (
  public.current_user_role() in ('procurement', 'admin')
  and (
    public.current_user_role() = 'admin'
    or status <> 'pending_variance_confirmation'
  )
)
with check (
  public.current_user_role() in ('procurement', 'admin')
);

create policy "PO headers update manager variance confirmation"
on public.po_headers
for update
to authenticated
using (
  public.current_user_role() = 'manager'
  and status = 'pending_variance_confirmation'
)
with check (
  public.current_user_role() = 'manager'
  and status in ('pending_variance_confirmation', 'pending_final_approval', 'draft', 'cancelled')
);

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
        public.current_user_role() in ('admin', 'manager', 'procurement', 'md_assistant', 'accounting')
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

commit;
