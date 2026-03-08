begin;

alter table public.workflow_history enable row level security;

drop policy if exists "Workflow history select visible" on public.workflow_history;
create policy "Workflow history select visible"
on public.workflow_history
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or public.current_user_role() in (
    'manager',
    'procurement',
    'md_assistant',
    'accounting',
    'admin'
  )
  or (
    document_type = 'pr'
    and exists (
      select 1
      from public.pr_headers pr
      where pr.id = workflow_history.document_id
        and pr.requester_user_id = auth.uid()
    )
  )
);

commit;
