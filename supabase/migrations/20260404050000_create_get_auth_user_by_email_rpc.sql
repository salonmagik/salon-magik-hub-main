-- Create RPC function to efficiently lookup auth users by email
-- This allows edge functions to bypass the listUsers pagination

create or replace function public.get_auth_user_by_email(lookup_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'id', id::text,
    'email', email,
    'user_metadata', raw_user_meta_data
  )
  into result
  from auth.users
  where lower(email) = lower(lookup_email)
  limit 1;
  
  return result;
end;
$$;

-- Grant execute permission to service role
grant execute on function public.get_auth_user_by_email(text) to service_role;

comment on function public.get_auth_user_by_email is 'Efficiently lookup auth user by email for edge functions';
