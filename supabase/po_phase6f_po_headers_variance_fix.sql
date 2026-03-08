begin;

alter table public.po_headers
  add column if not exists variance_reasons text,
  add column if not exists variance_summary text,
  add column if not exists variance_status text,
  add column if not exists variance_submitted_at timestamptz,
  add column if not exists variance_submitted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_headers'
      and column_name = 'variance_submitted_by'
      and udt_name = 'uuid'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'fk_po_headers_variance_submitted_by_users'
      and conrelid = 'public.po_headers'::regclass
  ) then
    alter table public.po_headers
      add constraint fk_po_headers_variance_submitted_by_users
      foreign key (variance_submitted_by)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_po_headers_variance_status
  on public.po_headers (variance_status);

create index if not exists idx_po_headers_variance_submitted_at
  on public.po_headers (variance_submitted_at desc);

commit;
