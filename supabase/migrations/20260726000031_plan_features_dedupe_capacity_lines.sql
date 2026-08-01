-- PlanCard.tsx auto-generates "1 location" / "Up to N staff" / "N messages /
-- month" lines directly from plan_limits (limitItems()) and prepends them
-- before the plan_features list. The previous migration's location/staff/
-- messages bullets were redundant with that — every plan card would show
-- each of those three lines twice. Drop the duplicates; keep the capacity
-- summary line for services/products/packages/vouchers since PlanCard has
-- no equivalent auto-generated line for that.
delete from public.plan_features
where feature_text in (
  '1 location',
  '1 location included (add more as you grow)',
  'Up to 3 staff accounts',
  'Up to 6 staff accounts',
  'Up to 12 staff accounts',
  '20 messages/month',
  '50 messages/month',
  '200 messages/month'
);
