alter table public.notification_settings
  add column if not exists email_transaction_alerts boolean not null default true,
  add column if not exists in_app_transaction_alerts boolean not null default true;

alter table public.email_templates
  drop constraint if exists email_templates_template_type_check;

alter table public.email_templates
  add constraint email_templates_template_type_check
  check (
    template_type in (
      'appointment_confirmation',
      'appointment_reminder',
      'appointment_cancelled',
      'booking_confirmation',
      'payment_receipt',
      'refund_confirmation',
      'staff_invitation',
      'welcome',
      'password_reset',
      'password_changed',
      'email_verification',
      'welcome_owner',
      'service_started',
      'buffer_requested',
      'service_change_approval',
      'trial_ending_7d',
      'trial_ending_3h',
      'payment_failed',
      'store_credit_restored',
      'gift_received',
      'voucher_applied',
      'daily_digest'
    )
  );
