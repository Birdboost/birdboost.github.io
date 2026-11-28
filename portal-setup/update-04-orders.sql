-- =====================================================================
--  BIRDBOOST  ·  update 4: orders straight from the website
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It's safe to run again, and it already contains everything from
--  update 3, so you can run this one instead of update 3.
--  Run updates 1 and 2 first if you haven't.
--
--  What it does:
--   * Customers place their order on the website. It's saved here and you
--     see it in the admin page under "Shop orders", with their phone
--     number, so you can contact them to confirm delivery and payment.
--   * It works with the pieces built into the website (the Righteous tees)
--     as well as pieces you put on sale from the admin page.
--   * Saves the customer's area or address for delivery.
--   * Pieces can be put on sale in the Nest from the admin page, with a
--     category and a colour. Optional discount % for ambassador codes, and
--     a commission per piece that ambassadors see on their dashboard.
--
--  What it does NOT do: take payments. Orders are requests. You confirm
--  stock, delivery and payment with the customer yourself.
-- =====================================================================

alter table public.products add column if not exists in_shop  boolean not null default false;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists color    text;
alter table public.products add column if not exists swatch   text;   -- e.g. #1f6b2a, the colour dot in the shop

create table if not exists public.shop_orders (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  name           text not null,
  phone          text not null,
  email          text,
  city           text,
  delivery       text,
  note           text,
  items          jsonb not null,               -- [{product_id, name, color, size, qty, price}]
  currency       text not null default 'USD',
  subtotal       numeric(10,2),                -- empty when a piece had no price yet
  discount_pct   numeric(5,2),
  total          numeric(10,2),
  store_code     text,
  ambassador_id  uuid references public.ambassadors(id) on delete set null,
  status         text not null default 'new'
                 check (status in ('new','confirmed','paid','sent','cancelled')),
  address        text,
  ip             text,
  created_at     timestamptz not null default now()
);

alter table public.shop_orders add column if not exists address text;

alter table public.shop_orders enable row level security;
drop policy if exists admin_all on public.shop_orders;
create policy admin_all on public.shop_orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.shop_orders from anon;
grant select, insert, update, delete on public.shop_orders to authenticated;

insert into public.settings (key, value) values
  ('shop_discount_percent', null),
  ('commission_per_piece', null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- What the public shop can see: only pieces marked "Sell in the Nest".
-- ---------------------------------------------------------------------
create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'description', p.description,
           'price', p.price, 'currency', p.currency, 'sizes', p.sizes,
           'category', p.category, 'color', p.color, 'swatch', p.swatch,
           'stage', p.stage, 'release_note', p.release_note,
           'front_image', p.front_image, 'back_image', p.back_image, 'model_url', p.model_url)
         order by p.sort_order, p.created_at desc), '[]'::jsonb)
    from public.products p
   where p.in_shop;
$$;

-- ---------------------------------------------------------------------
-- Checking an ambassador's store code at checkout. Shows only the first
-- name, so the customer knows whose code it is.
-- ---------------------------------------------------------------------
create or replace function public.shop_check_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.ambassadors; pct numeric;
begin
  select * into a from public.ambassadors
   where store_code = public._clean_code(p_code) and is_active;
  if not found then return jsonb_build_object('ok', false); end if;
  select nullif(trim(value), '')::numeric into pct from public.settings where key = 'shop_discount_percent';
  return jsonb_build_object('ok', true, 'name', split_part(a.full_name, ' ', 1), 'percent', pct);
exception when others then
  return jsonb_build_object('ok', true, 'name', split_part(a.full_name, ' ', 1));
end $$;

-- ---------------------------------------------------------------------
-- Saving a customer's order. For pieces you sell from the admin page the
-- price always comes from the database, never from the customer's browser.
-- Pieces built into the website (no product id) are saved as the website
-- showed them, marked "website", and you confirm the price with the
-- customer as usual.
-- ---------------------------------------------------------------------
drop function if exists public.shop_order(text,text,text,text,text,text,text,jsonb);
create or replace function public.shop_order(
  p_name text, p_phone text, p_email text, p_city text, p_delivery text,
  p_note text, p_code text, p_items jsonb, p_address text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public._client_ip();
  it jsonb; p public.products; q int; lines jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_priced boolean := true; v_cur text := null; v_price numeric;
  a public.ambassadors; v_pct numeric; v_ref text; v_code text;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    return jsonb_build_object('error', 'missing_details');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('error', 'bad_items');
  end if;
  -- a simple brake on spam: 15 orders an hour from one connection
  if (select count(*) from public.shop_orders where ip = v_ip and created_at > now() - interval '1 hour') >= 15 then
    return jsonb_build_object('error', 'too_many_orders');
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := greatest(1, least(coalesce((it->>'qty')::int, 1), 10));
    if coalesce(it->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into p from public.products where id = (it->>'product_id')::uuid and in_shop;
      if not found then return jsonb_build_object('error', 'not_in_shop'); end if;
      if p.price is null then v_priced := false; else v_sub := v_sub + p.price * q; end if;
      v_cur := coalesce(v_cur, p.currency);
      lines := lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'color', p.color,
                                           'size', nullif(left(trim(it->>'size'), 10), ''), 'qty', q, 'price', p.price);
    else
      -- a piece from the website's built-in list
      if coalesce(trim(it->>'name'), '') = '' then return jsonb_build_object('error', 'bad_items'); end if;
      begin v_price := (it->>'price')::numeric; exception when others then v_price := null; end;
      if v_price is not null and (v_price < 0 or v_price > 10000) then v_price := null; end if;
      if v_price is null then v_priced := false; else v_sub := v_sub + v_price * q; end if;
      v_cur := coalesce(v_cur, nullif(left(upper(trim(it->>'currency')), 3), ''));
      lines := lines || jsonb_build_object('item', left(trim(it->>'item'), 60), 'name', left(trim(it->>'name'), 80),
                                           'color', nullif(left(trim(it->>'color'), 40), ''),
                                           'size', nullif(left(trim(it->>'size'), 10), ''), 'qty', q, 'price', v_price,
                                           'source', 'website');
    end if;
  end loop;

  v_code := nullif(public._clean_code(p_code), '');
  if v_code is not null then
    select * into a from public.ambassadors where store_code = v_code and is_active;
    if found then
      begin
        select nullif(trim(value), '')::numeric into v_pct from public.settings where key = 'shop_discount_percent';
      exception when others then v_pct := null; end;
    end if;
  end if;

  loop
    v_ref := 'BB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from public.shop_orders where ref = v_ref);
  end loop;

  insert into public.shop_orders (ref, name, phone, email, city, delivery, address, note, items, currency,
                                  subtotal, discount_pct, total, store_code, ambassador_id, ip)
  values (v_ref, left(trim(p_name), 120), left(trim(p_phone), 40), nullif(left(trim(p_email), 160), ''),
          nullif(left(trim(p_city), 80), ''), nullif(left(trim(p_delivery), 40), ''), nullif(left(trim(p_address), 300), ''),
          nullif(left(trim(p_note), 600), ''),
          lines, coalesce(v_cur, 'USD'),
          case when v_priced then v_sub end, v_pct,
          case when v_priced then round(v_sub * (1 - coalesce(v_pct, 0) / 100), 2) end,
          v_code, a.id, v_ip);

  return jsonb_build_object('ok', true, 'ref', v_ref,
    'subtotal', case when v_priced then v_sub end, 'discount_pct', v_pct,
    'total', case when v_priced then round(v_sub * (1 - coalesce(v_pct, 0) / 100), 2) end);
end $$;

-- ---------------------------------------------------------------------
-- For the ambassador dashboard: orders that came in with your code.
-- ---------------------------------------------------------------------
create or replace function public.amb_flock(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.ambassadors := public._amb(p_code);
begin
  if me.id is null then return jsonb_build_object('error', me.full_name); end if;
  return jsonb_build_object(
    'orders', (select count(*) from public.shop_orders where ambassador_id = me.id and status <> 'cancelled'),
    'order_pieces', (select coalesce(sum((i->>'qty')::int), 0) from public.shop_orders o, jsonb_array_elements(o.items) i
                      where o.ambassador_id = me.id and o.status <> 'cancelled'));
end $$;

-- Who may call what
revoke execute on function public.shop_catalog() from public;
revoke execute on function public.shop_check_code(text) from public;
revoke execute on function public.shop_order(text,text,text,text,text,text,text,jsonb,text) from public;
revoke execute on function public.amb_flock(text) from public;
grant execute on function public.shop_catalog() to anon, authenticated;
grant execute on function public.shop_check_code(text) to anon, authenticated;
grant execute on function public.shop_order(text,text,text,text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.amb_flock(text) to anon, authenticated;
