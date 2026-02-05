-- Add subscription_status to support 'permanently_deactivated' state
-- Also add a 'deactivated_at' column to tenants

-- First add 'permanently_deactivated' to subscription status handling
-- (since it's just a text column, we just update values)

-- Add last_reminder_sent_at column to appointments for tracking reminder cooldown
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update trigger to mark tenants as permanently deactivated when last owner is removed
CREATE OR REPLACE FUNCTION public.handle_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        
        -- If no owners remain, mark tenant as permanently deactivated
        IF remaining_owners_count = 0 THEN
            UPDATE public.tenants
            SET 
                online_booking_enabled = false,
                subscription_status = 'permanently_deactivated',
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
                'tenant_permanently_deactivated',
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
$function$;

-- Update the user deletion handler as well
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        
        -- If no other owners, permanently deactivate the tenant
        IF remaining_owners_count = 0 THEN
            UPDATE public.tenants
            SET 
                online_booking_enabled = false,
                subscription_status = 'permanently_deactivated',
                updated_at = now()
            WHERE id = tenant_record.tenant_id;
            
            -- Log the deactivation
            INSERT INTO public.audit_logs (
                tenant_id,
                action,
                entity_type,
                entity_id,
                metadata
            ) VALUES (
                tenant_record.tenant_id,
                'tenant_permanently_deactivated',
                'tenant',
                tenant_record.tenant_id,
                jsonb_build_object(
                    'reason', 'owner_account_deleted',
                    'deleted_user_id', OLD.id
                )
            );
        END IF;
    END LOOP;
    
    RETURN OLD;
END;
$function$;