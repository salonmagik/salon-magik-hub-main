-- Every transaction recorded today says "card" regardless of how the
-- customer actually paid — Paystack reports the real channel (card, bank,
-- bank_transfer, ussd, mobile_money, qr) on both the webhook payload and the
-- verify response, we just weren't reading it. The enum already had
-- mobile_money/transfer from an earlier pass; ussd and qr are the two real
-- Paystack channels still missing.
alter type public.payment_method add value if not exists 'ussd';
alter type public.payment_method add value if not exists 'qr';
