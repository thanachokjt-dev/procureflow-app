begin;

alter table public.po_headers
  add column if not exists variance_reasons text[] not null default '{}',
  add column if not exists variance_summary jsonb,
  add column if not exists variance_status text,
  add column if not exists variance_submitted_at timestamptz,
  add column if not exists variance_submitted_by uuid,
  add column if not exists variance_checked_at timestamptz,
  add column if not exists variance_checked_by uuid,
  add column if not exists variance_checked_notes text,
  add column if not exists variance_approved_at timestamptz,
  add column if not exists variance_approved_by uuid,
  add column if not exists variance_approval_notes text;

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

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_headers'
      and column_name = 'variance_checked_by'
      and udt_name = 'uuid'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'fk_po_headers_variance_checked_by_users'
      and conrelid = 'public.po_headers'::regclass
  ) then
    alter table public.po_headers
      add constraint fk_po_headers_variance_checked_by_users
      foreign key (variance_checked_by)
      references auth.users(id)
      on delete set null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_headers'
      and column_name = 'variance_approved_by'
      and udt_name = 'uuid'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'fk_po_headers_variance_approved_by_users'
      and conrelid = 'public.po_headers'::regclass
  ) then
    alter table public.po_headers
      add constraint fk_po_headers_variance_approved_by_users
      foreign key (variance_approved_by)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_po_headers_variance_status
  on public.po_headers (variance_status);

create index if not exists idx_po_headers_variance_submitted_at
  on public.po_headers (variance_submitted_at desc);

create index if not exists idx_po_headers_variance_checked_at
  on public.po_headers (variance_checked_at desc);

create index if not exists idx_po_headers_variance_approved_at
  on public.po_headers (variance_approved_at desc);

create index if not exists idx_po_headers_variance_checked_by
  on public.po_headers (variance_checked_by);

create index if not exists idx_po_headers_variance_approved_by
  on public.po_headers (variance_approved_by);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_headers'
      and column_name = 'variance_reasons'
      and udt_name = '_text'
  ) then
    create index if not exists idx_po_headers_variance_reasons
      on public.po_headers using gin (variance_reasons);
  end if;
end;
$$;

commit;
