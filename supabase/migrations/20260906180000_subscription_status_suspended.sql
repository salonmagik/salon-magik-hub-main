-- Own file: PostgreSQL forbids using a newly added enum value in the same
-- transaction that adds it, and Supabase runs each migration in a
-- transaction. Nothing in this file may reference 'suspended'.
alter type public.subscription_status add value if not exists 'suspended';
