begin;

with normalized_departments as (
  select
    id,
    case
      when lower(trim(department)) in ('human resources', 'human resource', 'hr') then 'Human Resources'
      when lower(trim(department)) in ('warehouse', 'wh') then 'Warehouse'
      when lower(trim(department)) in ('retail', 'store', 'shop') then 'Retail'
      when lower(trim(department)) in ('housekeeping', 'house keeping') then 'Housekeeping'
      when lower(trim(department)) in ('engineering', 'engineer', 'eng') then 'Engineering'
      when lower(trim(department)) in ('kru muay', 'muay', 'coach', 'trainer') then 'Kru Muay'
      when lower(trim(department)) in ('front office', 'front desk') then 'Front Office'
      when lower(trim(department)) in ('reservations', 'reservation') then 'Reservations'
      when lower(trim(department)) in ('marketing', 'mkt') then 'Marketing'
      when lower(trim(department)) in ('other', 'others') then 'Other'
      else null
    end as mapped_department
  from public.pr_headers
)
update public.pr_headers as headers
set department = normalized_departments.mapped_department
from normalized_departments
where headers.id = normalized_departments.id
  and normalized_departments.mapped_department is not null
  and headers.department is distinct from normalized_departments.mapped_department;

with normalized_profile_departments as (
  select
    id,
    case
      when lower(trim(department)) in ('human resources', 'human resource', 'hr') then 'Human Resources'
      when lower(trim(department)) in ('warehouse', 'wh') then 'Warehouse'
      when lower(trim(department)) in ('retail', 'store', 'shop') then 'Retail'
      when lower(trim(department)) in ('housekeeping', 'house keeping') then 'Housekeeping'
      when lower(trim(department)) in ('engineering', 'engineer', 'eng') then 'Engineering'
      when lower(trim(department)) in ('kru muay', 'muay', 'coach', 'trainer') then 'Kru Muay'
      when lower(trim(department)) in ('front office', 'front desk') then 'Front Office'
      when lower(trim(department)) in ('reservations', 'reservation') then 'Reservations'
      when lower(trim(department)) in ('marketing', 'mkt') then 'Marketing'
      when lower(trim(department)) in ('other', 'others') then 'Other'
      else null
    end as mapped_department
  from public.profiles
)
update public.profiles as profiles
set department = normalized_profile_departments.mapped_department
from normalized_profile_departments
where profiles.id = normalized_profile_departments.id
  and normalized_profile_departments.mapped_department is not null
  and profiles.department is distinct from normalized_profile_departments.mapped_department;

commit;
