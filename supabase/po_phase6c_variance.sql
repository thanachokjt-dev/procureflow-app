begin;

alter table public.po_headers
  add column if not exists variance_reasons text[] not null default '{}',
  add column if not exists variance_summary jsonb,
  add column if not exists variance_checked_at timestamptz;

create index if not exists idx_po_headers_variance_checked_at
  on public.po_headers (variance_checked_at desc);

create index if not exists idx_po_headers_variance_reasons
  on public.po_headers using gin (variance_reasons);

commit;
