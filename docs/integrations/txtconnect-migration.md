# Txtconnect Migration Note

## Scope

This migration replaces the active SMS delivery path that previously depended on Termii with Txtconnect for Ghana tenants only.

Nigeria tenants stay on the existing Termii SMS path until Txtconnect Nigeria documentation is confirmed.

WhatsApp logic is intentionally left in place at the backend level, but salon-admin no longer exposes WhatsApp sending or WhatsApp configuration as an active channel.

## Confirmed Txtconnect contract

Confirmed from Txtconnect documentation screenshots supplied on May 1, 2026:

- `POST https://api.txtconnect.net/dev/api/sms/send`
  - headers:
    - `Authorization: Bearer <API Key>`
    - `Content-Type: application/json`
  - body:
    - `to`
    - `from`
    - `unicode`
    - `sms`

- `GET https://api.txtconnect.net/dev/api/sms/getstatus/{msgId}`
  - headers:
    - `Authorization: Bearer <API Key>`

- `POST https://api.txtconnect.net/dev/api/sms/getstatus`
  - headers:
    - `Authorization: Bearer <API Key>`
    - `Content-Type: application/json`
  - body:
    - `messageId`

## Termii touchpoints replaced

### Active SMS delivery

- `supabase/functions/send-bulk-message/index.ts`
  - Ghana SMS broadcast delivery now uses `sendTxtconnectSMS`
  - Nigeria SMS broadcast delivery stays on `sendTermiiSMS`
- `supabase/functions/send-manual-message/index.ts`
  - Ghana single manual SMS delivery now uses `sendTxtconnectSMS`
  - Nigeria single manual SMS delivery stays on `sendTermiiSMS`
- `supabase/functions/send-reactivation-campaign/index.ts`
  - Ghana SMS reactivation sends now use `sendTxtconnectSMS`
  - Nigeria SMS reactivation sends stay on `sendTermiiSMS`

### Shared provider client

- `supabase/functions/_shared/txtconnect-client.ts`
  - centralizes Txtconnect send and status calls
  - uses:
    - `TXTCONNECT_API_KEY`
    - optional `TXTCONNECT_API_BASE`

## Sender name handling

### Previous state

The repo had a Termii-specific sender-name approval flow:

- `manage-termii-sender-id`
- tenant fields such as:
  - `termii_sender_id`
  - `termii_sender_id_status`

### Current migration approach

Sender configuration has been generalized to tenant SMS fields:

- `sms_provider`
- `sms_sender_name`
- `sms_sender_name_status`
- `sms_sender_name_requested_at`
- `sms_sender_name_approved_at`
- `sms_sender_name_company`
- `sms_sender_name_use_case`

Salon-admin now uses:

- `supabase/functions/manage-sms-sender-name/index.ts`

Current behavior:

- request or save sender name locally
- mark it `pending`
- read sender-name status locally

### Known gap

Txtconnect sender-name approval endpoints were not confirmed from the documentation screenshots.

That means:

- SMS sending is migrated to Txtconnect
- sender-name persistence is generalized and usable
- remote sender-name approval synchronization is still pending exact Txtconnect endpoint documentation

## Data compatibility

The migration backfills generic tenant SMS fields from existing Termii sender fields where available so current salons do not lose sender configuration.

Message logs still use some legacy field names such as `termii_message_id` as a transitional persistence shape. Ghana SMS sends should log provider `txtconnect_sms`. Nigeria SMS sends should continue to log provider `termii_sms`.

## Next follow-up once more Txtconnect docs are available

1. Confirm whether Txtconnect exposes:
   - sender-name registration endpoint
   - sender-name approval or status endpoint
2. Replace local-only sender-name status flow with remote synchronization if available.
3. Rename legacy persistence columns such as `termii_message_id` if a schema cleanup pass is approved.
