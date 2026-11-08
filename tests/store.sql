-- Chạy sau migration schema và seed, trong database thử nghiệm.
begin;

update public.shop_settings set accepting_orders = true, bank_name = 'Test Bank',
  bank_account = '0000000000', bank_holder = 'TEST ONLY';

set local role anon;
select slug from public.products limit 1;
select shipping_fee from public.shop_settings where id = 1;
do $$
begin
  begin
    perform id from public.orders;
    raise exception 'Anonymous direct order read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform bank_account from public.shop_settings;
    raise exception 'Anonymous direct bank details read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  request_one uuid := gen_random_uuid();
  request_two uuid := gen_random_uuid();
  items jsonb := '[{"variant_id":"00000000-0000-0000-0000-000000000001","quantity":1,"unit_price":1}]';
  cod jsonb;
  transfer jsonb;
  cached jsonb;
begin
  cod := public.place_order(request_one, 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', 'cod', items);
  cached := public.place_order(request_one, '', '', '', 'transfer', '[]');
  assert cod is not null and cod = cached;
  assert (cod->>'total')::int = 102000 and (cod->>'pay_now')::int = 20000;
  assert (cod->>'pay_on_delivery')::int = 82000;
  assert cod->>'customer_name' is null and cod->>'phone' is null and cod->>'address' is null;
  assert public.lookup_order(lower(cod->>'code')) = cod;
  assert public.lookup_order('LS-NOT-FOUND') is null;

  transfer := public.place_order(request_two, 'Khách khác', '+84900000000', 'Địa chỉ thử nghiệm', 'transfer', items);
  assert (transfer->>'pay_now')::int = 102000 and (transfer->>'pay_on_delivery')::int = 0;
  assert cod->>'code' <> transfer->>'code';

  begin
    perform public.place_order(gen_random_uuid(), 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', 'cod',
      '[{"variant_id":"00000000-0000-0000-0000-000000000001","quantity":99}]');
    raise exception 'Insufficient stock unexpectedly accepted' using errcode = 'P0002';
  exception when raise_exception then
    assert sqlerrm like 'Không đủ tồn kho%';
  end;
  begin
    perform public.place_order(gen_random_uuid(), 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', 'cod',
      '[{"variant_id":"00000000-0000-0000-0000-000000000001","quantity":1},{"variant_id":"ffffffff-ffff-ffff-ffff-ffffffffffff","quantity":1}]');
    raise exception 'Unknown variant unexpectedly accepted' using errcode = 'P0002';
  exception when raise_exception then
    assert sqlerrm like 'Một sản phẩm%';
  end;
end;
$$;
reset role;

do $$
declare
  code_cod text;
  code_transfer text;
  variant uuid := '00000000-0000-0000-0000-000000000001';
begin
  select code into code_cod from public.orders where payment_method = 'cod';
  select code into code_transfer from public.orders where payment_method = 'transfer';
  assert (select stock = 2 from public.product_variants where id = variant);
  update public.orders set status = 'confirmed' where code = code_cod;
  assert public.lookup_order(code_cod)->>'status' = 'confirmed';
  assert public.lookup_order(code_cod)->'bank' = 'null'::jsonb;
  update public.orders set status = 'cancelled' where code = code_cod;
  update public.orders set status = 'cancelled' where code = code_cod;
  assert (select stock = 3 from public.product_variants where id = variant);

  update public.orders set expires_at = now() - interval '1 second' where code = code_transfer;
  begin
    update public.orders set status = 'confirmed' where code = code_transfer;
    raise exception 'Expired order unexpectedly confirmed' using errcode = 'P0002';
  exception when raise_exception then
    assert sqlerrm like 'Không thể chuyển trạng thái%';
  end;
  assert store_private.expire_orders() = 1;
  assert store_private.expire_orders() = 0;
  assert public.lookup_order(code_transfer)->>'status' = 'expired';
  assert (select stock = 4 from public.product_variants where id = variant);
end;
$$;
rollback;
