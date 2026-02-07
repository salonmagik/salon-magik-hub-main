-- 1. Soft delete columns for all catalog tables
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS flag_reason TEXT,
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS flag_reason TEXT,
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE packages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS discontinue_reason TEXT;

-- 2. Catalog deletion requests table for maker-checker workflow
CREATE TABLE catalog_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product', 'package', 'voucher')),
  item_name TEXT NOT NULL,
  requested_by_id UUID NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_id UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE catalog_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for deletion requests
CREATE POLICY "Users can read tenant deletion requests"
  ON catalog_deletion_requests FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create deletion requests"
  ON catalog_deletion_requests FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Owners can update deletion requests"
  ON catalog_deletion_requests FOR UPDATE
  USING (is_tenant_owner(auth.uid(), tenant_id));

-- 3. Create indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_services_deleted_at ON services(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_deleted_at ON packages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_deleted_at ON vouchers(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_deletion_requests_tenant ON catalog_deletion_requests(tenant_id, status);