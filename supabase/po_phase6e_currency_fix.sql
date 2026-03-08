begin;

alter table public.po_lines
  add column if not exists currency text not null default 'THB';

update public.po_lines
set currency = 'THB'
where currency is null
   or btrim(currency) = '';

alter table public.po_lines
  alter column currency set default 'THB',
  alter column currency set not null;

commit;
