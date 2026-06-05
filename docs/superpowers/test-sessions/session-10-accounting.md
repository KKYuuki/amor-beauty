# Session 10: Accounting — Ledger Verification

## Objective
Verify auto-created ledger entries from transactions and payroll, create manual entry, void/restore.

## Preconditions
- Dev server running at http://localhost:3000
- Completed transactions and payroll requests exist
- Login as e2e-manager (accounting_access)

## Steps

### Step 1: Verify auto-created TRANSACTION entries
- Open Accounting page
- Filter by source_type = "TRANSACTION"
- Verify: entry_type=REVENUE, category=SALES, credit > 0

### Step 2: Verify auto-created PAYROLL entries
- Filter by source_type = "PAYROLL"
- Verify: entry_type=EXPENSE, category=Staff Payroll, debit > 0

### Step 3: Create manual ledger entry
- Click "Add Entry"
- Fill: EXPENSE, Supplies, ₱500, CASH, reference=E2E-MANUAL-001
- Submit → verify appears in list

### Step 4: Void and restore the manual entry
- Find manual entry → Void
- Enter reason → verify is_voided=true
- Restore → verify is_voided=false

### Step 5: Period locking test (if applicable)
- Try adding entry with date outside configured period
- Verify error or document as feature gap

## Results
- [ ] TRANSACTION entries auto-created in ledger
- [ ] PAYROLL entries auto-created in ledger
- [ ] Manual entry created
- [ ] Void/restore works
- [ ] Accounting period locking (if implemented)

## Issues Found
- None yet
