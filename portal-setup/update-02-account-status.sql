-- =====================================================================
--  BIRDBOOST FLOCK PORTAL  ·  update 2: switch accounts on and off
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It's safe to run again. Run update 1 (fun codes) first if you haven't.
--
--  Adds an Active / Inactive status to every ambassador account.
--  Inactive accounts can't get into the portal, even with a valid code.
--  Nothing is deleted when an account is switched off.
-- =====================================================================

alter table public.ambassadors add column if not exists is_active boolean not null default true;

-- Every ambassador request goes through this check, so a switched-off
-- account is blocked straight away.
create or replace function public._amb(p_code text) returns public.ambassadors
language plpgsql security definer set search_path = public as $$
declare r public.ambassadors; v_ip text := public._client_ip();
begin
  if (select count(*) from public.code_failures
       where ip = v_ip and tried_at > now() - interval '15 minutes') >= 10 then
    r.full_name := 'too_many_tries'; return r;
  end if;
  select * into r from public.ambassadors
   where upper(access_code) = public._clean_code(p_code);
  if not found then
    insert into public.code_failures (ip) values (v_ip);
    delete from public.code_failures where tried_at < now() - interval '1 day';
    r := null; r.full_name := 'invalid_code'; return r;
  end if;
  -- A switched-off account is blocked even if its code is still valid.
  if not r.is_active then r.id := null; r.full_name := 'account_inactive'; return r; end if;
  if r.code_status <> 'active' then r.id := null; r.full_name := 'code_revoked'; return r; end if;
  if r.code_expires_at is not null and r.code_expires_at < now() then
    r.id := null; r.full_name := 'code_expired'; return r;
  end if;
  update public.ambassadors set code_last_used = now() where id = r.id;
  return r;
end $$;

revoke execute on function public._amb(text) from public, anon, authenticated;

select 'Account on/off switch is ready' as result;
