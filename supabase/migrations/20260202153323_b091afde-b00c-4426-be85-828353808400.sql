-- =====================================================
-- SALON MAGIK v1 DATABASE SCHEMA
-- Multi-tenant salon operations platform
-- =====================================================

-- 1. ENUM TYPES
-- =====================================================

-- User roles enum (stored in separate table per security requirements)
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'supervisor', 'receptionist', 'staff');

-- Subscription plans
CREATE TYPE public.subscription_plan AS ENUM ('solo', 'studio', 'chain');

-- Subscription status
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused');

-- Appointment status
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'started', 'paused', 'completed', 'cancelled', 'rescheduled');

-- Payment status
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'deposit_paid', 'fully_paid', 'pay_at_salon', 'refunded_partial', 'refunded_full');

-- Payment method
CREATE TYPE public.payment_method AS ENUM ('card', 'mobile_money', 'cash', 'pos', 'transfer', 'purse');

-- Service status
CREATE TYPE public.service_status AS ENUM ('active', 'inactive', 'archived');

-- Location availability
CREATE TYPE public.location_availability AS ENUM ('open', 'closed', 'temporarily_unavailable');

-- Refund type
CREATE TYPE public.refund_type AS ENUM ('original_method', 'store_credit', 'offline');

-- Refund status
CREATE TYPE public.refund_status AS ENUM ('pending', 'approved', 'rejected', 'completed');

-- 2. CORE TABLES
-- =====================================================

-- Tenants (Salon businesses)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    plan subscription_plan NOT NULL DEFAULT 'solo',
    subscription_status subscription_status NOT NULL DEFAULT 'trialing',
    trial_ends_at TIMESTAMPTZ,
    country TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Feature flags
    online_booking_enabled BOOLEAN NOT NULL DEFAULT false,
    pay_at_salon_enabled BOOLEAN NOT NULL DEFAULT false,
    deposits_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Billing references
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    paystack_customer_code TEXT
);

-- Profiles (User profiles linked to auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles (separate table for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, tenant_id, role)
);

-- Locations
CREATE TABLE public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    availability location_availability NOT NULL DEFAULT 'open',
    is_default BOOLEAN NOT NULL DEFAULT false,
    opening_time TIME NOT NULL DEFAULT '09:00',
    closing_time TIME NOT NULL DEFAULT '18:00',
    opening_days TEXT[] NOT NULL DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff assignments to locations
CREATE TABLE public.staff_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, location_id)
);

-- 3. SERVICES & PRODUCTS
-- =====================================================

-- Service categories
CREATE TABLE public.service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price DECIMAL(10,2) NOT NULL,
    status service_status NOT NULL DEFAULT 'active',
    deposit_required BOOLEAN NOT NULL DEFAULT false,
    deposit_amount DECIMAL(10,2),
    deposit_percentage DECIMAL(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    status service_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Packages
CREATE TABLE public.packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    status service_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Package items (services included in a package)
CREATE TABLE public.package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. CUSTOMERS
-- =====================================================

-- Customers (per tenant)
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    outstanding_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer purse (store credit)
CREATE TABLE public.customer_purses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(customer_id, tenant_id)
);

-- 5. APPOINTMENTS
-- =====================================================

-- Appointments
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    
    -- Scheduling
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    is_walk_in BOOLEAN NOT NULL DEFAULT false,
    is_unscheduled BOOLEAN NOT NULL DEFAULT false,
    
    -- Status
    status appointment_status NOT NULL DEFAULT 'scheduled',
    payment_status payment_status NOT NULL DEFAULT 'unpaid',
    
    -- Payments
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    purse_amount_used DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Staff
    assigned_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Metadata
    notes TEXT,
    cancellation_reason TEXT,
    reschedule_count INTEGER NOT NULL DEFAULT 0,
    pause_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointment services (services in an appointment)
CREATE TABLE public.appointment_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
    service_name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status appointment_status NOT NULL DEFAULT 'scheduled',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointment pause history
CREATE TABLE public.appointment_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resumed_at TIMESTAMPTZ,
    reason TEXT NOT NULL,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 6. PAYMENTS & TRANSACTIONS
-- =====================================================

-- Transactions
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    
    -- Transaction details
    type TEXT NOT NULL, -- payment, refund, purse_funding, tip, etc.
    method payment_method NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- External references
    provider TEXT, -- paystack, stripe, etc.
    provider_reference TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'completed',
    
    -- Audit
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refund requests
CREATE TABLE public.refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    
    refund_type refund_type NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason TEXT NOT NULL,
    status refund_status NOT NULL DEFAULT 'pending',
    
    -- Approval flow
    requested_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AUDIT LOG
-- =====================================================

-- Audit logs (mandatory per PRD)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    before_json JSONB,
    after_json JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. COMMUNICATION CREDITS
-- =====================================================

-- Communication credits balance
CREATE TABLE public.communication_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    free_monthly_allocation INTEGER NOT NULL DEFAULT 30,
    last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. INDEXES
-- =====================================================

-- Tenant-scoped indexes for performance
CREATE INDEX idx_locations_tenant ON public.locations(tenant_id);
CREATE INDEX idx_services_tenant ON public.services(tenant_id);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX idx_appointments_tenant ON public.appointments(tenant_id);
CREATE INDEX idx_appointments_status ON public.appointments(tenant_id, status);
CREATE INDEX idx_appointments_scheduled_start ON public.appointments(tenant_id, scheduled_start);
CREATE INDEX idx_transactions_tenant ON public.transactions(tenant_id);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- 10. ENABLE RLS
-- =====================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_purses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_credits ENABLE ROW LEVEL SECURITY;

-- 11. SECURITY DEFINER FUNCTIONS
-- =====================================================

-- Function to check if user has a specific role in a tenant
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _tenant_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND tenant_id = _tenant_id
          AND role = _role
    )
$$;

-- Function to check if user belongs to a tenant
CREATE OR REPLACE FUNCTION public.belongs_to_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND tenant_id = _tenant_id
    )
$$;

-- Function to get user's tenant IDs
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT tenant_id
    FROM public.user_roles
    WHERE user_id = _user_id
$$;

-- 12. RLS POLICIES
-- =====================================================

-- Profiles: Users can read and update their own profile
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- User Roles: Users can see their own roles
CREATE POLICY "Users can read own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

-- Tenants: Users can see tenants they belong to
CREATE POLICY "Users can read own tenants"
    ON public.tenants FOR SELECT
    USING (id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Locations: Users can see locations in their tenants
CREATE POLICY "Users can read tenant locations"
    ON public.locations FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Services: Users can see services in their tenants
CREATE POLICY "Users can read tenant services"
    ON public.services FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Products: Users can see products in their tenants
CREATE POLICY "Users can read tenant products"
    ON public.products FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Customers: Users can see customers in their tenants
CREATE POLICY "Users can read tenant customers"
    ON public.customers FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Appointments: Users can see appointments in their tenants
CREATE POLICY "Users can read tenant appointments"
    ON public.appointments FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Transactions: Users can see transactions in their tenants
CREATE POLICY "Users can read tenant transactions"
    ON public.transactions FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Audit logs: Users can see audit logs in their tenants
CREATE POLICY "Users can read tenant audit logs"
    ON public.audit_logs FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- 13. TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_packages_updated_at
    BEFORE UPDATE ON public.packages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        NEW.raw_user_meta_data->>'phone'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
    _tenant_id uuid,
    _action text,
    _entity_type text,
    _entity_id uuid,
    _before_json jsonb DEFAULT NULL,
    _after_json jsonb DEFAULT NULL,
    _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _audit_id uuid;
BEGIN
    INSERT INTO public.audit_logs (
        tenant_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json,
        metadata
    ) VALUES (
        _tenant_id,
        auth.uid(),
        _action,
        _entity_type,
        _entity_id,
        _before_json,
        _after_json,
        _metadata
    ) RETURNING id INTO _audit_id;
    
    RETURN _audit_id;
END;
$$;