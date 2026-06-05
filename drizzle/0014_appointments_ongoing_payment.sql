-- Add payment tracking fields to appointments
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS downpayment_id UUID REFERENCES downpayments(id),
    ADD COLUMN IF NOT EXISTS downpayment_amount DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS downpayment_collected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID';

-- Verify payment_status values
-- Valid: 'UNPAID', 'DEPOSIT_PAID', 'PAID_IN_FULL', 'REFUNDED'

-- Index on payment_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON appointments(payment_status);

-- No schema change needed for ONGOING — status is a VARCHAR column.
-- The status value 'ONGOING' is now valid alongside existing values.
-- Validation is handled at the application layer via Zod/TypeScript.
