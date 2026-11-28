-- =====================================================================
--  BIRDBOOST  ·  update 5: the community, campaigns and ambassador world
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It's safe to run again. Run updates 1 to 4 first if you haven't.
--
--  What it adds:
--   * Seen in the Flock: anyone can send a photo of themselves in
--     Birdboost (or a link to their post). Nothing appears on the website
--     until you approve it in the admin page under "Content".
--   * Ambassadors can upload content, link it to a campaign, an event and
--     the piece they're wearing, and build a public profile (only if they
--     switch "Show my profile" on).
--   * Campaigns you can assign to ambassadors.
--   * Ambassador applications are saved here as well as emailed, so you
--     can approve or decline them in the admin page.
--   * Events can be made public, with a cover photo and a recap.
--   * Pieces get fit, measurements, material, care and styling notes,
--     which power "Find my size" on the website.
--   * A record of the pieces each ambassador has received.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ambassador profile
-- ---------------------------------------------------------------------
alter table public.ambassadors add column if not exists photo_url     text;
alter table public.ambassadors add column if not exists bio           text;
alter table public.ambassadors add column if not exists style         text;      -- e.g. "Streetwear, worship nights, film photography"
alter table public.ambassadors add column if not exists show_publicly boolean not null default false;

-- ---------------------------------------------------------------------
-- Pieces: fit and care (also used by "Find my size")
-- size_chart is in centimetres, measured flat:
--   {"S": {"chest": 51, "length": 70}, "M": {"chest": 54, "length": 72}}
-- ---------------------------------------------------------------------
alter table public.products add column if not exists fit        text;   -- regular, relaxed or oversized
alter table public.products add column if not exists size_chart jsonb;
alter table public.products add column if not exists material   text;
alter table public.products add column if not exists care       text;
alter table public.products add column if not exists styling    text;
alter table public.products add column if not exists slug       text;   -- short name used in links, e.g. righteous-green

-- ---------------------------------------------------------------------
-- Events: public pages and recaps
-- ---------------------------------------------------------------------
alter table public.events add column if not exists is_public   boolean not null default false;
alter table public.events add column if not exists cover_image text;
alter table public.events add column if not exists recap       text;
alter table public.events add column if not exists featured    text;   -- pieces featured, e.g. "Righteous Tee"

-- ---------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  brief       text,
  hashtag     text,
  cover_image text,
  starts_on   date,
  ends_on     date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.campaign_people (
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  status        text not null default 'assigned' check (status in ('assigned','done')),
  updated_at    timestamptz not null default now(),
  primary key (campaign_id, ambassador_id)
);

-- ---------------------------------------------------------------------
-- Content: ambassador submissions and community photos, one list.
-- status: pending (waiting for you), approved (shown on the website),
--         featured (shown first), private (kept, not shown), rejected
-- ---------------------------------------------------------------------
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid references public.ambassadors(id) on delete set null,
  name          text,                 -- for community posts: the name or @handle to credit
  contact       text,                 -- for community posts: how to reach them (never shown)
  kind          text not null default 'photo' check (kind in ('photo','video','link')),
  media_url     text,
  link          text,                 -- their Instagram or TikTok post
  caption       text,
  hashtags      text,
  place         text,                 -- where it was taken
  product_ref   text,                 -- the piece they're wearing (shop id or name)
  campaign_id   uuid references public.campaigns(id) on delete set null,
  event_id      uuid references public.events(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','approved','featured','private','rejected')),
  consent       boolean not null default false,
  ip            text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists submissions_status on public.submissions (status, created_at desc);

-- ---------------------------------------------------------------------
-- Applications (also still emailed through Formspree)
-- ---------------------------------------------------------------------
create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  age         text,
  city        text,
  phone       text,
  email       text,
  handles     text,
  answers     jsonb,                  -- everything else from the form, as sent
  source      text,
  status      text not null default 'new' check (status in ('new','shortlisted','approved','declined')),
  ambassador_id uuid references public.ambassadors(id) on delete set null,
  ip          text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pieces each ambassador has received
-- ---------------------------------------------------------------------
create table if not exists public.received (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  item          text not null,
  size          text,
  received_on   date not null default current_date,
  note          text,
  created_at    timestamptz not null default now()
);

-- Admin-only access to the new tables
do $$
declare t text;
begin
  foreach t in array array['campaigns','campaign_people','submissions','applications','received']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

insert into public.settings (key, value) values ('perks', null), ('community_hashtag', '#SeenInTheFlock')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Uploads: photos and short videos from ambassadors and the community.
-- Anyone can upload into "incoming" (max 25 MB, photos and videos only),
-- under a random name. Files are only shown once you approve the post.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 26214400,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_anyone_upload on storage.objects;
create policy community_anyone_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = 'incoming');
drop policy if exists community_admin_manage on storage.objects;
create policy community_admin_manage on storage.objects for all to authenticated
  using (bucket_id = 'community' and public.is_admin()) with check (bucket_id = 'community' and public.is_admin());

-- small helpers
create or replace function public._url(u text) returns text
language sql immutable as $$ select case when u ~* '^https://[^\s<>"]+$' then left(u, 600) end $$;
create or replace function public._txt(t text, n int) returns text
language sql immutable as $$ select nullif(left(trim(coalesce(t, '')), n), '') $$;

-- ---------------------------------------------------------------------
-- PUBLIC: what the website can show
-- ---------------------------------------------------------------------
-- Approved community moments, newest first, featured on top.
create or replace function public.community_feed(p_limit int default 40, p_product text default null, p_event uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.x order by t.feat desc, t.at desc), '[]'::jsonb) from (
    select s.status = 'featured' as feat, s.created_at as at, jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'media_url', s.media_url, 'link', s.link, 'caption', s.caption,
      'place', s.place, 'product_ref', s.product_ref, 'featured', s.status = 'featured', 'created_at', s.created_at,
      'by', coalesce(case when a.show_publicly then split_part(a.full_name, ' ', 1) end, s.name),
      'handle', case when a.show_publicly then a.instagram end,
      'ambassador', a.id is not null and a.show_publicly,
      'ambassador_id', case when a.show_publicly then a.id end,
      'event', e.title, 'event_id', case when e.is_public then e.id end) as x
    from public.submissions s
    left join public.ambassadors a on a.id = s.ambassador_id
    left join public.events e on e.id = s.event_id
    where s.status in ('approved','featured') and (s.media_url is not null)
      and (p_product is null or lower(s.product_ref) = lower(p_product))
      and (p_event is null or s.event_id = p_event)
    order by (s.status = 'featured') desc, s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 40), 120))
  ) t;
$$;

-- Public events, upcoming and past, with their recap photos.
create or replace function public.public_events() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'brief', e.brief, 'location', e.location,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'cover_image', e.cover_image,
    'recap', e.recap, 'featured', e.featured,
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', split_part(a.full_name, ' ', 1), 'photo', a.photo_url)), '[]'::jsonb)
               from public.event_people p join public.ambassadors a on a.id = p.ambassador_id
              where p.event_id = e.id and p.status = 'assigned' and a.show_publicly and a.is_active),
    'photos', (select count(*) from public.submissions s where s.event_id = e.id and s.status in ('approved','featured')))
    order by e.starts_at desc nulls last), '[]'::jsonb)
  from public.events e where e.is_public;
$$;

-- Ambassadors who chose to show their profile.
create or replace function public.public_ambassadors() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', split_part(a.full_name, ' ', 1), 'city', a.city, 'photo', a.photo_url,
    'bio', a.bio, 'style', a.style, 'instagram', a.instagram, 'tiktok', a.tiktok, 'since', a.created_at,
    'fits', (select coalesce(jsonb_agg(distinct s.product_ref), '[]'::jsonb) from public.submissions s
              where s.ambassador_id = a.id and s.status in ('approved','featured') and s.product_ref is not null),
    'posts', (select count(*) from public.submissions s where s.ambassador_id = a.id and s.status in ('approved','featured')),
    'events', (select count(*) from public.event_people p where p.ambassador_id = a.id and p.status = 'assigned'))
    order by a.created_at), '[]'::jsonb)
  from public.ambassadors a where a.show_publicly and a.is_active;
$$;

-- Anyone: send a photo or a link to a post. It waits for approval.
create or replace function public.community_submit(p_name text, p_contact text, p_media_url text, p_link text,
  p_caption text, p_place text, p_product text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := public._client_ip(); v_media text := public._url(p_media_url); v_link text := public._url(p_link);
begin
  if not coalesce(p_consent, false) then return jsonb_build_object('error', 'consent'); end if;
  if v_media is null and v_link is null then return jsonb_build_object('error', 'nothing_sent'); end if;
  if v_media is not null and v_media !~ '/storage/v1/object/public/community/incoming/' then return jsonb_build_object('error', 'bad_media'); end if;
  if (select count(*) from public.submissions where ip = v_ip and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into public.submissions (name, contact, kind, media_url, link, caption, place, product_ref, consent, ip)
  values (public._txt(p_name, 60), public._txt(p_contact, 120),
          case when v_media ~* '\.(mp4|mov|webm)$' then 'video' when v_media is null then 'link' else 'photo' end,
          v_media, v_link, public._txt(p_caption, 400), public._txt(p_place, 80), public._txt(p_product, 80), true, v_ip);
  return jsonb_build_object('ok', true);
end $$;

-- Anyone: an ambassador application (the form still emails it too).
create or replace function public.public_apply(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := public._client_ip();
begin
  if coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('error', 'missing_name'); end if;
  if (select count(*) from public.applications where ip = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into public.applications (full_name, age, city, phone, email, handles, answers, source, ip)
  values (left(trim(p->>'name'), 120), public._txt(p->>'age', 20), public._txt(p->>'city', 80),
          public._txt(p->>'whatsapp', 40), public._txt(p->>'email', 160), public._txt(p->>'handles', 300),
          p - 'name' - 'age' - 'city' - 'whatsapp' - 'email' - 'handles', public._txt(p->>'source', 120), v_ip);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- AMBASSADORS (with their access code)
-- ---------------------------------------------------------------------
-- Everything for the ambassador's own world: profile, journey, campaigns,
-- content, pieces received. amb_home still gives tasks, events and sales.
create or replace function public.amb_world(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', me.id, 'name', me.full_name, 'city', me.city, 'photo', me.photo_url, 'bio', me.bio,
      'style', me.style, 'instagram', me.instagram, 'tiktok', me.tiktok, 'show_publicly', me.show_publicly, 'since', me.created_at),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'brief', c.brief, 'hashtag', c.hashtag,
        'cover_image', c.cover_image, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'is_active', c.is_active, 'my_status', cp.status,
        'my_posts', (select count(*) from public.submissions s where s.campaign_id = c.id and s.ambassador_id = me.id))
        order by c.is_active desc, c.starts_on desc nulls last)
      from public.campaigns c left join public.campaign_people cp on cp.campaign_id = c.id and cp.ambassador_id = me.id
      where cp.ambassador_id is not null or c.is_active), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'media_url', s.media_url, 'link', s.link,
        'caption', s.caption, 'product_ref', s.product_ref, 'campaign_id', s.campaign_id, 'event_id', s.event_id,
        'status', s.status, 'created_at', s.created_at) order by s.created_at desc)
      from public.submissions s where s.ambassador_id = me.id), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('item', r.item, 'size', r.size, 'received_on', r.received_on) order by r.received_on desc)
      from public.received r where r.ambassador_id = me.id), '[]'::jsonb),
    'facts', jsonb_build_object(
      'events_done', (select count(*) from public.event_people p join public.events e on e.id = p.event_id
                       where p.ambassador_id = me.id and p.status = 'assigned' and coalesce(e.ends_at, e.starts_at) < now()),
      'events_assigned', (select count(*) from public.event_people p where p.ambassador_id = me.id and p.status = 'assigned'),
      'campaigns_joined', (select count(*) from public.campaign_people where ambassador_id = me.id),
      'campaigns_done', (select count(*) from public.campaign_people where ambassador_id = me.id and status = 'done'),
      'posts', (select count(*) from public.submissions where ambassador_id = me.id),
      'posts_live', (select count(*) from public.submissions where ambassador_id = me.id and status in ('approved','featured')),
      'pieces_sold', (select coalesce(sum(quantity), 0) from public.sales where ambassador_id = me.id)));
end $$;

create or replace function public.amb_profile_save(p_code text, p_bio text, p_style text, p_instagram text, p_tiktok text,
  p_photo_url text, p_show boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code); v_photo text := public._url(p_photo_url);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  if v_photo is not null and v_photo !~ '/storage/v1/object/public/community/incoming/' and v_photo is distinct from me.photo_url then
    return jsonb_build_object('error', 'bad_media');
  end if;
  update public.ambassadors set bio = public._txt(p_bio, 400), style = public._txt(p_style, 160),
    instagram = public._txt(p_instagram, 60), tiktok = public._txt(p_tiktok, 60),
    photo_url = coalesce(v_photo, case when p_photo_url = '' then null else photo_url end),
    show_publicly = coalesce(p_show, false)
   where id = me.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.amb_submit(p_code text, p_media_url text, p_link text, p_caption text, p_hashtags text,
  p_product text, p_campaign uuid, p_event uuid, p_place text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code); v_media text := public._url(p_media_url); v_link text := public._url(p_link);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  if v_media is null and v_link is null then return jsonb_build_object('error', 'nothing_sent'); end if;
  if v_media is not null and v_media !~ '/storage/v1/object/public/community/incoming/' then return jsonb_build_object('error', 'bad_media'); end if;
  if (select count(*) from public.submissions where ambassador_id = me.id and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into public.submissions (ambassador_id, kind, media_url, link, caption, hashtags, product_ref, campaign_id, event_id, place, consent)
  values (me.id, case when v_media ~* '\.(mp4|mov|webm)$' then 'video' when v_media is null then 'link' else 'photo' end,
          v_media, v_link, public._txt(p_caption, 600), public._txt(p_hashtags, 200), public._txt(p_product, 80),
          (select id from public.campaigns where id = p_campaign), (select id from public.events where id = p_event),
          public._txt(p_place, 80), true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.amb_submission_delete(p_code text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  delete from public.submissions where id = p_id and ambassador_id = me.id and status = 'pending';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.amb_campaign_done(p_code text, p_campaign uuid, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  if not exists (select 1 from public.campaigns where id = p_campaign) then return jsonb_build_object('error', 'not_found'); end if;
  insert into public.campaign_people (campaign_id, ambassador_id, status) values (p_campaign, me.id, case when p_done then 'done' else 'assigned' end)
  on conflict (campaign_id, ambassador_id) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Pieces on sale: the extra fit and care fields too.
create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', coalesce(p.slug, p.id::text), 'uuid', p.id, 'name', p.name, 'description', p.description,
           'price', p.price, 'currency', p.currency, 'sizes', p.sizes,
           'category', p.category, 'color', p.color, 'swatch', p.swatch,
           'stage', p.stage, 'release_note', p.release_note,
           'front_image', p.front_image, 'back_image', p.back_image, 'model_url', p.model_url,
           'fit', p.fit, 'size_chart', p.size_chart, 'material', p.material, 'care', p.care, 'styling', p.styling)
         order by p.sort_order, p.created_at desc), '[]'::jsonb)
    from public.products p
   where p.in_shop;
$$;

-- Who may call what
revoke execute on function public.community_feed(int,text,uuid) from public;
revoke execute on function public.public_events() from public;
revoke execute on function public.public_ambassadors() from public;
revoke execute on function public.community_submit(text,text,text,text,text,text,text,boolean) from public;
revoke execute on function public.public_apply(jsonb) from public;
revoke execute on function public.amb_world(text) from public;
revoke execute on function public.amb_profile_save(text,text,text,text,text,text,boolean) from public;
revoke execute on function public.amb_submit(text,text,text,text,text,text,uuid,uuid,text) from public;
revoke execute on function public.amb_submission_delete(text,uuid) from public;
revoke execute on function public.amb_campaign_done(text,uuid,boolean) from public;
grant execute on function public.community_feed(int,text,uuid) to anon, authenticated;
grant execute on function public.public_events() to anon, authenticated;
grant execute on function public.public_ambassadors() to anon, authenticated;
grant execute on function public.community_submit(text,text,text,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.public_apply(jsonb) to anon, authenticated;
grant execute on function public.amb_world(text) to anon, authenticated;
grant execute on function public.amb_profile_save(text,text,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.amb_submit(text,text,text,text,text,text,uuid,uuid,text) to anon, authenticated;
grant execute on function public.amb_submission_delete(text,uuid) to anon, authenticated;
grant execute on function public.amb_campaign_done(text,uuid,boolean) to anon, authenticated;
grant execute on function public.shop_catalog() to anon, authenticated;

select 'Community, campaigns and ambassador profiles are ready' as result;
