-- The V76 baseline preserves the trusted-publisher schema but intentionally
-- contains no production data. Restore the known Cadu account only when its
-- existing profile still satisfies the administrative trust prerequisite.
insert into public.kc_trusted_publishers (user_id, label)
select
  profile.id,
  'Cadu (OpenClaw) - curador UFG'
from public.profiles as profile
where profile.id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid
  and profile.is_admin is true
on conflict (user_id) do nothing;
