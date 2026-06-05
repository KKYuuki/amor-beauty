-- Add CHECK constraint for debit/credit mutual exclusivity
-- Run manually or include in next Drizzle migration
ALTER TABLE general_ledger
ADD CONSTRAINT check_debit_credit_valid
CHECK (
    CAST(debit AS NUMERIC) >= 0
    AND CAST(credit AS NUMERIC) >= 0
    AND (CAST(debit AS NUMERIC) > 0 OR CAST(credit AS NUMERIC) > 0)
);

-- Normalize existing BANK values to BANK_TRANSFER in payroll tables
UPDATE payroll_request
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';

UPDATE payroll_disbursement
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';

UPDATE payroll_entry
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';
