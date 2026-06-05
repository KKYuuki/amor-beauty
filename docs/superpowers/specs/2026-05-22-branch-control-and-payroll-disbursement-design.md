# Architectural Spec: Global Branch Control & Payroll Admin Disbursement View

**Date:** 2026-05-22
**Status:** Approved for Implementation

---

## Part 1: Global Branch Control

### 1.1 Problem

Currently, `BranchSelector` is placed individually in **12+ page headers**, creating inconsistency and redundancy. Each page manually reads `currentBranch` from `useBranchContext()` to filter data. The branch switch is buried in page content instead of being globally accessible.

### 1.2 Solution

Move a single `BranchSelector` into the **sidebar** (above route navigation groups) so it provides global, branch-scoped filtering for the entire application. Remove all page-level selectors.

### 1.3 Architecture

#### Provider Hierarchy (unchanged)

```
app/layout.tsx (Server)
  BranchProvider (Client)          ← already wraps everything
    Sidebar (Client)
      Profile Header
      BranchSelector (MOVED HERE) ← new placement
      Route Groups (Core / Management / Admin)
      Logout
    Page Content                    ← no more BranchSelector instances
```

#### Data Flow

1. **User selects branch** → `BranchSelector` calls `setCurrentBranch(branch)` on `BranchContext`
2. **Context updates** → `currentBranch` state changes
3. **sessionStorage** persisted (unchanged from `utils/branch-storage.ts`)
4. **Pages re-render** → all consumers of `useBranchContext()` get the new value
5. **Server actions** → pages pass `currentBranch?.id` as query parameters
6. **Client-side filtering** → pages filter data via `useMemo` using `currentBranch`

#### BranchSelector Behavior

- **"All Branches"** = `currentBranch: null` — pages show unfiltered data
- **Specific branch** = `currentBranch: Branch` — pages filter by `currentBranch.id`
- **Single branch only** → display as static text (no dropdown)
- **No branches** → disabled "No branches" state
- **Collapsed sidebar** → show only the `Building2` icon

### 1.4 Migration Plan (Pages to Modify)

| Page | Filter Method | Action |
|------|-------------|--------|
| `app/payroll/payrollPage.tsx` | Server (`branchId` param) | Remove `BranchSelectorInline`. Already uses `currentBranch?.id`. |
| `app/accounting/accountingPage.tsx` | Mixed | Remove `BranchSelector`. Verify passes `currentBranch?.id`. |
| `app/transactions/transactionsPage.tsx` | Server | Remove `BranchSelector`. Verify passes `currentBranch?.id`. |
| `app/inventory/inventoryPage.tsx` | Client (`useMemo`) | Remove `BranchSelector`. `branchFilteredItems` already reads `currentBranch` ✅ |
| `app/calendar/calendarPage.tsx` | Client (`useMemo`) | Remove both `BranchSelector` instances. `branchFilteredAppointments` already reads `currentBranch` ✅ |
| `app/appointments/appointmentsPage.tsx` | Client (`useMemo`) | Remove `BranchSelector`. Already filters by `currentBranch` ✅ |
| `app/sales/salesPage.tsx` | Server | Remove `BranchSelector`. SalesContext already reads `currentBranch` ✅ |
| `app/metrics/metricsPage.tsx` | Server | Remove `BranchSelectorInline`. Already passes `currentBranch?.id` ✅ |
| `app/config/configPage.tsx` | Client | Remove both BranchSelector instances. The **service form** still needs a branch-assignment field (use `BranchSelectorInline` from `components/ui/branch-selector-inline.tsx`). |
| `app/notify/notifyPage.tsx` | Server | Remove `BranchSelector`. Already reads `currentBranch` ✅ |
| `components/clock/QRCodeDisplay.tsx` | Context | Remove `BranchSelector forceSelect`. If `currentBranch` is null, show an inline message: "Select a branch from the sidebar to view QR codes" with a muted/disabled state. |
| `app/(app)/admin/logs/page.tsx` | Server | **KEEP** — uses standalone `components/ui/branch-selector.tsx` as a log filter, independent of global context. |

### 1.5 Files Changed

**Modified:**
- `components/sidebar.tsx` — import and render `BranchSelector` between profile header and route links

**Cleaned (remove BranchSelector import + usage):**
- `app/payroll/payrollPage.tsx`
- `app/accounting/accountingPage.tsx`
- `app/transactions/transactionsPage.tsx`
- `app/inventory/inventoryPage.tsx`
- `app/calendar/calendarPage.tsx`
- `app/appointments/appointmentsPage.tsx`
- `app/sales/salesPage.tsx`
- `app/metrics/metricsPage.tsx`
- `app/config/configPage.tsx`
- `app/notify/notifyPage.tsx`
- `components/clock/QRCodeDisplay.tsx`

**Config page note:** In `configPage.tsx`, the service form's branch assignment field (`BranchSelector` for setting a service's branch) must be replaced with `BranchSelectorInline` from `components/ui/branch-selector-inline.tsx` — this is a form field, not a context switch.

### 1.6 Edge Cases

| Scenario | Behavior |
|----------|----------|
| No branches exist | Selector shows disabled "No branches" state; pages show unfiltered |
| Single branch only | Selector renders as static text (no dropdown) |
| Branch fetch fails | Selector shows error state; pages fall back to unfiltered |
| Loading state | Selector shows skeleton; pages load without filter |
| sessionStorage cleared | Defaults to first branch or "All Branches" on next load |
| New branch added by admin | Refresh re-fetches branches; invalid stored ID falls back |

### 1.7 Security

- Branch filtering is a UI convenience, not an access control mechanism
- Server actions enforce permissions independently
- QR Clock `forceSelect` replaced with sidebar prompt

---

## Part 2: Payroll Admin Disbursement View

### 2.1 Problem

The admin payroll page (`/payroll`) has no way to see a period-based breakdown of earnings across all staff — something the "My Payroll" (`/my-payroll`) page provides for individual staff. The admin Dashboard tab only shows summary stats (hardcoded to "this month") and a flat list of staff with pending totals. Admin cannot:
- See what was earned in a custom date range
- Drill into a staff member's detailed earnings for a period
- Create payment requests from a period-based view

### 2.2 Solution

**Enhance the existing Dashboard tab** on the Payroll Management page with:
1. A **date range selector** (presets + custom)
2. **Expandable staff earnings rows** (replaces flat staff list)
3. An **earnings detail panel** (compact entry list with selection checkboxes)
4. Integration with existing **StaffRequestModal** for request creation

### 2.3 Server Action Changes

#### Enhanced: `getPayrollDashboardSummary(branchId?, dateFrom?, dateTo?)`
- **Current:** Hardcoded to current month
- **Change:** Add optional `dateFrom` / `dateTo` params. If omitted, defaults to current month (backward compatible). Summary cards reflect the selected period.

#### Enhanced: `getStaffPayrollSummary(branchId?, dateFrom?, dateTo?)`
- **Current:** Shows ALL pending entries (unbounded)
- **Change:** Add optional `dateFrom` / `dateTo` params. Filters pending entries to the selected period.

#### New: `getStaffEarningsForPeriod(staffId, dateFrom, dateTo, branchId?)`
- Wraps existing `getPayrollEntries()` with staff + date range filter
- Adds optional `branchId` filter (via transaction join) for branch-scoped queries
- Returns entries with payment status, sorted by `service_date` descending
- No pagination (capped to typical range; max 50 entries default)

#### Enhanced: `getPayrollEntries(options)`
- Add optional `branchId` filter to the existing `options` parameter
- Filters entries via transaction join (entries → transactions → branch_id)
- Backward compatible: omitted branchId returns unfiltered results

#### Reused (no changes):
- `createPayrollRequest()` — admin-selected entries → payment request

### 2.4 UI Component Changes

#### `DashboardTab` (modified — `payrollPage.tsx`)

```
DashboardTab
├── DateRangeSelector (NEW)
│   ├── Preset buttons: Today | This Week | This Month | This Year | All
│   └── Custom date inputs (shown when no preset matches)
├── Summary Cards (4) — now date-range aware
│   Pending | Requested | Confirmed | Paid (this period)
└── StaffEarningsList (NEW — replaces flat staff list)
    └── StaffEarningsRow (NEW, collapsible per staff)
        ├── Header: Staff name, total earned, pending, paid
        └── EarningsDetailPanel (NEW, shown when expanded)
            ├── Compact entry list (date | service | amount | status badge)
            ├── Checkboxes per entry + "Select All"
            ├── Selected total display
            └── "Create Payment Request" button
                └── → StaffRequestModal (REUSED, admin context)
```

#### `DateRangeSelector` (new component)
- Preset buttons in a row (pill-style toggle)
- Active preset highlighted
- Custom dates: two date inputs below presets, shown when no preset is active
- Calls `onChange({ dateFrom: string, dateTo: string })` on selection
- Responsive: presets wrap on mobile

#### `StaffEarningsRow` (new component)
- Collapsible `motion.div` with `AnimatePresence`
- Header row: staff avatar/initial, name, total earned, pending amount, paid amount
- Chevron icon indicates expand/collapse state
- $0 pending → muted styling
- On expand: lazy-fetches `getStaffEarningsForPeriod()`

#### `EarningsDetailPanel` (new component)
- Compact entry list (similar to My Payroll list view)
- Each entry shows: checkbox, service date, service description, service type badge, gross amount, staff cut, payment status badge
- Status badge colors match existing pattern (PENDING=yellow, REQUESTED=orange, CONFIRMED=blue, PAID=green)
- Footer: selected count + total amount, "Create Payment Request" button
- Empty state: "No earnings in this period for [staff name]"

### 2.5 Key Behaviors

- **Date range change** → refreshes summary cards AND lazy-fetches on re-expand
- **Branch change** (via global sidebar) → full dashboard refresh
- **Staff row expand** → lazy-fetch (no preload), loading spinner shown
- **Request creation** → selected entries → `createPayrollRequest()` → success toast → entries removed from pending → auto-navigate to Requests tab
- **Multiple expanded rows** → allowed, each independent
- **All entries already paid/requested** → "Create Request" button disabled with explanation

### 2.6 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Staff has no entries for period | Row shows "₱0.00". Expand shows "No earnings in this period" |
| All entries already paid/requested | Row muted. No selectable entries. Button disabled. |
| Large date range (1 year+) | Existing pagination (50/page). "Load more" if applicable. |
| Request creation fails (concurrent) | Error notification. Entries remain selected. Retry allowed. |
| Staff deactivated | Still visible if has pending entries in period. |
| Empty branch selection ("All Branches") | Shows data across all branches (or none, depending on global switch) |

### 2.7 Security

- Page remains guarded by `canManagePayroll()` in `app/payroll/page.tsx`
- Admin context in `StaffRequestModal` creates request with `requested_by: admin`
- No changes to `createPayrollRequest()` permissions — it already validates access
- `getStaffEarningsForPeriod()` guarded server-side (only admins/managers can query other staff)

---

## Part 3: Implementation Order

The two features are independent and can be implemented in parallel or sequence.

### Recommended Order

1. **Branch Control** (lower risk, foundation for other work)
   - Add `BranchSelector` to `sidebar.tsx`
   - Remove from 11 pages (audit each for correct filtering)
   - Handle Config service form branch field replacement
   - Handle QR Clock forceSelect removal
   - Test with "All Branches" → pages show unfiltered

2. **Payroll Admin View** (builds on the branch foundation)
   - Enhance `getPayrollDashboardSummary()` with date range
   - Enhance `getStaffPayrollSummary()` with date range
   - Create `getStaffEarningsForPeriod()`
   - Add `branchId` filter to `getPayrollEntries()`
   - Build `DateRangeSelector` component
   - Build `StaffEarningsRow` + `EarningsDetailPanel`
   - Wire into `DashboardTab`
   - Test with date range changes and branch filter

---

## Part 4: Non-Goals

- No changes to the "My Payroll" page (`/my-payroll`)
- No changes to authentication or authorization
- No changes to `utils/branch-storage.ts` or `utils/types/branch.ts`
- No changes to the branch management admin page (`/admin/branches`)
- No new routes or pages
- No changes to URL-based routing
- No changes to the existing payment request lifecycle (create → confirm → complete)
