-- Priority 2: Phase 1 - Add is_gifted column for gifted appointments
ALTER TABLE appointments 
ADD COLUMN is_gifted BOOLEAN NOT NULL DEFAULT false;