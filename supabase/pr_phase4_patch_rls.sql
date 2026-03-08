begin;

alter table public.pr_headers enable row level security;
alter table public.pr_lines enable row level security;

drop policy if exists "PR headers insert requester own draft or admin" on public.pr_headers;
create policy "PR headers insert requester own draft or admin"
on public.pr_headers
for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  or (
    requester_user_id = auth.uid()
    and status = 'draft'
  )
);

drop policy if exists "PR headers update requester own draft" on public.pr_headers;
create policy "PR headers update requester own draft"
on public.pr_headers
for update
to authenticated
using (
  requester_user_id = auth.uid()
  and status = 'draft'
)
with check (
  requester_user_id = auth.uid()
  and status in ('draft', 'submitted')
);

drop policy if exists "PR headers delete requester own draft or admin" on public.pr_headers;
create policy "PR headers delete requester own draft or admin"
on public.pr_headers
for delete
to authenticated
using (
  public.current_user_role() = 'admin'
  or (
    requester_user_id = auth.uid()
    and status = 'draft'
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
          pr.requester_user_id = auth.uid()
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
          pr.requester_user_id = auth.uid()
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
          pr.requester_user_id = auth.uid()
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
          pr.requester_user_id = auth.uid()
          and pr.status = 'draft'
        )
      )
  )
);

commit;
