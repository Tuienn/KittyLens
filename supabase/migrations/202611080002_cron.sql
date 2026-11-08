create extension if not exists pg_cron;
select cron.schedule('lens-expire-orders', '* * * * *', 'select store_private.expire_orders();');
