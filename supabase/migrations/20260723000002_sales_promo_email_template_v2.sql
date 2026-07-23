-- Extend get_sales_promo_email_vars with discount_description, discount_line,
-- and expires_date (date-only format for cleaner email copy).
-- Also refresh the default campaign email templates to the v2 design.

create or replace function public.get_sales_promo_email_vars(
  p_promo_code_id uuid,
  p_origin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo      public.sales_promo_codes;
  v_campaign   public.sales_promo_campaigns;
  v_base_url   text;
  v_discount_description text;
  v_discount_line        text;
begin
  select * into v_promo
  from public.sales_promo_codes
  where id = p_promo_code_id;

  if v_promo.id is null then
    raise exception 'PROMO_NOT_FOUND';
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  v_base_url := coalesce(
    nullif(trim(p_origin), ''),
    nullif(trim(current_setting('request.headers', true)::jsonb ->> 'origin'), ''),
    'https://app.salonmagik.com'
  );
  v_base_url := regexp_replace(v_base_url, '/+$', '');

  -- Human-readable discount description derived from campaign fields
  v_discount_description := case
    when v_campaign.discount_type = 'percent' and v_campaign.discount_value is not null then
      round(v_campaign.discount_value)::text || '% off'
    when v_campaign.discount_type = 'months_free' and v_campaign.discount_value is not null then
      v_campaign.discount_value::int::text
      || case when v_campaign.discount_value = 1 then ' month' else ' months' end
      || ' free'
    when v_campaign.discount_type = 'flat' and v_campaign.discount_value is not null then
      v_campaign.discount_value::text || ' off'
    else null
  end;

  -- Pre-built HTML paragraph for template injection; empty string when no discount
  v_discount_line := case
    when v_discount_description is not null then
      '<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">'
      || 'This gets you <strong>' || v_discount_description || '</strong>.</p>'
    else ''
  end;

  return jsonb_build_object(
    'recipient_email',        v_promo.target_email,
    'recipient_firstname',    coalesce(nullif(trim(v_promo.target_first_name), ''), 'there'),
    'promo_code',             v_promo.code,
    'campaign_name',          v_campaign.name,
    'expires_at',             to_char(coalesce(v_promo.expires_at, v_campaign.ends_at), 'Mon DD, YYYY HH24:MI TZ'),
    'expires_date',           to_char(coalesce(v_promo.expires_at, v_campaign.ends_at), 'FMMonth FMDD, YYYY'),
    'signup_url',             v_base_url || '/signup?promo=' || v_promo.code,
    'login_url',              v_base_url || '/login?promo=' || v_promo.code,
    'discount_type',          v_campaign.discount_type,
    'discount_value',         v_campaign.discount_value,
    'discount_description',   coalesce(v_discount_description, ''),
    'discount_line',          v_discount_line,
    'billing_targets',        array_to_string(v_campaign.billing_targets, ', ')
  );
end;
$$;

-- Update all campaigns to use the v2 email template.
-- Uses a single UPDATE so any future campaigns created without a template
-- will also pick up this wording via the coalesce default below.
update public.sales_promo_campaigns
set
  email_subject_template = 'Welcome to Salon Magik, here''s your invite',
  email_body_template    = $body$<h2 style="color:#111827;margin:0 0 20px 0;font-size:24px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;">Hi {{recipient_firstname}},</h2>
<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">Welcome to Salon Magik. You&#39;ve been invited to join, and we&#39;ve set aside a promo code just for your account.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;">
  <tr>
    <td style="background:#f8f6f2;border-radius:12px;padding:24px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Your promo code</p>
      <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:6px;color:#2E1F4E;font-family:monospace,'Courier New';">{{promo_code}}</p>
    </td>
  </tr>
</table>
{{discount_line}}<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">It&#39;s reserved for this account and valid through <strong>{{expires_date}}</strong>.</p>
<table role="presentation" style="margin:32px auto;border-collapse:collapse;">
  <tr>
    <td style="border-radius:100px;background-color:#F4C84E;">
      <a href="{{signup_url}}" style="background-color:#F4C84E;color:#2E1F4E;padding:15px 36px;text-decoration:none;border-radius:100px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Start free trial &#x2192;</a>
    </td>
  </tr>
</table>
<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">Questions getting set up? Just reply to this email &#x2014; a real person will get back to you.</p>
<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0;">Welcome aboard,<br/><strong>The Salon Magik team</strong></p>$body$;
