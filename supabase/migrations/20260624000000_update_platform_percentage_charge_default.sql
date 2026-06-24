-- Update default value for platform_percentage_charge
ALTER TABLE tenants
ALTER COLUMN platform_percentage_charge SET DEFAULT 0.5;

-- Update existing tenants that currently have the old default value of 10
UPDATE tenants
SET platform_percentage_charge = 0.5
WHERE platform_percentage_charge = 10;
