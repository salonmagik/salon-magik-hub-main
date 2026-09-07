-- Paystack transfers can come back requiring OTP finalization on our own
-- Paystack account (not the salon's) before they'll actually move money.
-- We have no code to complete that OTP step ourselves, so today those
-- transfers silently sit as an ordinary "pending" row forever, identical
-- to a normal in-flight transfer, with no way for anyone internally to
-- tell the two apart. Salons should never see or know about this — it's
-- purely an internal ops concern — so this stays invisible on the salon
-- side (still displayed as pending there) and is only meant to be
-- surfaced on a backoffice withdrawals view.
ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'awaiting_otp';
