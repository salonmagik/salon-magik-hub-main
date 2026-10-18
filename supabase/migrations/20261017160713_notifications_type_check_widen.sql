-- notifications.type has had a hard CHECK since the table was created
-- ('appointment', 'payment', 'customer', 'system', 'staff' only). Two kinds
-- of notification already written to this column by application code were
-- never added here, so every insert attempting them has been silently
-- rejected (createTenantNotification only logs the error, never surfaces
-- it): 'product_order' and 'package_order', used by
-- create-public-booking/index.ts since the product/package notification
-- routing work. Also widening for 'refund_request', introduced alongside
-- this migration so a customer's refund request actually notifies the
-- salon (request_customer_refund previously never created a notification
-- row at all).
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'appointment', 'payment', 'customer', 'system', 'staff',
    'product_order', 'package_order', 'refund_request'
  ));
