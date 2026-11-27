-- =====================================================================
--  BIRDBOOST FLOCK PORTAL  ·  database setup
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It is safe to run again: it only adds what is missing.
--
--  BEFORE YOU RUN IT: change the email on the line marked  >>> CHANGE ME
--  to the email you will use to log in to the admin page.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- People allowed into the admin page (they also need a Supabase login).
create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassadors (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  phone            text,
  email            text,
  city             text,
  instagram        text,
  tiktok           text,
  notes            text,
  store_code       text not null unique,
  access_code      text not null unique,
  code_status      text not null default 'active' check (code_status in ('active','revoked')),
  code_expires_at  timestamptz,
  code_last_used   timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  details     text,
  link        text,
  due_date    date,
  is_open     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.task_done (
  task_id        uuid not null references public.tasks(id) on delete cascade,
  ambassador_id  uuid not null references public.ambassadors(id) on delete cascade,
  proof_link     text,
  done_at        timestamptz not null default now(),
  primary key (task_id, ambassador_id)
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  brief       text,
  location    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  spots       int,
  dress_code  text,
  is_open     boolean not null default true,   -- open for applications
  created_at  timestamptz not null default now()
);

-- applied   = the ambassador asked to go
-- suggested = an admin would like them there (they can accept)
-- assigned  = confirmed: they are on the team for this event
-- declined  = not this time
create table if not exists public.event_people (
  event_id       uuid not null references public.events(id) on delete cascade,
  ambassador_id  uuid not null references public.ambassadors(id) on delete cascade,
  status         text not null check (status in ('applied','suggested','assigned','declined')),
  message        text,
  updated_at     timestamptz not null default now(),
  primary key (event_id, ambassador_id)
);

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price         numeric(10,2),             -- leave empty for "price coming soon"
  currency      text not null default 'USD',
  sizes         text,                      -- e.g.  S, M, L, XL
  stage         text not null default 'preview' check (stage in ('preview','preorder')),
  front_image   text,
  back_image    text,
  model_url     text,                      -- optional .glb 3D model
  release_note  text,                      -- e.g. "Drops December"
  is_visible    boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.preorders (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  ambassador_id  uuid not null references public.ambassadors(id) on delete cascade,
  size           text,
  quantity       int not null default 1 check (quantity between 1 and 50),
  note           text,
  status         text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
  created_at     timestamptz not null default now()
);

create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  store_code     text not null,
  ambassador_id  uuid references public.ambassadors(id) on delete set null,
  product_id     uuid references public.products(id) on delete set null,
  item           text,
  quantity       int not null default 1,
  amount         numeric(10,2),
  currency       text not null default 'USD',
  customer       text,
  sold_on        date not null default current_date,
  note           text,
  created_at     timestamptz not null default now()
);

create table if not exists public.settings (
  key    text primary key,
  value  text
);
insert into public.settings (key, value) values
  ('whatsapp_link', null),
  ('welcome_message', null),
  ('instagram', '@birdboost_impact'),
  ('tiktok', '@official_birdboost.inc')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Admin check
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- >>> CHANGE ME: put the email you will log in to the admin page with.
insert into public.admins (email) values ('CHANGE-ME@example.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------
-- Security: nobody reads tables directly except logged-in admins.
-- Ambassadors only go through the amb_* functions below, which check
-- their access code every time (so a revoke works instantly).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admins','ambassadors','tasks','task_done','events',
                           'event_people','products','preorders','sales','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Code generators
-- ---------------------------------------------------------------------
-- 8 characters, no look-alikes (no 0/O, 1/I/L). Shown to people as ABCD-EFGH.
create or replace function public._random_code(len int default 8) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(len);
  out text := '';
begin
  for i in 0 .. len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function public._clean_code(c text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(c, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Admin: create an ambassador. Returns the new row (with codes).
create or replace function public.admin_create_ambassador(
  p_full_name text, p_phone text default null, p_email text default null,
  p_city text default null, p_instagram text default null, p_tiktok text default null,
  p_notes text default null, p_store_code text default null, p_valid_days int default null
) returns public.ambassadors
language plpgsql security definer set search_path = public as $$
declare
  r public.ambassadors;
  sc text := public._clean_code(p_store_code);
  ac text;
  base text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'name_required'; end if;

  if sc = '' then
    base := left(public._clean_code(split_part(trim(p_full_name), ' ', 1)), 8);
    if base = '' then base := 'FLOCK'; end if;
    loop
      sc := 'BB' || base || (100 + floor(random() * 900))::int;
      exit when not exists (select 1 from public.ambassadors where store_code = sc);
    end loop;
  elsif exists (select 1 from public.ambassadors where store_code = sc) then
    raise exception 'store_code_taken';
  end if;

  loop
    ac := public._random_code(8);
    exit when not exists (select 1 from public.ambassadors where access_code = ac);
  end loop;

  insert into public.ambassadors (full_name, phone, email, city, instagram, tiktok, notes,
                                  store_code, access_code, code_expires_at)
  values (trim(p_full_name), p_phone, p_email, p_city, p_instagram, p_tiktok, p_notes,
          sc, ac, case when p_valid_days is null then null
                       else now() + make_interval(days => p_valid_days) end)
  returning * into r;
  return r;
end $$;

-- Admin: give an ambassador a brand-new access code (old one stops working).
create or replace function public.admin_new_access_code(p_id uuid, p_valid_days int default null)
returns public.ambassadors
language plpgsql security definer set search_path = public as $$
declare r public.ambassadors; ac text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  loop
    ac := public._random_code(8);
    exit when not exists (select 1 from public.ambassadors where access_code = ac);
  end loop;
  update public.ambassadors
     set access_code = ac, code_status = 'active',
         -- no days given: keep the current expiry date if it's still ahead, otherwise no expiry
         code_expires_at = case when p_valid_days is not null then now() + make_interval(days => p_valid_days)
                                when code_expires_at > now() then code_expires_at
                                else null end
   where id = p_id
  returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Ambassador side. Every call passes the access code.
-- ---------------------------------------------------------------------
create or replace function public._amb(p_code text) returns public.ambassadors
language plpgsql security definer set search_path = public as $$
declare r public.ambassadors;
begin
  select * into r from public.ambassadors
   where access_code = public._clean_code(p_code);
  if not found then raise exception 'invalid_code'; end if;
  if r.code_status <> 'active' then raise exception 'code_revoked'; end if;
  if r.code_expires_at is not null and r.code_expires_at < now() then
    raise exception 'code_expired';
  end if;
  update public.ambassadors set code_last_used = now() where id = r.id;
  return r;
end $$;

-- Everything the ambassador's page needs, in one go.
create or replace function public.amb_home(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  return jsonb_build_object(
    'me', jsonb_build_object(
      'name', me.full_name, 'city', me.city, 'store_code', me.store_code,
      'code_expires_at', me.code_expires_at),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'details', t.details, 'link', t.link,
               'due_date', t.due_date, 'is_open', t.is_open,
               'done', d.task_id is not null, 'proof_link', d.proof_link)
             order by t.is_open desc, t.due_date nulls last, t.created_at desc)
        from public.tasks t
        left join public.task_done d on d.task_id = t.id and d.ambassador_id = me.id
       where t.is_open or d.task_id is not null), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'brief', e.brief, 'location', e.location,
               'starts_at', e.starts_at, 'ends_at', e.ends_at, 'spots', e.spots,
               'dress_code', e.dress_code, 'is_open', e.is_open,
               'my_status', p.status,
               'team_size', (select count(*) from public.event_people x
                              where x.event_id = e.id and x.status = 'assigned'))
             order by e.starts_at nulls last)
        from public.events e
        left join public.event_people p on p.event_id = e.id and p.ambassador_id = me.id
       where e.is_open or p.status is not null), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pr.id, 'name', pr.name, 'description', pr.description,
               'price', pr.price, 'currency', pr.currency, 'sizes', pr.sizes,
               'stage', pr.stage, 'front_image', pr.front_image, 'back_image', pr.back_image,
               'model_url', pr.model_url, 'release_note', pr.release_note)
             order by pr.sort_order, pr.created_at desc)
        from public.products pr where pr.is_visible), '[]'::jsonb),
    'preorders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'product_id', o.product_id, 'product', pr.name, 'size', o.size,
               'quantity', o.quantity, 'status', o.status, 'created_at', o.created_at)
             order by o.created_at desc)
        from public.preorders o join public.products pr on pr.id = o.product_id
       where o.ambassador_id = me.id), '[]'::jsonb),
    'sales', jsonb_build_object(
      'count', (select coalesce(sum(quantity), 0) from public.sales where ambassador_id = me.id),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object('item', s.item, 'quantity', s.quantity,
                                            'sold_on', s.sold_on) order by s.sold_on desc)
          from (select * from public.sales where ambassador_id = me.id
                order by sold_on desc, created_at desc limit 10) s), '[]'::jsonb))
  );
end $$;

create or replace function public.amb_task_done(p_code text, p_task uuid, p_done boolean,
                                                p_proof_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  if p_done then
    if not exists (select 1 from public.tasks where id = p_task and is_open) then
      raise exception 'task_closed';
    end if;
    insert into public.task_done (task_id, ambassador_id, proof_link)
    values (p_task, me.id, nullif(trim(p_proof_link), ''))
    on conflict (task_id, ambassador_id)
    do update set proof_link = excluded.proof_link, done_at = now();
  else
    delete from public.task_done where task_id = p_task and ambassador_id = me.id;
  end if;
end $$;

-- Apply to an event, or accept an admin's suggestion.
create or replace function public.amb_event_apply(p_code text, p_event uuid,
                                                  p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code); cur text;
begin
  select status into cur from public.event_people
   where event_id = p_event and ambassador_id = me.id;
  if cur in ('assigned','declined') then return cur; end if;
  if cur is null and not exists (select 1 from public.events where id = p_event and is_open) then
    raise exception 'event_closed';
  end if;
  insert into public.event_people (event_id, ambassador_id, status, message)
  values (p_event, me.id, 'applied', nullif(trim(p_message), ''))
  on conflict (event_id, ambassador_id)
  do update set status = 'applied',
                message = coalesce(excluded.message, public.event_people.message),
                updated_at = now();
  return 'applied';
end $$;

create or replace function public.amb_event_withdraw(p_code text, p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  delete from public.event_people
   where event_id = p_event and ambassador_id = me.id and status in ('applied','suggested');
end $$;

create or replace function public.amb_preorder(p_code text, p_product uuid, p_size text,
                                               p_quantity int default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code); new_id uuid;
begin
  if not exists (select 1 from public.products
                  where id = p_product and is_visible and stage = 'preorder') then
    raise exception 'not_preorderable';
  end if;
  insert into public.preorders (product_id, ambassador_id, size, quantity, note)
  values (p_product, me.id, nullif(trim(p_size), ''), greatest(1, least(coalesce(p_quantity, 1), 50)),
          nullif(trim(p_note), ''))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.amb_preorder_cancel(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  update public.preorders set status = 'cancelled'
   where id = p_id and ambassador_id = me.id and status = 'requested';
end $$;

-- Link a sale to the ambassador who owns the store code.
create or replace function public._sales_link_ambassador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.store_code := public._clean_code(new.store_code);
  select id into new.ambassador_id from public.ambassadors where store_code = new.store_code;
  return new;
end $$;
drop trigger if exists sales_link_ambassador on public.sales;
create trigger sales_link_ambassador before insert or update of store_code on public.sales
  for each row execute function public._sales_link_ambassador();

-- Who may call which function
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public._clean_code(text) to anon, authenticated;
grant execute on function public.admin_create_ambassador(text,text,text,text,text,text,text,text,int) to authenticated;
grant execute on function public.admin_new_access_code(uuid,int) to authenticated;
grant execute on function public.amb_home(text) to anon, authenticated;
grant execute on function public.amb_task_done(text,uuid,boolean,text) to anon, authenticated;
grant execute on function public.amb_event_apply(text,uuid,text) to anon, authenticated;
grant execute on function public.amb_event_withdraw(text,uuid) to anon, authenticated;
grant execute on function public.amb_preorder(text,uuid,text,int,text) to anon, authenticated;
grant execute on function public.amb_preorder_cancel(text,uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Photo storage for merch (admins upload, anyone with the link can view)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('merch', 'merch', true)
on conflict (id) do nothing;

drop policy if exists merch_admin_insert on storage.objects;
drop policy if exists merch_admin_update on storage.objects;
drop policy if exists merch_admin_delete on storage.objects;
create policy merch_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'merch' and public.is_admin());
create policy merch_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'merch' and public.is_admin());
create policy merch_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'merch' and public.is_admin());

-- Done.
select 'Birdboost portal database is ready' as result;
