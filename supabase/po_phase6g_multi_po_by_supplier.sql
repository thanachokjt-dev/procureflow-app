begin;

alter table public.po_headers
  drop constraint if exists uq_po_headers_source_pr_id;

create unique index if not exists uq_po_headers_source_pr_id_supplier_id
  on public.po_headers (source_pr_id, supplier_id)
  where supplier_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_po_headers_supplier_required'
      and conrelid = 'public.po_headers'::regclass
  ) then
    alter table public.po_headers
      add constraint chk_po_headers_supplier_required
      check (supplier_id is not null) not valid;
  end if;
end;
$$;

alter table public.po_lines
  add column if not exists source_pr_line_id uuid;

update public.po_lines
set source_pr_line_id = pr_line_id
where source_pr_line_id is null
  and pr_line_id is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_lines'
      and column_name = 'source_pr_line_id'
      and udt_name = 'uuid'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'fk_po_lines_source_pr_line_id'
      and conrelid = 'public.po_lines'::regclass
  ) then
    alter table public.po_lines
      add constraint fk_po_lines_source_pr_line_id
      foreign key (source_pr_line_id)
      references public.pr_lines(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_po_lines_source_pr_line_id
  on public.po_lines (source_pr_line_id);

create unique index if not exists uq_po_lines_po_id_source_pr_line_id
  on public.po_lines (po_id, source_pr_line_id)
  where source_pr_line_id is not null;

alter table public.pr_headers
  drop constraint if exists chk_pr_headers_status;

alter table public.pr_headers
  add constraint chk_pr_headers_status
  check (
    status in (
      'draft',
      'submitted',
      'approved',
      'rejected',
      'partially_converted_to_po',
      'converted_to_po',
      'closed'
    )
  );

drop policy if exists "PR headers update procurement conversion" on public.pr_headers;
create policy "PR headers update procurement conversion"
on public.pr_headers
for update
to authenticated
using (
  public.current_user_role() in ('procurement', 'admin')
  and status in ('approved', 'partially_converted_to_po', 'converted_to_po')
)
with check (
  public.current_user_role() in ('procurement', 'admin')
  and status in ('approved', 'partially_converted_to_po', 'converted_to_po')
);

commit;
