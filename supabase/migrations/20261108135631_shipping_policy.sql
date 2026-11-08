begin;

alter table public.shop_settings
  alter column shipping_fee set default 20000,
  alter column cod_shipping_fee set default 20000;

update public.shop_settings
set shipping_fee = 20000, cod_shipping_fee = 20000
where id = 1;

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
  v_lens_pairs integer := 0;
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
    select v.id, v.power, v.stock, p.name, p.price, p.category, c.quantity
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
    if v_line.category <> 'accessories' then
      v_lens_pairs := v_lens_pairs + v_line.quantity;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'variant_id', v_line.id, 'name', v_line.name, 'power', v_line.power,
      'unit_price', v_line.price, 'quantity', v_line.quantity
    ));
    update public.product_variants set stock = stock - v_line.quantity where id = v_line.id;
  end loop;
  if jsonb_array_length(v_items) <> v_expected then
    raise exception 'Một sản phẩm trong giỏ không còn được bán.';
  end if;

  -- Keep the threshold in sync with dist/shared/shipping.js.
  v_shipping := case
    when v_lens_pairs >= 3 then 0
    when p_payment_method = 'cod' then v_settings.cod_shipping_fee
    else v_settings.shipping_fee
  end;
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

commit;
