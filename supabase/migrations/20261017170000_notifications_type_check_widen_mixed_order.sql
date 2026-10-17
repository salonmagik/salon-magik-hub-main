-- notifications.type CHECK was widened in 20261017160713 for
-- 'product_order', 'package_order' and 'refund_request'. A mixed cart
-- (any combination of two or more of service/package/product in one
-- checkout) is now classified as its own notification type,
-- 'mixed_order', by create-public-booking/index.ts -- previously a mixed
-- cart fell through to 'appointment' with entityId pointing at whichever
-- line item's appointment row happened to be created first, which could
-- be a product or package row with no services on it (the "0 service(s),
-- Not scheduled" bug). Widening again so that insert is not silently
-- rejected the same way 'product_order'/'package_order' were before.
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'appointment', 'payment', 'customer', 'system', 'staff',
    'product_order', 'package_order', 'refund_request', 'mixed_order'
  ));
