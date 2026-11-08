-- Create order_mailer_project_url and order_mailer_key in Supabase Vault first.
create extension if not exists pg_net;

select cron.schedule(
  'lens-send-order-email', '* * * * *',
  $job$
    select net.http_post(
      url := rtrim(url.decrypted_secret, '/') || '/functions/v1/order-mailer',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-order-mailer-key', secret.decrypted_secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    )
    from vault.decrypted_secrets url, vault.decrypted_secrets secret
    where url.name = 'order_mailer_project_url' and secret.name = 'order_mailer_key'
  $job$
);
