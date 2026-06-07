# Arkesel SMS Migration

## Summary

Arkesel replaces both Termii (Nigeria) and Txtconnect (Ghana) for all SMS delivery. A single Arkesel account and API key covers both markets.

WhatsApp delivery (Termii) is unaffected and remains unchanged.

## Arkesel API contract

- **Base URL**: `https://sms.arkesel.com/api/v2`
- **Auth header**: `api-key: <ARKESEL_API_KEY>`
- **Send endpoint**: `POST /sms/send`
- **Request body**:
  ```json
  {
    "sender": "SenderName",
    "message": "Message text",
    "recipients": ["233XXXXXXXXX"]
  }
  ```
- **Phone format**: international digits only, no `+` (e.g. `233XXXXXXXXX` for Ghana, `234XXXXXXXXX` for Nigeria)
- **Success response**:
  ```json
  {
    "status": "success",
    "data": {
      "ID": "f3be70c1-3545-4677-b607-6b5f32202652",
      "status": "DELIVERED",
      "sender": "SenderName",
      "recipient": "233544919953",
      "message": "...",
      "message_count": 1,
      "sent_at_time": "2021-04-09 18:44:05"
    }
  }
  ```
- For bulk sends, `data` is an array of the above objects — one per recipient.
- **Error response**: HTTP 4xx/5xx with `{ "status": "error", "message": "..." }`

## New environment variable

| Variable | Description |
|---|---|
| `ARKESEL_API_KEY` | Arkesel API key (covers both NG and GH) |

`TXTCONNECT_API_KEY` and `TERMII_API_KEY` can be removed from Supabase secrets once this is deployed and confirmed working (Termii key can stay if WhatsApp via Termii is still in use).

## Files changed

### New
- `supabase/functions/_shared/arkesel-client.ts` — Arkesel send client (`sendArkeselSMS`, `sendArkeselBulkSMS`, `extractArkeselMessageId`)

### Updated
- `supabase/functions/send-bulk-message/index.ts` — SMS path uses `sendArkeselSMS`; removed `isGhanaMarket` dispatch; provider logged as `arkesel_sms`
- `supabase/functions/send-manual-message/index.ts` — same
- `supabase/functions/send-reactivation-campaign/index.ts` — same

### Untouched
- `supabase/functions/_shared/termii-client.ts` — still used for WhatsApp (Termii WhatsApp templates and conversational WhatsApp in send-bulk-message)
- `supabase/functions/_shared/txtconnect-client.ts` — kept as dead code for reference; no longer imported anywhere

## Message logs

SMS messages are now logged with `provider = "arkesel_sms"`. The `termii_message_id` column is reused to store the Arkesel `data.ID` value (column rename is a separate cleanup task).

## Sender name

No change to sender name flow. Tenants continue to configure `sms_sender_name` via the manage-sms-sender-name function. The value is passed as `sender` in the Arkesel request body (max 11 characters per Arkesel docs).
