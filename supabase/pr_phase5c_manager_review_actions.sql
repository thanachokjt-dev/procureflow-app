begin;

alter table public.pr_headers enable row level security;

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
  and status in ('submitted', 'approved', 'rejected', 'draft')
);

commit;
