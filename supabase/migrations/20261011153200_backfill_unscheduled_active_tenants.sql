-- Backfill: theme purchases, Staff Operations purchases, and plan-config
-- changes have each been flipping subscription_status to 'active' as a
-- side effect since they shipped, with no path that ever set
-- next_billing_at -- confirmed in production: an active Solo-plan tenant
-- showing "billing not scheduled" with no card on file. The app-level fix
-- (ensureSubscriptionScheduled, called from every one of those purchase
-- flows plus their webhook backstop) stops this going forward; this
-- backfills tenants already stuck in that state.
--
-- Tenants with a card on file (paystack_authorization_code) will be picked
-- up by the existing recurring-billing cron on their new next_billing_at
-- and charged or correctly demoted to past_due if the charge fails -- the
-- lifecycle machinery already built for that. Tenants with NO card on file
-- are given the same next_billing_at (so they're no longer silently
-- invisible to any future reconciliation pass), but note the recurring
-- cron's own query excludes rows with no stored authorization
-- (process-recurring-addon-billing/charge.ts), so this alone does not
-- charge or block them -- that gap (an active tenant with no card and
-- nothing to bill against) still needs its own enforcement surface,
-- separate from this backfill.
update public.tenants
set next_billing_at = now() + (case when billing_cycle = 'annual' then interval '365 days' else interval '30 days' end),
    billing_retry_count = coalesce(billing_retry_count, 0)
where subscription_status = 'active'
  and next_billing_at is null;
