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

grant select, update on public.pr_headers to authenticated;
grant select on public.pr_lines to authenticated;

commit;
