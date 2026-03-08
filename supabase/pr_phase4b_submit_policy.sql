begin;

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

commit;
