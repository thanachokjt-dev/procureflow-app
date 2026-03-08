begin;

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

commit;
