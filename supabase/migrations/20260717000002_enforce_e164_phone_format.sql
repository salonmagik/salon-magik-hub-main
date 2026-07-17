-- Enforce E.164 phone format on customers.phone and profiles.phone.
--
-- E.164: +[country_code][number], e.g. +2348012345678 or +233201234567.
-- Arkesel strips the leading + before sending; we store WITH the + as the canonical form.
--
-- Cleanup order before adding the constraint:
--   1. Digits-only numbers that already have a country code → add leading +
--   2. E.164 numbers with a trunk-prefix 0 after a 3-digit country code
--      (e.g. +2330558543881 → +233558543881) — common Ghana/Nigeria entry mistake
--   3. 10-digit local-format numbers starting with 0 with no country code → null
--      (cannot reliably determine country, must be re-entered)

-- ── Step 1: digits-only + valid country code prefix → prepend +
UPDATE public.customers
SET phone = '+' || phone
WHERE phone IS NOT NULL
  AND phone ~ '^[1-9][0-9]{6,14}$';

UPDATE public.profiles
SET phone = '+' || phone
WHERE phone IS NOT NULL
  AND phone ~ '^[1-9][0-9]{6,14}$';

-- ── Step 2: strip trunk-prefix 0 that immediately follows a 3-digit country code
-- Matches: +XXX0YYYYYYYY where XXX is a 3-digit code and there are 7–9 more digits
UPDATE public.customers
SET phone = '+' || substring(phone, 2, 3) || substring(phone, 6)
WHERE phone IS NOT NULL
  AND phone ~ '^\+[0-9]{3}0[0-9]{7,9}$';

UPDATE public.profiles
SET phone = '+' || substring(phone, 2, 3) || substring(phone, 6)
WHERE phone IS NOT NULL
  AND phone ~ '^\+[0-9]{3}0[0-9]{7,9}$';

-- ── Step 3: local-format numbers (no country code, starts with 0) → null
-- These cannot be reliably converted; staff must re-enter them correctly.
UPDATE public.customers
SET phone = NULL
WHERE phone IS NOT NULL
  AND phone ~ '^0[0-9]{7,11}$';

UPDATE public.profiles
SET phone = NULL
WHERE phone IS NOT NULL
  AND phone ~ '^0[0-9]{7,11}$';

-- ── Add CHECK constraint: E.164 format (+ followed by 7–15 digits, first non-zero)
ALTER TABLE public.customers
  ADD CONSTRAINT customers_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');
