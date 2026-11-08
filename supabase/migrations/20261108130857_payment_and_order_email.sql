begin;

alter table public.shop_settings
  add column cod_shipping_fee integer not null default 20000 check (cod_shipping_fee >= 0),
  add column bank_bin text check (bank_bin ~ '^[0-9]{6}$');

grant select (cod_shipping_fee) on public.shop_settings to anon, authenticated;

-- The supplied BIDV QR contains this NAPAS bank ID and transfer alias.
update public.shop_settings set bank_name = 'BIDV', bank_bin = '970418',
  bank_account = 'PHUONGPHUONGG', bank_holder = 'NGUYEN THI THU PHUONG'
where id = 1;

alter table public.orders add column bank_bin text;
alter table public.orders add column payment_ref text unique;

create sequence store_private.payment_ref_seq maxvalue 60466175;

create function store_private.next_payment_ref()
returns text
language plpgsql
set search_path = ''
as $$
declare
  n bigint := nextval('store_private.payment_ref_seq'::regclass);
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  ref text := '';
begin
  for digit in 1..5 loop
    ref := substr(alphabet, (n % 36)::integer + 1, 1) || ref;
    n := n / 36;
  end loop;
  return ref;
end;
$$;

-- Existing orders keep their original transfer instructions and shipping price.
alter table public.orders alter column payment_ref set default store_private.next_payment_ref();

create or replace function store_private.order_summary(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'payment_method', o.payment_method,
    'created_at', o.created_at, 'expires_at', o.expires_at,
    'payment_ref', o.payment_ref, 'subtotal', o.subtotal, 'shipping_fee', o.shipping_fee, 'total', o.total,
    'pay_now', o.pay_now, 'pay_on_delivery', o.total - o.pay_now,
    'bank', case when o.status = 'pending' and o.expires_at > now() then
      jsonb_build_object('name', o.bank_name, 'account', o.bank_account, 'holder', o.bank_holder, 'bin', o.bank_bin)
    end,
    'items', (select jsonb_agg(jsonb_build_object(
      'name', i.name, 'power', i.power, 'unit_price', i.unit_price, 'quantity', i.quantity
    ) order by i.name, i.power) from public.order_items i where i.order_id = o.id)
  )
  from public.orders o where o.id = p_id
$$;

create function store_private.payment_memo(p_phone text, p_ref text)
returns text
language sql immutable strict
set search_path = ''
as $$
  select (case when left(p_phone, 3) = '+84' then '0' || substr(p_phone, 4) else p_phone end)
    || ' THANHTOAN' || p_ref
$$;

-- A public lookup by order code must not return the buyer's phone number.
create function store_private.checkout_order_summary(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select store_private.order_summary(o.id) || jsonb_build_object(
    'payment_memo', case when o.status = 'pending' and o.expires_at > now() then
      store_private.payment_memo(o.phone, o.payment_ref)
    end)
  from public.orders o where o.id = p_id
$$;

create or replace function public.place_order(
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
  v_shipping integer;
  v_items jsonb := '[]'::jsonb;
  v_expected integer;
begin
  if p_request_id is null then
    raise exception 'Yêu cầu đặt hàng không hợp lệ.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id into v_id from public.orders where request_id = p_request_id;
  if found then
    return store_private.checkout_order_summary(v_id);
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

  v_shipping := case when p_payment_method = 'cod' then v_settings.cod_shipping_fee else v_settings.shipping_fee end;
  v_pay := v_subtotal + v_shipping;
  if p_payment_method = 'cod' then
    v_pay := least(v_pay, v_settings.cod_deposit);
  end if;
  insert into public.orders (request_id, customer_name, phone, address, payment_method, subtotal,
    shipping_fee, pay_now, bank_name, bank_account, bank_holder, bank_bin)
  values (p_request_id, p_customer_name, p_phone, p_address, p_payment_method, v_subtotal,
    v_shipping, v_pay, v_settings.bank_name, v_settings.bank_account, v_settings.bank_holder, v_settings.bank_bin)
  returning id into v_id;

  insert into public.order_items (order_id, variant_id, name, power, unit_price, quantity)
  select v_id, i.variant_id, i.name, i.power, i.unit_price, i.quantity
  from jsonb_to_recordset(v_items) as i(variant_id uuid, name text, power numeric, unit_price integer, quantity integer);
  return store_private.checkout_order_summary(v_id);
end;
$$;

create table store_private.order_email_jobs (
  order_id uuid primary key references public.orders(id),
  confirmation_token uuid not null unique default gen_random_uuid(),
  used_at timestamptz,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid
);
alter table store_private.order_email_jobs enable row level security;
create index order_email_ready on store_private.order_email_jobs (available_at, order_id)
  where sent_at is null and attempt_count < 12;

create function store_private.queue_order_email()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into store_private.order_email_jobs (order_id) values (new.id);
  return new;
end;
$$;

create trigger queue_order_email after insert on public.orders
  for each row execute function store_private.queue_order_email();

create function public.claim_order_email()
returns jsonb
language sql volatile security definer
set search_path = ''
as $$
  with next_job as (
    select j.order_id
    from store_private.order_email_jobs j
    join public.orders o on o.id = j.order_id
    where j.sent_at is null and j.attempt_count < 12 and j.available_at <= now()
      and o.expires_at > now() and o.status not in ('expired', 'cancelled')
    order by j.available_at, j.order_id
    limit 1 for update of j skip locked
  ), claimed as (
    update store_private.order_email_jobs j
    set attempt_count = j.attempt_count + 1, available_at = now() + interval '2 minutes',
      lease_id = gen_random_uuid()
    from next_job n where n.order_id = j.order_id
    returning j.order_id, j.confirmation_token, j.lease_id
  )
  select store_private.order_summary(o.id) - 'bank' || jsonb_build_object(
    'id', o.id, 'lease_id', c.lease_id, 'token', c.confirmation_token,
    'customer_name', o.customer_name, 'phone', o.phone, 'address', o.address,
    'payment_memo', store_private.payment_memo(o.phone, o.payment_ref)
  )
  from claimed c join public.orders o on o.id = c.order_id
$$;

create function public.finish_order_email(p_order_id uuid, p_lease_id uuid, p_sent boolean)
returns void
language sql volatile security definer
set search_path = ''
as $$
  update store_private.order_email_jobs
  set sent_at = case when p_sent then now() else null end, lease_id = null,
    available_at = now() + make_interval(mins => least(30, attempt_count))
  where order_id = p_order_id and lease_id = p_lease_id and sent_at is null
$$;

create function public.review_order_payment(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code, 'payment_ref', o.payment_ref, 'payment_method', o.payment_method, 'pay_now', o.pay_now,
    'status', case when o.status = 'pending' and o.expires_at <= now() then 'expired' else o.status end
  )
  from store_private.order_email_jobs j join public.orders o on o.id = j.order_id
  where j.confirmation_token = p_token
$$;

create function public.confirm_order_payment(p_token uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  job store_private.order_email_jobs%rowtype;
begin
  select * into job from store_private.order_email_jobs where confirmation_token = p_token for update;
  if not found then return null; end if;
  if job.used_at is null then
    update public.orders set status = 'confirmed'
    where id = job.order_id and status = 'pending' and expires_at > clock_timestamp();
    if found then
      update store_private.order_email_jobs set used_at = clock_timestamp()
      where order_id = job.order_id;
    end if;
  end if;
  return public.review_order_payment(p_token);
end;
$$;

revoke execute on function store_private.next_payment_ref(), store_private.payment_memo(text,text),
  store_private.checkout_order_summary(uuid), store_private.queue_order_email() from public, anon, authenticated;
revoke execute on function public.claim_order_email(),
  public.finish_order_email(uuid,uuid,boolean),
  public.review_order_payment(uuid), public.confirm_order_payment(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_order_email(), public.finish_order_email(uuid,uuid,boolean) to service_role;
grant execute on function public.review_order_payment(uuid), public.confirm_order_payment(uuid) to anon, authenticated;

commit;
