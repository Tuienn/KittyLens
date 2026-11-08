begin;

create schema if not exists store_private;

create table public.shop_settings (
  id integer primary key default 1 check (id = 1),
  brand text not null default 'Lens Studio',
  banners text[] not null default '{}',
  instagram_url text,
  threads_url text,
  contact_email text,
  shipping_fee integer not null default 13000 check (shipping_fee >= 0),
  cod_deposit integer not null default 20000 check (cod_deposit >= 0),
  bank_name text,
  bank_account text,
  bank_holder text,
  accepting_orders boolean not null default false
);
insert into public.shop_settings default values;

create table public.products (
  slug text primary key check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug not in (
      'main', 'trang-chu', 'cua-hang', 'da-dat', 'gio-hang', 'thanh-toan',
      'xac-nhan', 'doi-tra', 'giao-hang', 'lien-he'
    )
  ),
  name text not null,
  category text not null check (category in ('monthly', 'daily', 'accessories')),
  price integer not null check (price > 0),
  description text not null default '',
  images text[] not null default '{}',
  diameter numeric,
  colored_diameter numeric,
  base_curve numeric,
  water_content numeric,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null references public.products(slug),
  power numeric(3,1) check (power >= 0 and power <= 8),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  unique nulls not distinct (product_slug, power)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  code text not null unique default ('LS-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  customer_name text not null,
  phone text not null,
  address text not null,
  payment_method text not null check (payment_method in ('transfer', 'cod')),
  status text not null default 'pending' check (status in ('pending','confirmed','shipping','completed','expired','cancelled')),
  subtotal bigint not null,
  shipping_fee integer not null,
  total bigint generated always as (subtotal + shipping_fee) stored,
  pay_now bigint not null check (pay_now >= 0 and pay_now <= subtotal + shipping_fee),
  bank_name text not null,
  bank_account text not null,
  bank_holder text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);
create index orders_pending_expiry on public.orders (expires_at) where status = 'pending';

create table public.order_items (
  order_id uuid not null references public.orders(id),
  variant_id uuid not null references public.product_variants(id),
  name text not null,
  power numeric(3,1),
  unit_price integer not null,
  quantity integer not null check (quantity between 1 and 99),
  primary key (order_id, variant_id)
);

alter table public.shop_settings enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.shop_settings, public.products, public.product_variants,
  public.orders, public.order_items from public, anon, authenticated;
grant select (id, brand, banners, instagram_url, threads_url, contact_email, shipping_fee,
  cod_deposit, accepting_orders) on public.shop_settings to anon, authenticated;
grant select on public.products, public.product_variants to anon, authenticated;

create policy read_shop_settings on public.shop_settings for select to anon, authenticated using (id = 1);
create policy read_catalog on public.products for select to anon, authenticated using (active);
create policy read_catalog_variants on public.product_variants for select to anon, authenticated
  using (active and exists (
    select 1 from public.products p where p.slug = product_slug and p.active
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;

create function store_private.order_summary(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'payment_method', o.payment_method,
    'created_at', o.created_at, 'expires_at', o.expires_at,
    'subtotal', o.subtotal, 'shipping_fee', o.shipping_fee, 'total', o.total,
    'pay_now', o.pay_now, 'pay_on_delivery', o.total - o.pay_now,
    'bank', case when o.status = 'pending' and o.expires_at > now() then
      jsonb_build_object('name', o.bank_name, 'account', o.bank_account, 'holder', o.bank_holder)
    end,
    'items', (select jsonb_agg(jsonb_build_object(
      'name', i.name, 'power', i.power, 'unit_price', i.unit_price, 'quantity', i.quantity
    ) order by i.name, i.power) from public.order_items i where i.order_id = o.id)
  )
  from public.orders o where o.id = p_id
$$;

create function public.lookup_order(p_code text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select store_private.order_summary(o.id)
  from public.orders o
  where o.code = upper(trim(p_code)) and length(trim(p_code)) = 35
$$;

create function public.place_order(
  p_request_id uuid, p_customer_name text, p_phone text, p_address text,
  p_payment_method text, p_items jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_settings public.shop_settings%rowtype;
  v_line record;
  v_subtotal bigint := 0;
  v_pay bigint;
  v_items jsonb := '[]'::jsonb;
  v_expected integer;
begin
  if p_request_id is null then
    raise exception 'Yêu cầu đặt hàng không hợp lệ.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id into v_id from public.orders where request_id = p_request_id;
  if found then
    return store_private.order_summary(v_id);
  end if;

  p_customer_name := trim(coalesce(p_customer_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '[[:space:].()-]', '', 'g');
  p_address := trim(coalesce(p_address, ''));
  if length(p_customer_name) not between 2 and 100
    or p_phone !~ '^(0[0-9]{9}|[+]84[0-9]{9})$'
    or length(p_address) not between 8 and 400
    or p_payment_method is null or p_payment_method not in ('transfer', 'cod') then
    raise exception 'Kiểm tra lại họ tên, số điện thoại, địa chỉ và cách thanh toán.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Giỏ hàng không hợp lệ.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 or exists (
    select 1 from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(value) <> 'object'
      or coalesce(value->>'variant_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(value->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) then
    raise exception 'Giỏ hàng không hợp lệ.';
  end if;

  select * into v_settings from public.shop_settings where id = 1;
  if not found or not v_settings.accepting_orders
    or nullif(trim(v_settings.bank_name), '') is null
    or nullif(trim(v_settings.bank_account), '') is null
    or nullif(trim(v_settings.bank_holder), '') is null then
    raise exception 'Cửa hàng hiện chưa nhận đơn. Vui lòng quay lại sau.';
  end if;

  select count(distinct (value->>'variant_id')::uuid) into v_expected
    from jsonb_array_elements(p_items) as item(value);

  -- Lock variants in a consistent order so independent checkouts can run concurrently.
  for v_line in
    with cart as (
      select (value->>'variant_id')::uuid as id, sum((value->>'quantity')::int)::int as quantity
      from jsonb_array_elements(p_items) as item(value) group by 1
    )
    select v.id, v.power, v.stock, p.name, p.price, c.quantity
    from cart c
    join public.product_variants v on v.id = c.id
    join public.products p on p.slug = v.product_slug
    where p.active and v.active and ((p.category = 'accessories') = (v.power is null))
    order by v.id for update of v
  loop
    if v_line.quantity > 99 or v_line.quantity > v_line.stock then
      raise exception 'Không đủ tồn kho cho %. Vui lòng cập nhật giỏ hàng.', v_line.name;
    end if;
    v_subtotal := v_subtotal + v_line.price::bigint * v_line.quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'variant_id', v_line.id, 'name', v_line.name, 'power', v_line.power,
      'unit_price', v_line.price, 'quantity', v_line.quantity
    ));
    update public.product_variants set stock = stock - v_line.quantity where id = v_line.id;
  end loop;
  if jsonb_array_length(v_items) <> v_expected then
    raise exception 'Một sản phẩm trong giỏ không còn được bán.';
  end if;

  v_pay := v_subtotal + v_settings.shipping_fee;
  if p_payment_method = 'cod' then
    v_pay := least(v_pay, v_settings.cod_deposit);
  end if;
  insert into public.orders (request_id, customer_name, phone, address, payment_method, subtotal,
    shipping_fee, pay_now, bank_name, bank_account, bank_holder)
  values (p_request_id, p_customer_name, p_phone, p_address, p_payment_method, v_subtotal,
    v_settings.shipping_fee, v_pay, v_settings.bank_name, v_settings.bank_account, v_settings.bank_holder)
  returning id into v_id;

  insert into public.order_items (order_id, variant_id, name, power, unit_price, quantity)
  select v_id, i.variant_id, i.name, i.power, i.unit_price, i.quantity
  from jsonb_to_recordset(v_items) as i(variant_id uuid, name text, power numeric, unit_price integer, quantity integer);
  return store_private.order_summary(v_id);
end;
$$;

create function store_private.apply_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'pending' and new.status = 'confirmed' and old.expires_at > clock_timestamp())
    or (old.status = 'pending' and new.status = 'expired' and old.expires_at <= clock_timestamp())
    or (old.status in ('pending', 'confirmed') and new.status = 'cancelled')
    or (old.status = 'confirmed' and new.status = 'shipping')
    or (old.status = 'shipping' and new.status = 'completed')
  ) then
    raise exception 'Không thể chuyển trạng thái từ % sang %.', old.status, new.status;
  end if;

  if new.status in ('expired', 'cancelled') then
    for v_item in select variant_id, quantity from public.order_items
      where order_id = old.id order by variant_id
    loop
      update public.product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger order_status_transition before update of status on public.orders
  for each row execute function store_private.apply_order_transition();

create function store_private.expire_orders()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Lock affected variants in the same order as checkout before releasing multiple orders.
  with expired as materialized (
    select id from public.orders where status = 'pending' and expires_at <= now()
    order by expires_at, id limit 200 for update skip locked
  ), locked_variants as materialized (
    select v.id from public.product_variants v
    where exists (select 1 from public.order_items i join expired e on e.id = i.order_id
      where i.variant_id = v.id)
    order by v.id for update
  )
  update public.orders set status = 'expired'
  where id in (select id from expired)
    and (select count(*) from locked_variants) >= 0;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on schema store_private from public, anon, authenticated;
revoke execute on all functions in schema store_private from public, anon, authenticated;
revoke execute on function public.lookup_order(text),
  public.place_order(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.lookup_order(text),
  public.place_order(uuid,text,text,text,text,jsonb) to anon, authenticated;

commit;
