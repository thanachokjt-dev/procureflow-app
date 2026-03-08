begin;

create extension if not exists pgcrypto;

create table if not exists public.pr_number_counters (
  year_value integer primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.generate_pr_number(p_year integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_year integer := coalesce(
    p_year,
    extract(year from timezone('utc', now()))::integer
  );
  next_sequence integer;
begin
  if target_year < 2000 or target_year > 9999 then
    raise exception 'Invalid PR year: %', target_year;
  end if;

  insert into public.pr_number_counters as counters (year_value, last_value, updated_at)
  values (target_year, 1, timezone('utc', now()))
  on conflict (year_value)
  do update
    set last_value = counters.last_value + 1,
        updated_at = timezone('utc', now())
  returning last_value into next_sequence;

  return format('PR-%s-%s', target_year, lpad(next_sequence::text, 4, '0'));
end;
$$;

create or replace function public.set_pr_header_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null or btrim(new.status) = '' then
    new.status := 'draft';
  end if;

  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := public.generate_pr_number();
  end if;

  if new.requester_name is null or btrim(new.requester_name) = '' then
    new.requester_name := 'Unknown Requester';
  end if;

  return new;
end;
$$;

drop trigger if exists set_pr_headers_defaults on public.pr_headers;
create trigger set_pr_headers_defaults
before insert on public.pr_headers
for each row
execute function public.set_pr_header_defaults();

update public.pr_headers
set pr_number = public.generate_pr_number(
  extract(year from coalesce(created_at, timezone('utc', now())))::integer
)
where pr_number is null
   or btrim(pr_number) = '';

create unique index if not exists uq_pr_headers_pr_number
  on public.pr_headers (pr_number);

alter table public.pr_headers
  alter column pr_number set not null;

grant execute on function public.generate_pr_number(integer) to authenticated;

commit;
