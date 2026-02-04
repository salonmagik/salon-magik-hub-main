-- Create a function to handle tenant cleanup when the last owner is removed
CREATE OR REPLACE FUNCTION public.handle_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    remaining_owners_count INTEGER;
BEGIN
    -- Only proceed if an owner role was deleted
    IF OLD.role = 'owner' THEN
        -- Count remaining owners for this tenant
        SELECT COUNT(*) INTO remaining_owners_count
        FROM public.user_roles
        WHERE tenant_id = OLD.tenant_id
          AND role = 'owner';
        
        -- If no owners remain, disable online booking and mark tenant as inactive
        IF remaining_owners_count = 0 THEN
            UPDATE public.tenants
            SET 
                online_booking_enabled = false,
                subscription_status = 'canceled',
                updated_at = now()
            WHERE id = OLD.tenant_id;
            
            -- Log the automatic deactivation
            INSERT INTO public.audit_logs (
                tenant_id,
                action,
                entity_type,
                entity_id,
                metadata
            ) VALUES (
                OLD.tenant_id,
                'tenant_auto_deactivated',
                'tenant',
                OLD.tenant_id,
                jsonb_build_object(
                    'reason', 'last_owner_removed',
                    'removed_user_id', OLD.user_id
                )
            );
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$;

-- Create the trigger on user_roles deletion
DROP TRIGGER IF EXISTS on_owner_removed ON public.user_roles;
CREATE TRIGGER on_owner_removed
    AFTER DELETE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_owner_removal();

-- Also create a function to clean up when a user is deleted from auth.users
-- This handles the cascade before user_roles entries are deleted
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tenant_record RECORD;
    remaining_owners_count INTEGER;
BEGIN
    -- Find all tenants where this user is an owner
    FOR tenant_record IN 
        SELECT DISTINCT tenant_id 
        FROM public.user_roles 
        WHERE user_id = OLD.id AND role = 'owner'
    LOOP
        -- Count other owners for this tenant (excluding the deleted user)
        SELECT COUNT(*) INTO remaining_owners_count
        FROM public.user_roles
        WHERE tenant_id = tenant_record.tenant_id
          AND role = 'owner'
          AND user_id != OLD.id;
        
        -- If no other owners, disable the tenant
        IF remaining_owners_count = 0 THEN
            UPDATE public.tenants
            SET 
                online_booking_enabled = false,
                subscription_status = 'canceled',
                updated_at = now()
            WHERE id = tenant_record.tenant_id;
        END IF;
    END LOOP;
    
    RETURN OLD;
END;
$$;

-- Now let's also clean up the existing orphaned tenant(s)
-- Disable any tenants that have no owners
UPDATE public.tenants
SET 
    online_booking_enabled = false,
    subscription_status = 'canceled',
    updated_at = now()
WHERE id NOT IN (
    SELECT DISTINCT tenant_id 
    FROM public.user_roles 
    WHERE role = 'owner'
)
AND online_booking_enabled = true;