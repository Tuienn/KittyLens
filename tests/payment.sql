-- Run after all schema migrations and seed in a disposable database.
begin;

update public.shop_settings set accepting_orders = true;

set local role anon;
do $$
declare
  request_id uuid := gen_random_uuid();
  item jsonb := '[{"variant_id":"00000000-0000-0000-0000-000000000001","quantity":1}]';
  cod jsonb;
  transfer jsonb;
begin
  cod := public.place_order(request_id, 'Khách thử', '+84900000000', 'Địa chỉ thử nghiệm', 'cod', item);
  assert cod = public.place_order(request_id, '', '', '', 'transfer', '[]');
  assert cod->>'shipping_fee' = '20000' and cod->>'total' = '109000';
  assert cod->>'pay_now' = '20000' and cod->>'pay_on_delivery' = '89000';
  assert cod->>'payment_memo' = '0900000000 THANHTOAN' || (cod->>'payment_ref');
  assert length(cod->>'payment_memo') = 25;
  assert cod->'bank'->>'bin' = '970418' and cod->'bank'->>'account' = 'PHUONGPHUONGG';
  assert public.lookup_order(cod->>'code')->>'payment_memo' is null;
  assert public.lookup_order(cod->>'code')->>'phone' is null;

  transfer := public.place_order(gen_random_uuid(), 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', 'transfer', item);
  assert transfer->>'pay_now' = '109000' and transfer->>'shipping_fee' = '20000';
  assert transfer->>'payment_ref' <> cod->>'payment_ref';
  assert public.review_order_payment(gen_random_uuid()) is null;

  begin
    perform public.claim_order_email();
    raise exception 'Public access to email jobs';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
declare
  mail jsonb;
  next_mail jsonb;
  token uuid;
  payment jsonb;
  sent_id uuid;
  expired_token uuid;
begin
  assert (select count(*) = 2 from store_private.order_email_jobs);
  mail := public.claim_order_email();
  assert mail->>'phone' = '+84900000000' or mail->>'phone' = '0900000000';
  assert mail->>'address' = 'Địa chỉ thử nghiệm';
  assert jsonb_array_length(mail->'items') = 1;
  token := (mail->>'token')::uuid;
  sent_id := (mail->>'id')::uuid;
  payment := public.review_order_payment(token);
  assert payment->>'status' = 'pending' and payment->>'phone' is null;
  assert public.lookup_order(payment->>'code')->>'status' = 'pending';

  perform public.finish_order_email(sent_id, (mail->>'lease_id')::uuid, false);
  next_mail := public.claim_order_email();
  assert next_mail->>'id' <> mail->>'id';
  assert public.claim_order_email() is null;
  update store_private.order_email_jobs set available_at = now() where order_id = sent_id;
  mail := public.claim_order_email();
  assert mail->>'token' = token::text;
  perform public.finish_order_email(sent_id, (mail->>'lease_id')::uuid, true);

  execute 'set local role anon';
  assert public.confirm_order_payment(token)->>'status' = 'confirmed';
  assert public.confirm_order_payment(token)->>'status' = 'confirmed';
  assert public.lookup_order(payment->>'code')->>'status' = 'confirmed';
  execute 'reset role';
  assert (select used_at is not null and sent_at is not null from store_private.order_email_jobs where order_id = sent_id);

  expired_token := (next_mail->>'token')::uuid;
  update public.orders set expires_at = now() - interval '1 second' where id = (next_mail->>'id')::uuid;
  assert public.confirm_order_payment(expired_token)->>'status' = 'expired';
  assert (select used_at is null from store_private.order_email_jobs where confirmation_token = expired_token);
end;
$$;

set local role anon;
do $$
declare
  method text;
  two_pairs jsonb := '[
    {"variant_id":"00000000-0000-0000-0000-000000000003","quantity":2},
    {"variant_id":"00000000-0000-0000-0000-0000000001e1","quantity":1}
  ]';
  three_pairs jsonb := '[
    {"variant_id":"00000000-0000-0000-0000-000000000003","quantity":1},
    {"variant_id":"00000000-0000-0000-0000-000000000021","quantity":2}
  ]';
  paid_shipping jsonb;
  free_shipping jsonb;
begin
  foreach method in array array['transfer', 'cod'] loop
    paid_shipping := public.place_order(gen_random_uuid(), 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', method, two_pairs);
    assert paid_shipping->>'shipping_fee' = '20000' and paid_shipping->>'total' = '205000';

    free_shipping := public.place_order(gen_random_uuid(), 'Khách thử', '0900000000', 'Địa chỉ thử nghiệm', method, three_pairs);
    assert free_shipping->>'shipping_fee' = '0' and free_shipping->>'total' = '187000';
    if method = 'cod' then
      assert free_shipping->>'pay_now' = '20000' and free_shipping->>'pay_on_delivery' = '167000';
    else
      assert free_shipping->>'pay_now' = '187000' and free_shipping->>'pay_on_delivery' = '0';
    end if;
  end loop;
end;
$$;
rollback;
