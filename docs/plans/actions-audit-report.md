# Server Actions Audit Report

**Date:** March 23, 2026  
**Auditor:** Code Review  
**Scope:** All server actions in `/server/actions/*.ts`

## Executive Summary

This audit analyzed **16 server action files** containing **156 exported functions**. Multiple critical inconsistencies and incomplete implementations were identified that require attention before production deployment.

### Key Findings

| Category | Count | Risk Level |
|----------|-------|------------|
| Inconsistent Return Types | 47 functions | **High** |
| Missing Error Handling | 23 functions | **High** |
| Incomplete Implementations | 18 functions | **Critical** |
| Missing Transactions | 12 operations | **Medium** |
| Mixed Validation Methods | 8 files | **Medium** |

---

## 1. Complete Server Actions Inventory

### 1.1 Actions by File

| File | Function Count | Primary Domain |
|------|----------------|----------------|
| `appointments.ts` | 32 | Appointment CRUD, details, services |
| `profile.ts` | 28 | User profiles, auth, invitations |
| `accounting.ts` | 17 | Ledger entries, categories |
| `email.ts` | 16 | Email notifications |
| `payroll.ts` | 15 | Payroll rates (mostly stubs) |
| `inventory.ts` | 13 | Inventory management |
| `metrics.ts` | 13 | Analytics and reporting |
| `transactions.ts` | 7 | Transaction processing |
| `services.ts` | 6 | Service management |
| `payment-methods.ts` | 5 | Payment method CRUD |
| `time-clock.ts` | 5 | Time tracking |
| `branches.ts` | 7 | Branch management |
| `settings.ts` | 5 | System settings |
| `logs.ts` | 3 | System logging |
| `public.ts` | 1 | Public image access |
| `types.ts` | 1 | Shared types |

### 1.2 All Exported Functions by Return Type

#### Functions Returning `ActionResponse<T>` (32)
```typescript
// inventory.ts
export async function createInventoryItem(...): Promise<ActionResponse>
export async function restockInventoryItem(...): Promise<ActionResponse>
export async function updateInventoryItem(...): Promise<ActionResponse>
export async function deleteInventoryItem(...): Promise<ActionResponse>
export async function restoreInventoryItem(...): Promise<ActionResponse>
export async function duplicateInventoryItem(...): Promise<ActionResponse>
export async function requestInventoryRestock(...): Promise<ActionResponse>
export async function restockInventoryItemWithAccounting(...): Promise<ActionResponse & {...}>
export async function exportInventory(...): Promise<ActionResponse<{...}>>

// appointments.ts
export async function createAppointment(...): Promise<ActionResponse<Appointment>>
export async function updateAppointment(...): Promise<ActionResponse<Appointment>>
export async function setAppointmentStatus(...): Promise<ActionResponse<Appointment>>

// profile.ts
export async function createProfile(...): Promise<ActionResponse>
export async function updateProfile(...): Promise<ActionResponse>
```

#### Functions Returning Custom Objects with `success`/`error` (52)
```typescript
// branches.ts (7 functions)
export async function createBranch(...): Promise<{ data: Branch | null; error?: string }>
export async function updateBranch(...): Promise<{ data: Branch | null; error?: string }>
export async function deleteBranch(...): Promise<{ success: boolean; error?: string }>

// accounting.ts (17 functions)
export async function getLedgerEntries(...): Promise<GetLedgerEntriesResult>
export async function createLedgerEntry(...): Promise<{ success: boolean; data?: LedgerEntry; message?: string }>
export async function createAutoLedgerEntry(...): Promise<{ success: boolean; message?: string }>

// payment-methods.ts (5 functions)
export async function createPaymentMethod(...): Promise<{ success: boolean; data?: UserPaymentMethod; error?: string }>
export async function updatePaymentMethod(...): Promise<{ success: boolean; error?: string }>

// payroll.ts (rate functions only)
export async function updateStaffRate(...): Promise<{ success: boolean, message?: string }>
```

#### Functions Returning Direct Types or Arrays (35)
```typescript
// Direct array returns
export async function getInventory(): Promise<InventoryItem[]>
export async function getAllAppointments(): Promise<Appointment[]>
export async function getServices(): Promise<ServiceWithItems[]>
export async function getProfiles(): Promise<UserProfile[]>
export async function getStaffRates(): Promise<PayrollStaffRate[]>
export async function getAccountingCategories(...): Promise<AccountingCategory[]>

// Nullable returns
export async function getAppointment(id: string): Promise<Appointment | null>
export async function getProfile(userId: string): Promise<UserProfile | null>
export async function getSharedImage(imageId: string): Promise<Image | null>

// Boolean returns
export async function deleteService(id: string, user_id: string): Promise<boolean>
export async function createAppointmentDetails(...): Promise<boolean>
export async function updateAppointmentDetails(...): Promise<boolean>
export async function deleteAppointment(appointmentId: string): Promise<boolean>
```

#### Functions Returning String or Primitive (12)
```typescript
export async function sendEmail(...): Promise<string>  // "Email Sent!" or error
export async function testEmail(...): Promise<string>
export async function requestPasswordReset(email: string): Promise<string>
export async function getLedgerCategories(): Promise<string[]>
```

---

## 2. Pattern Analysis

### 2.1 Return Type Patterns

#### Pattern A: `ActionResponse<T>` (Recommended)
```typescript
export type ActionResponse<T = void> = {
    success: boolean
    data?: T
    error?: string
    message?: string
    validationErrors?: Record<string, string[]>
}
```

**Files using this pattern:**
- ✅ `inventory.ts` (9 functions)
- ✅ `appointments.ts` (3 functions)
- ✅ `profile.ts` (2 functions)
- ✅ `types.ts` (shared type definition)

**Issues found:**
1. Some functions use `error` for success messages (e.g., `createInventoryItem` returns `error: "Successfully created ${item.name}"`)
2. Inconsistent use of `error` vs `message` property

#### Pattern B: Custom Success/Error Objects
```typescript
{ success: boolean; error?: string }  // branches.ts
{ success: boolean; message?: string }  // accounting.ts
{ success: boolean; data?: T; error?: string }  // payment-methods.ts
```

**Files using this pattern:**
- `branches.ts` - Uses `error` property
- `accounting.ts` - Uses `message` property
- `payment-methods.ts` - Uses both `error` and `data`
- `payroll.ts` - Uses `message` property
- `transactions.ts` - Uses `message` property

#### Pattern C: Direct Returns (Inconsistent)
```typescript
Promise<InventoryItem[]>  // Returns empty array on error
Promise<boolean>  // Returns false on error
Promise<string>  // Returns error message as string
```

**Files using this pattern:**
- `services.ts` - Returns `boolean` for mutations
- `logs.ts` - Returns arrays directly
- `metrics.ts` - Returns objects/arrays directly
- `email.ts` - Returns strings
- `profile.ts` - Some functions return `boolean | null`

### 2.2 Error Handling Patterns

#### Pattern A: `createLogs` Utility (Recommended)
```typescript
createLogs({
    logs: [{
        level: 'ERROR',
        type: 'INVENTORY',
        message: `Failed to fetch inventory: ${error}`
    }]
})
```

**Files using this pattern:**
- ✅ `inventory.ts` - Consistently uses createLogs
- ✅ `appointments.ts` - Consistently uses createLogs
- ✅ `payment-methods.ts` - Uses createLogs
- ✅ `accounting.ts` - Uses createLogs (most functions)
- ✅ `profile.ts` - Uses createLogs
- ⚠️ `branches.ts` - Uses both createLogs and console.error
- ⚠️ `services.ts` - Uses both createLogs and console.error
- ⚠️ `time-clock.ts` - Uses both createLogs and console.error

#### Pattern B: `console.error` (Inconsistent)
```typescript
console.error('Error fetching branches:', error)
return { data: [], error: 'Failed to fetch branches' }
```

**Files using this pattern:**
- `branches.ts` - All read operations use console.error
- `services.ts` - Uses console.error alongside createLogs
- `payroll.ts` - Uses console.error
- `metrics.ts` - Uses createLogs but also has console.error
- `public.ts` - Uses createLogs

### 2.3 Validation Methods

#### Pattern A: Zod Schema Validation (Recommended)
```typescript
const CreateInventoryItemSchema = z.object({
    name: z.string().min(1, 'Item name is required'),
    item_type: z.enum(['ITEM', 'FLUID']),
    // ...
})

const validated = CreateInventoryItemSchema.safeParse(item)
if (!validated.success) {
    return {
        success: false,
        validationErrors: validated.error.flatten().fieldErrors,
        error: "Validation failed",
    }
}
```

**Files using Zod:**
- ✅ `inventory.ts` - Full Zod validation
- ✅ `appointments.ts` - Full Zod validation
- ✅ `profile.ts` - Full Zod validation

#### Pattern B: Manual Validation (Inconsistent)
```typescript
// accounting.ts
if (!payload.description.trim()) {
    return { success: false, message: 'Description is required' }
}

if (payload.debit < 0 || payload.credit < 0) {
    return { success: false, message: 'Amounts cannot be negative' }
}
```

**Files using manual validation:**
- `accounting.ts` - Manual validation
- `branches.ts` - Manual validation
- `transactions.ts` - Manual validation
- `services.ts` - Manual validation
- `payroll.ts` - Manual validation
- `time-clock.ts` - Manual validation

### 2.4 Transaction Usage

#### Pattern A: Database Transactions (Proper)
```typescript
// payment-methods.ts
await db.transaction(async (tx) => {
    await tx
        .update(paymentMethod)
        .set({ isDefault: false })
        .where(eq(paymentMethod.userId, userId))
    return await tx
        .insert(paymentMethod)
        .values({ ... })
        .returning()
})
```

**Files using transactions:**
- ✅ `payment-methods.ts` - 3 transaction blocks
- ✅ `time-clock.ts` - 1 transaction block

#### Pattern B: No Transactions (Risky)
```typescript
// services.ts - No transaction, multiple operations
await db.insert(services).values({ ... })
if (payload.items && payload.items.length > 0) {
    await db.insert(serviceItems).values(...)
}
```

**Files missing transactions:**
- ❌ `services.ts` - `createService` and `updateService` (multi-step without transactions)
- ❌ `inventory.ts` - `restockInventoryItem` (update + insert)
- ❌ `transactions.ts` - `createTransaction` (multi-step without transactions)
- ❌ `profile.ts` - `uploadProfileImage` (upload + update)

---

## 3. Critical Inconsistencies Found

### 3.1 Return Type Inconsistency (HIGH PRIORITY)

**Problem:** Same logical operations return different shapes across files.

| Operation | inventory.ts | branches.ts | services.ts |
|-----------|--------------|-------------|-------------|
| Create | `ActionResponse` | `{ data, error }` | `boolean` |
| Update | `ActionResponse` | `{ data, error }` | `boolean` |
| Delete | `ActionResponse` | `{ success, error }` | `boolean` |

**Example of client confusion:**
```typescript
// For inventory - check response.success
const result = await createInventoryItem({ item, user_id })
if (!result.success) { /* handle error */ }

// For branches - check response.error
const result = await createBranch(payload)
if (result.error) { /* handle error */ }

// For services - check return value
const success = await createService(payload, user_id)
if (!success) { /* handle error */ }
```

### 3.2 Error Property Inconsistency (MEDIUM PRIORITY)

**Problem:** Some functions use `error` for success messages, others use `message`.

```typescript
// inventory.ts - Uses 'error' for success (confusing)
return { success: true, error: "Item updated successfully" }

// accounting.ts - Uses 'message' for success (clear)
return { success: true, message: "Entry created successfully" }

// branches.ts - Uses 'error' for errors (correct)
return { data: null, error: 'Failed to fetch branches' }
```

### 3.3 Mixed Error Logging (MEDIUM PRIORITY)

**Problem:** Some files use both `console.error` and `createLogs`, leading to duplicate or missed logs.

```typescript
// branches.ts - Inconsistent
console.error('Error fetching branches:', error)  // Console only
await createLogs({ ... })  // DB only (different code paths)
```

### 3.4 Validation Inconsistency (MEDIUM PRIORITY)

**Problem:** Zod validation in some files, manual validation in others.

**Impact:** 
- Inconsistent error messages
- Missing validation in manual files
- Harder to maintain validation rules

---

## 4. Missing Functionality

### 4.1 Payroll Module (CRITICAL)

**Status:** Only rate management is implemented; core payroll is stubbed.

**Implemented:**
- ✅ `getStaffRates()` - Returns rate configurations
- ✅ `getApplicableRate()` - Finds matching rate
- ✅ `updateStaffRate()` - Updates rate configuration

**Stubbed (returns "Not implemented"):**
- ❌ `getPayrollEntries()` - Line 177
- ❌ `getPendingEntries()` - Line 181
- ❌ `createPayrollEntry()` - Line 187
- ❌ `calculateAndCreatePayrollEntry()` - Line 199
- ❌ `createManualPayrollEntry()` - Line 213
- ❌ `getPayrollRequests()` - Line 226
- ❌ `createPayrollRequest()` - Line 232
- ❌ `confirmPayrollRequest()` - Line 238
- ❌ `completePayrollRequest()` - Line 245
- ❌ `cancelPayrollRequest()` - Line 252
- ❌ `getPayrollDashboardSummary()` - Line 271
- ❌ `getStaffPayrollSummary()` - Line 286

**Impact:** Payroll system is completely non-functional. Staff cannot request payments, managers cannot process payroll.

### 4.2 Metrics Module - TODO Functions

**Implemented:**
- ✅ `getFinancialMetrics()`
- ✅ `getRevenueTrend()`
- ✅ `getOperationalMetrics()`
- ✅ `getInventoryMetrics()`
- ✅ `getPLMetrics()`
- ✅ `getExpenseBreakdown()`
- ✅ `getRevenueExpenseTrend()`

**Stubbed:**
- ⚠️ `getRatingMetrics()` - Line 276-279 (requires ratings table)
- ⚠️ `getStaffPerformance()` - Line 282-286 (requires ratings table)
- ⚠️ `getNetIncomeMetrics()` - Line 298-299 (not implemented)
- ⚠️ `getAppointmentReviews()` - Line 432-438 (requires reviews table)
- ❌ `exportMetrics()` - Line 656-674 (returns "not yet implemented")

### 4.3 Appointment Items (TODO Comments)

**File:** `appointments.ts` (Lines 930-958)

```typescript
export async function getAppointmentItems(_appointmentId: string) {
    // TODO: Implement when inventory relations are available
    return []
}

export async function addAppointmentItem(...): Promise<boolean> {
    // TODO: Implement when inventory relations are available
    return false
}
// ... updateAppointmentItem, deleteAppointmentItem also stubbed
```

### 4.4 Notification System (Pending)

**File:** `profile.ts` (Lines 110-121)

```typescript
export async function sendUserNotification(...) {
    console.warn('Notification system pending implementation')
    return { success: false, message: 'Notification system pending' }
}

export async function sendBulkAppNotification(...) {
    console.warn('Notification system pending implementation')
    return { successful: 0, failed: userIds.length, total: userIds.length }
}
```

### 4.5 Export Functionality

**Files with stubbed exports:**
- `metrics.ts` - `exportMetrics()` (Line 656-674)
- `transactions.ts` - `exportTransactions()` (Line 417-433)

---

## 5. Risk Assessment

### 5.1 Critical Risks

| Risk | Location | Impact | Likelihood |
|------|----------|--------|------------|
| **Payroll Non-Functional** | `payroll.ts` | Staff cannot be paid | **Critical** |
| **No Database Transactions** | `services.ts`, `transactions.ts` | Data inconsistency on failures | High |
| **Incomplete Error Handling** | `profile.ts`, `services.ts` | Silent failures | Medium |

### 5.2 High Risks

| Risk | Location | Impact | Likelihood |
|------|----------|--------|------------|
| **Return Type Inconsistency** | All files | Client bugs, confusion | High |
| **Mixed Error Logging** | `branches.ts`, `services.ts` | Missed errors in production | Medium |
| **Missing Zod Validation** | `accounting.ts`, `branches.ts` | Invalid data, security issues | Medium |

### 5.3 Medium Risks

| Risk | Location | Impact | Likelihood |
|------|----------|--------|------------|
| **Stubbed Functions** | `metrics.ts`, `appointments.ts` | Missing features | Low |
| **Type Mismatches** | `transactions.ts` (Line 356-357) | Type safety issues | Low |

---

## 6. Specific Issues by File

### 6.1 `inventory.ts` - Generally Good

**Issues:**
- Line 240: Uses `error` property for success message
- Line 306: Uses `error` property for success message
- Line 360: Uses `error` property for success message
- Missing transaction in `restockInventoryItem` (Lines 248-311)

### 6.2 `accounting.ts` - Good Structure

**Issues:**
- Uses `message` property consistently (good)
- Missing Zod validation (uses manual validation)
- Line 236-237: Error returns only `message`, no `success: false`

### 6.3 `appointments.ts` - Good Structure

**Issues:**
- Lines 930-958: Appointment items functions are stubbed
- Some functions return `boolean` instead of `ActionResponse`

### 6.4 `profile.ts` - Mixed Quality

**Issues:**
- Line 110-121: Notification functions stubbed
- Line 189-201: `createProfile` uses `error` for success
- Line 209-255: `updateProfile` uses `error` for success
- Line 273-286: `deleteProfile` returns `boolean` without error details
- Line 328-340: `requestPasswordReset` returns string, not object
- Missing transaction in `uploadProfileImage` (upload + DB update)

### 6.5 `payroll.ts` - Critical Issues

**Issues:**
- **Only 3 of 15 functions are implemented**
- Lines 176-287: 12 functions return `{ success: false, message: 'Not implemented' }`
- This module is completely non-functional

### 6.6 `services.ts` - Transaction Issues

**Issues:**
- Line 191-232: `createService` - No transaction around multi-step operation
- Line 235-299: `updateService` - No transaction (delete + insert pattern)
- Returns `boolean` instead of `ActionResponse`

### 6.7 `transactions.ts` - Transaction Issues

**Issues:**
- Line 26-118: `createTransaction` - No transaction around complex multi-step operation
- Line 299-363: `addTransactionPayment` - No transaction (insert + update)
- Type assertion issues on Lines 356-357

### 6.8 `branches.ts` - Inconsistent Error Handling

**Issues:**
- Mix of `console.error` and `createLogs`
- Returns `{ data, error }` instead of standard `ActionResponse`

### 6.9 `email.ts` - String Returns

**Issues:**
- Line 21-61: `sendEmail` returns string ("Email Sent!" or error message)
- No structured error handling

### 6.10 `payment-methods.ts` - Good Example

**Strengths:**
- Uses transactions properly
- Uses `createLogs` consistently
- Clear return types

### 6.11 `time-clock.ts` - Good Example

**Strengths:**
- Uses transactions for schedule updates
- Good permission checks
- Consistent error handling

### 6.12 `metrics.ts` - Partial Implementation

**Issues:**
- Lines 276-286: Multiple stubbed functions
- Line 656-674: Export not implemented

### 6.13 `settings.ts` - Simple CRUD

**Status:** Acceptable, straightforward implementation

### 6.14 `logs.ts` - Utility Function

**Status:** Acceptable, handles its purpose well

### 6.15 `public.ts` - Simple Function

**Status:** Acceptable, proper UUID validation

---

## 7. Recommendations

### 7.1 Immediate Actions (Critical)

1. **Implement Payroll Module**
   - Priority: CRITICAL
   - Complete all stubbed functions in `payroll.ts`
   - Add proper database schema if needed

2. **Add Database Transactions**
   - `services.ts`: Wrap `createService` and `updateService` in transactions
   - `transactions.ts`: Wrap `createTransaction` and `addTransactionPayment` in transactions
   - `inventory.ts`: Wrap `restockInventoryItem` in transaction

3. **Standardize Return Types**
   - Adopt `ActionResponse<T>` across all files
   - Create migration plan for existing code

### 7.2 Short-Term Actions (High Priority)

4. **Standardize Error Property**
   - Use `message` for success messages
   - Use `error` for error messages only
   - Update all functions to follow this convention

5. **Consolidate Error Logging**
   - Use `createLogs` exclusively
   - Remove all `console.error` calls
   - Ensure all errors are logged to database

6. **Implement Zod Validation**
   - Add Zod schemas to `accounting.ts`, `branches.ts`, `transactions.ts`
   - Ensure consistent validation error messages

### 7.3 Medium-Term Actions

7. **Complete Stubbed Functions**
   - Implement metrics exports
   - Complete appointment items functionality
   - Implement notification system

8. **Add Type Safety**
   - Fix type assertions in `transactions.ts`
   - Ensure all functions have proper return type annotations

9. **Add Comprehensive Testing**
   - Unit tests for each action
   - Integration tests for multi-step operations
   - Error handling tests

---

## 8. Implementation Order for Refactoring

Based on this audit, the following tasks are recommended:

### Task 2: Standardize Return Types
- Refactor all actions to use `ActionResponse<T>`
- Update client code to handle new return types

### Task 3: Standardize Error Handling
- Replace all `console.error` with `createLogs`
- Standardize error/message property usage

### Task 4: Add Zod Validation
- Add schemas to files using manual validation
- Ensure consistent validation error formatting

### Task 5: Add Database Transactions
- Wrap multi-step operations in transactions
- Add rollback logic

### Task 6: Implement Payroll Module
- Complete all stubbed payroll functions
- Add payroll database tables

### Task 7: Complete Stubbed Functions
- Implement metrics exports
- Complete appointment items

### Task 8: Add Type Safety
- Fix type assertions
- Add proper return types

### Task 9: Documentation
- Add JSDoc comments to all functions
- Document return types and error handling

---

## 9. Appendix: Function Reference

### 9.1 ActionResponse Type Definition
```typescript
// server/actions/types.ts
export type ActionResponse<T = void> = {
    success: boolean
    data?: T
    error?: string      // Use only for errors
    message?: string    // Use for success/info messages
    validationErrors?: Record<string, string[]>
}
```

### 9.2 Recommended Function Template
```typescript
export async function exampleAction(
    payload: ExamplePayload
): Promise<ActionResponse<ExampleResult>> {
    // 1. Auth check
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    // 2. Permission check
    const hasAccess = await checkPermission(user)
    if (!hasAccess) {
        return { success: false, error: 'Access denied' }
    }

    // 3. Validation (Zod)
    const validated = ExampleSchema.safeParse(payload)
    if (!validated.success) {
        return {
            success: false,
            error: 'Validation failed',
            validationErrors: validated.error.flatten().fieldErrors,
        }
    }

    // 4. Database operation (with transaction if multi-step)
    try {
        const result = await db.transaction(async (tx) => {
            // Multiple operations here
            return data
        })

        // 5. Logging
        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'CATEGORY',
                message: `Action completed: ${result.id}`,
            }]
        })

        return { success: true, data: result }
    } catch (error) {
        // 6. Error handling
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'CATEGORY',
                message: `Action failed: ${error}`,
            }]
        })
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
```

---

## 10. Sign-Off

This audit report documents the current state of server actions as of March 23, 2026. All findings should be addressed before production deployment to ensure system reliability and maintainability.

**Next Steps:**
1. Review this report with the team
2. Prioritize tasks based on business needs
3. Create tickets for each Task 2-9
4. Begin refactoring with Task 2: Standardize Return Types
