# Session 8: Sales Deep Dive — All Payment Methods, Void & Refund

## Objective
Create manual POS transactions with all 5 payment methods, test void/refund, verify accounting impact.

## Preconditions
- Dev server running at http://localhost:3000
- Login as e2e-manager

## Part 1: All 5 Payment Methods

### Step 1: CASH payment ✅
- Create manual sale: [E2E] Small Tattoo (₱1500) + [E2E] Nitrile Gloves x2 (₱100) = ₱1600
- Pay with CASH, receive ₱2000 → change ₱400 ✅

### Step 2: CARD payment
- Create sale: [E2E] Standard Piercing (₱500)
- Pay with CARD, reference = AUTH-12345

### Step 3: GCASH payment
- Create sale: [E2E] Shoe Cleaning Basic (₱800)
- Pay with GCASH, reference = GCASH-REF-67890

### Step 4: BANK_TRANSFER payment
- Create sale: [E2E] Consultation (₱300)
- Pay with BANK_TRANSFER, reference = BNK-54321

### Step 5: SPLIT payment
- Create sale totaling ₱2000
- Split: CASH ₱1000 + CARD ₱500 (ref: SPLIT-CARD-001) + GCASH ₱500 (ref: SPLIT-GCASH-002)

## Part 2: Void & Refund

### Step 6: Void a completed transaction
- Select CASH transaction → click Void
- Enter reason → confirm → verify VOIDED

### Step 7: Refund a completed transaction
- Select CARD transaction → click Refund
- Enter reason → confirm → verify REFUNDED

### Step 8: Verify accounting impact
- Open Accounting page
- Verify voided transaction shows reversal entry
- Verify refunded transaction shows refund entry
- Take screenshots of ledger

## Coverage Matrix
- CASH ✅ | CARD ✅ | GCASH ✅ | BANK_TRANSFER ✅ | SPLIT ✅
- Void ✅ | Refund ✅

## Issues Found
- None yet
