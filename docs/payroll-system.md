# Payroll System

## Overview

The payroll system is built on a **commission-split model** where revenue from each service (tattoo, piercing, shoe customization) is divided between the **shop** and the **staff member** who performed it. It has several interconnected layers:

1. **Rate Configuration** — how splits are defined
2. **Payroll Entry Creation** — how individual earnings are recorded
3. **Payroll Requests** — how earnings are batched into payout requests
4. **Approval Workflow** — confirm → complete
5. **Disbursements** — staggered/split payments
6. **Deductions & Advances** — pre-payment adjustments
7. **Tax Withholding** — automatic tax calculation
8. **Accounting Integration** — auto-creates ledger entries

---

## 1. Rate Configuration

The system uses `payroll_staff_rate` entries to define how revenue is split. Each rate has:

| Field | Description |
|---|---|
| `service_type` | `TATTOO`, `PIERCING`, `SHOE`, or `MANUAL` |
| `client_type` | `WALKIN` (walk-in client) or `PERSONAL` (friend/family rate) |
| `rate_level_id` | Links to a **rate level** (e.g., "Junior Artist", "Senior Artist", "Master") |
| `payment_mode` | `PERCENTAGE` (split by %) or `FIXED` (staff gets a fixed amount) |
| `shop_percentage` / `staff_percentage` | Must sum to 100 in PERCENTAGE mode |
| `fixed_amount` | Staff's guaranteed cut in FIXED mode |
| `is_active` | Toggle to enable/disable a rate |

**Rate levels** are defined in the `rate_levels` table — each has a `name`, `slug`, `sort_order`, and `is_active` flag. Every user can optionally be assigned a `rate_level_id`, which determines which rates apply to them.

For example, a rate like `TATTOO - WALKIN - Senior Artist` with 60/40 means the shop gets 60% and the artist gets 40% of the gross revenue.

---

## 2. Payroll Entry Creation — Automatic

When a **transaction is completed** (via the sales/checkout flow in `sales.ts`), payroll entries are created **automatically**:

1. **`calculateAndCreatePayrollEntry()`** is called for each service sold
2. It determines the `serviceType` (from the service record) and `clientType` (from the transaction)
3. It looks up the staff member's `rateLevelId` from their user profile
4. It calls **`getApplicableRate()`** to find the matching rate by service type + client type + rate level
5. It calculates:
   - **Gross amount** = total paid for this service
   - **Shop cut** = gross × shop_percentage (or gross − fixed_amount)
   - **Staff cut** = gross × staff_percentage (or the fixed_amount)
6. Taxes are calculated via **`calculateTax()`** using progressive brackets (see [Tax Withholding](#7-tax-withholding))
7. **Net amount** = staff cut − tax amount
8. A `payroll_entry` is created with `paymentStatus: 'PENDING'`

Rate information is **snapshotted** into the entry (`staffRateSnapshot`, `shopRateSnapshot`) so historical changes to rates don't retroactively affect existing entries.

**Manual entries** can also be created for non-service income (tips, bonuses, etc.).

**Payroll Split Mode** — for downpayment transactions, there's a `payroll_split_mode` that can be either:
- `PER_PAYMENT`: each partial payment triggers its own payroll entry
- `ON_COMPLETION`: payroll is only calculated when the full amount is settled

---

## 3. Payroll Request Lifecycle

Individual pending entries are batched into **payroll requests** (disbursement requests). The workflow has 4 states:

```
PENDING entries → REQUESTED → CONFIRMED → COMPLETED
                       ↓
                   CANCELLED
```

### Step 1: REQUESTED (`createPayrollRequest()`)

- A manager (or the staff member) selects pending entries and creates a payroll request
- Specifies a period type (`DAILY` / `WEEKLY` / `BIMONTHLY` / `MONTHLY`) and date range
- Validates that all entries belong to the same staff member and are truly `PENDING`
- Prevents entries already claimed in another active request
- Totals are calculated (gross, shop cut, staff cut, net amount, tax)
- Entries are updated to `paymentStatus: 'REQUESTED'`

### Step 2: CONFIRMED (`confirmPayrollRequest()`)

- Manager approves the request, confirming they'll process payment
- Requires current status to be `REQUESTED`
- Uses a database transaction for atomicity
- Entries move to `paymentStatus: 'CONFIRMED'`

### Step 3: COMPLETED (`completePayrollRequest()`)

- Manager marks payment as sent (cash / GCash / Maya / bank transfer)
- Requires current status to be `CONFIRMED`
- Optional: upload proof file (screenshot, receipt) to Supabase Storage
- **Automatically applies pending deductions** for this staff member (advances, deductions, adjustments)
- Creates **accounting entries** in the general ledger:
  - Expense entry for the net payroll amount
  - Liability entry for tax withholding
  - Deduction-related entries tagged as `SALARY_ADVANCES`, `PAYROLL_DEDUCTIONS`, etc.
- Entries move to `paymentStatus: 'PAID'`

### Cancellation

Cancellation can happen from `REQUESTED` or `CONFIRMED` status — entries revert to `PENDING` and are freed up for regrouping.

---

## 4. Disbursements (Staggered Payments)

For large payroll amounts that need to be paid in installments, the system supports **staggered disbursements**:

- A manager can create multiple partial payments against a single `CONFIRMED` payroll request
- Each disbursement records: amount, payment method, reference number, proof URL
- The system tracks total disbursed vs. total staff cut
- When the cumulative disbursed amount ≥ total staff cut, the request auto-completes
- Partial disbursements create separate accounting entries per disbursement
- Useful for e.g., paying an artist ₱5,000 per day over a week instead of ₱35,000 at once

---

## 5. Deductions & Advances

The `payroll_deductions` table tracks:

| Type | Description |
|---|---|
| `ADVANCE` | Cash advance against future earnings |
| `DEDUCTION` | Deduction from payroll (equipment, supplies, etc.) |
| `ADJUSTMENT` | Correction to previous payments |

- Created as `PENDING` by managers
- **Auto-applied** when the payroll request is completed — deducted from the net amount before disbursement
- Supports **scheduled/recurring payments** via a `recurrenceRule` JSONB field (e.g., weekly ₱500 advance)
- Status flow: `PENDING` → `DEDUCTED` (when payroll completes) or `CANCELLED`

---

## 6. Tax Withholding

Tax is calculated on the **staff cut** (not the gross amount) using progressive brackets:

| Bracket | Range | Rate | Label |
|---|---|---|---|
| 1 | ₱0 – ₱10,000 | 0% | Zero |
| 2 | ₱10,000.01 – ₱30,000 | 5% | Basic |
| 3 | ₱30,000.01 – ₱50,000 | 10% | Mid |
| 4 | ₱50,000.01+ | 15% | High |

Each payroll entry stores:
- `taxRate`: the applicable percentage
- `taxAmount`: calculated tax amount
- `netAmount`: staff cut minus tax
- `taxBracket`: name of the bracket

The tax withholding creates a separate **LIABILITY** accounting entry when payroll is completed, so the business can track collected taxes as a liability.

---

## 7. Dashboard & Staff Views

### Admin Payroll Page (`/payroll`) — 6 tabs

| Tab | Purpose |
|---|---|
| **Dashboard** | Summary cards (Pending / Requested / Confirmed / Paid amounts), per-staff pending amounts with "Request Payout" action |
| **Payment Requests** | List of all requests with status filters; confirm / cancel / complete / disburse actions |
| **Rate Configuration** | CRUD for staff rates and rate levels |
| **Deductions** | Manage advances, deductions, and adjustments |
| **Scheduled** | Recurring scheduled payments |
| **Downpayments** | Track downpayments and assign staff |

### Staff "My Payroll" Page (`/my-payroll`)

| Tab | Purpose |
|---|---|
| **Earnings** | Calendar view (showing service dates) or list view of all payroll entries |
| **Requests** | View own payroll requests and their statuses |

Staff can select pending entries and submit a **payout request** to management.

---

## 8. Accounting Integration

Every time payroll is completed (fully or via disbursement), the system creates **general ledger entries**:

| Scenario | Debit | Credit | Category |
|---|---|---|---|
| Net payroll payment | Staff net amount | — | `PAYROLL` (Expense) |
| Tax withholding | — | Tax amount | `TAX_WITHHOLDING` (Liability) |
| Deductions (advances) | — | Deduction amount | `SALARY_ADVANCES` (Liability) |
| Deductions (general) | — | Deduction amount | `PAYROLL_DEDUCTIONS` (Liability) |
| Adjustments | — | Adjustment amount | `PAYROLL_ADJUSTMENTS` (Liability) |

This ensures the payroll system is fully integrated with the accounting module, so the general ledger always reflects accurate payroll expenses and liabilities.

---

## Summary Flow Diagram

```
┌─────────────────┐     ┌────────────────┐     ┌──────────────────┐
│  Service Sale   │────▶│  Payroll Entry │────▶│  Payroll Request │
│  (Checkout)     │     │  PENDING       │     │  REQUESTED       │
│                 │     │  (Auto calc)   │     │  (Batch of       │
│  Gross: ₱1000  │     │  Shop: ₱600    │     │   entries)       │
│  Rate: 60/40    │     │  Staff: ₱400  │     │                  │
│                 │     │  Tax: ₱0      │     │                  │
│                 │     │  Net: ₱400    │     │                  │
└─────────────────┘     └────────────────┘     └────────┬─────────┘
                                                         │
                    ┌────────────────────────────────────┼──────────┐
                    │                                    │          │
                    ▼                                    ▼          ▼
           ┌──────────────┐                    ┌──────────────┐
           │  CONFIRMED   │                    │  CANCELLED   │
           │  (Approved)  │                    │  (Rejected)  │
           └──────┬───────┘                    └──────────────┘
                  │
          ┌───────┴────────┐
          ▼                ▼
  ┌──────────────┐  ┌──────────────┐
  │  COMPLETED   │  │  STAGGERED   │
  │  (Full pay)  │  │  (Partial    │
  │              │  │   disbursem.) │
  │  • Deductions │  │              │
  │  • Tax       │  │  • Multiple  │
  │  • Ledger    │  │    payments  │
  └──────────────┘  └──────────────┘
```

---

## Key Entities & Statuses

| Entity | Purpose | Statuses |
|---|---|---|
| `payroll_entry` | One service's earnings | `PENDING` → `REQUESTED` → `CONFIRMED` → `PAID` / `CANCELLED` |
| `payroll_request` | Batch of entries for payout | `REQUESTED` → `CONFIRMED` → `COMPLETED` / `CANCELLED` |
| `payroll_disbursement` | Partial payment within a request | `PENDING` → `COMPLETED` / `CANCELLED` |
| `payroll_deductions` | Advance / deduction / adjustment | `PENDING` → `DEDUCTED` / `CANCELLED` |
| `payroll_staff_rate` | Commission split definition | `Active` / `Inactive` |
| `rate_levels` | Artist seniority tiers | `Active` / `Inactive` |

---

## Key Files

| File | Purpose |
|---|---|
| `server/actions/payroll.ts` | Core payroll server actions (entries, requests, rates, deductions, summaries) |
| `server/actions/payroll-disbursements.ts` | Staggered disbursement management |
| `server/actions/payroll-schemas.ts` | Zod validation schemas for all payroll operations |
| `server/db/schema/payroll.ts` | Database schema (tables, relations, indexes) |
| `server/db/schema/rate-levels.ts` | Rate levels schema |
| `utils/types/payroll.ts` | TypeScript types and interfaces |
| `app/payroll/payrollPage.tsx` | Admin payroll UI (6 tabs) |
| `app/my-payroll/myPayrollPage.tsx` | Staff-facing "My Payroll" UI |
