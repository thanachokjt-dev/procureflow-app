begin;

alter table public.po_headers enable row level security;

drop policy if exists "PO headers update procurement admin" on public.po_headers;
create policy "PO headers update procurement admin"
on public.po_headers
for update
to authenticated
using (
  public.current_user_role() in ('procurement', 'admin')
  and (
    public.current_user_role() = 'admin'
    or status not in ('pending_variance_confirmation', 'pending_final_approval')
  )
)
with check (
  public.current_user_role() in ('procurement', 'admin')
);

drop policy if exists "PO headers update md assistant final approval" on public.po_headers;
create policy "PO headers update md assistant final approval"
on public.po_headers
for update
to authenticated
using (
  public.current_user_role() = 'md_assistant'
  and status = 'pending_final_approval'
)
with check (
  public.current_user_role() = 'md_assistant'
  and status in ('pending_final_approval', 'approved_for_payment', 'draft', 'cancelled')
);

commit;
