# Accounting UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix trash voided entries display, add hard deletion, remove redundant payroll breakdown, and enrich entry creation notifications with date.

**Architecture:** Three independent phases — Phase 1 fixes the server-side filter bug and adds the hard delete server action. Phase 2 removes payroll breakdown (pure client cleanup). Phase 3 enriches the entry modal callback and notification. Phases 2 and 3 are independent but both modify `accountingPage.tsx`, so they are sequenced.

**Tech Stack:** Next.js 14 (App Router), React Server Actions, Drizzle ORM, TypeScript, Tailwind CSS, Framer Motion

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/actions/accounting.ts` | Modify | Fix `voided_only` filter bug; add `hardDeleteLedgerEntry` action |
| `app/accounting/accountingPage.tsx` | Modify | Remove payroll breakdown; add hard delete button + modal; enrich notification |
| `components/accounting/EntryModal.tsx` | Modify | Change `onSuccess` callback signature to carry entry details |

---

## Phase 1: Trash Fix + Hard Delete (Server-Side)

### Task 1: Fix `voided_only` Filter Bug in `getLedgerEntries`

**Files:**
- Modify: `server/actions/accounting.ts:174–181`

**Why:** The `voided_only` and default `!include_voided` filters conflict, appending both `isVoided = false` AND `isVoided = true` to the WHERE clause, returning zero rows.

- [ ] **Step 1: Replace the contradictory filter logic**

In `server/actions/accounting.ts`, find this block (lines 174–181):

```typescript
        // Exclude voided entries by default
        if (!filters?.include_voided) {
            conditions.push(eq(generalLedger.isVoided, false))
        }

        if (filters?.voided_only) {
            conditions.push(eq(generalLedger.isVoided, true))
        }
```

Replace with:

```typescript
        // Voided filter: voided_only takes priority, then default exclude, then include_voided
        if (filters?.voided_only) {
            conditions.push(eq(generalLedger.isVoided, true))
        } else if (!filters?.include_voided) {
            conditions.push(eq(generalLedger.isVoided, false))
        }
```

- [ ] **Step 2: Run TypeScript type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `accounting.ts`

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): resolve voided_only filter contradiction in getLedgerEntries"
```

### Task 2: Add `hardDeleteLedgerEntry` Server Action

**Files:**
- Modify: `server/actions/accounting.ts` (append after `restoreLedgerEntry`, ~line 1045)

**Why:** No permanent deletion mechanism exists. Only soft-delete (void) and restore are available. Hard delete is needed for cleaning up voided entries.

- [ ] **Step 1: Add the `hardDeleteLedgerEntry` function**

Append the following function after `restoreLedgerEntry` in `server/actions/accounting.ts`:

```typescript
export async function hardDeleteLedgerEntry(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized: admin access required')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Check if entry exists
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (!existing[0].isVoided) {
            return failure('Entry must be voided before permanent deletion')
        }

        // Check if period is locked
        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('Cannot permanently delete: this accounting period is locked')
            }
        }

        // Log BEFORE deletion so we have the audit trail
        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'ACCOUNTING',
                    message: `Ledger entry PERMANENTLY DELETED: ${id} (${existing[0].description}) by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        await db
            .delete(generalLedger)
            .where(eq(generalLedger.id, id))

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error permanently deleting ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to permanently delete ledger entry')
    }
}
```

- [ ] **Step 2: Run TypeScript type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `accounting.ts`

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "feat(accounting): add hardDeleteLedgerEntry server action for permanent deletion of voided entries"
```

---

## Phase 2: Remove Payroll Breakdown (Client-Side)

### Task 3: Remove Payroll Imports, State, and Callback

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Why:** Payroll Breakdown is now on a dedicated `/payroll` page. The duplicate in Accounting → Reports is redundant.

- [ ] **Step 1: Remove payroll imports**

In `app/accounting/accountingPage.tsx`, delete line 65:

```typescript
import { getPayrollEntries } from "@/server/actions/payroll"
```

And delete line 66:

```typescript
import { PayrollEntry } from "@/utils/types/payroll"
```

- [ ] **Step 2: Remove payroll state variables**

Delete lines 203–207:

```typescript
    const [showPayrollBreakdown, setShowPayrollBreakdown] = useState(false)
    const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([])
    const [payrollLoading, setPayrollLoading] = useState(false)
    const [payrollStaffFilter, setPayrollStaffFilter] = useState("")
    const [payrollServiceTypeFilter, setPayrollServiceTypeFilter] = useState<"ALL" | "TATTOO" | "PIERCING" | "SHOE">("ALL")
```

- [ ] **Step 3: Remove `fetchPayrollBreakdown` callback**

Delete lines 369–388 (the entire `fetchPayrollBreakdown` useCallback block):

```typescript
    // --- Payroll Breakdown Handler ---
    const fetchPayrollBreakdown = useCallback(async () => {
        setPayrollLoading(true)
        try {
            const dateFrom = datePreset === "custom" ? customStartDate : undefined
            const dateTo = datePreset === "custom" ? customEndDate : undefined
            const result = await getPayrollEntries({
                dateFrom,
                dateTo,
                pageSize: 100,
            })
            if (result.success && result.data) {
                setPayrollEntries(result.data.data)
            }
        } catch (error) {
            await logError({
                type: "ACCOUNTING",
                message: `Error fetching payroll breakdown: ${error instanceof Error ? error.message : String(error)}`,
            })
        } finally {
            setPayrollLoading(false)
        }
    }, [datePreset, customStartDate, customEndDate])
```

- [ ] **Step 4: Remove Payroll Breakdown JSX**

In the `activeTab === "reports"` block, delete the entire `Payroll Breakdown` section. This starts at the comment `{/* Payroll Breakdown */}` and ends just before the `</div>` closing the reports tab. The entire block from line ~1014 to ~1145 containing the collapsible button, filters, table, and CSV export must be removed.

Specifically, find this JSX and delete the entire block:

```tsx
                    {/* Payroll Breakdown */}
                    <div className='mb-4'>
                        <button
                            onClick={() => {
                                if (!showPayrollBreakdown) {
                                    fetchPayrollBreakdown()
                                }
                                setShowPayrollBreakdown(!showPayrollBreakdown)
                            }}
                            ...entire payroll breakdown section...
                        </div>
                    </div>
```

After removal, the reports tab should contain only the Trial Balance section.

- [ ] **Step 5: Run TypeScript type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `accountingPage.tsx` — all payroll references removed

- [ ] **Step 6: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "refactor(accounting): remove redundant payroll breakdown from reports tab — now on dedicated page"
```

---

## Phase 3: Hard Delete UI + Notification Enrichment (Client-Side)

### Task 4: Add Hard Delete Button and Modal to Trash Tab

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Why:** Users need the ability to permanently remove voided entries from the trash tab.

- [ ] **Step 1: Add `hardDeleteLedgerEntry` import**

In `app/accounting/accountingPage.tsx`, find the import block from `@/server/actions/accounting` (line ~56–63). Add `hardDeleteLedgerEntry` to the destructured imports:

```typescript
import {
    getLedgerEntries,
    getLedgerSummary,
    getAccountingCategories,
    voidLedgerEntry,
    exportLedger,
    getLedgerDetailBreakdown,
    getTrialBalance,
    TrialBalanceRow,
    LedgerSummary,
    AccountingCategory,
    restoreLedgerEntry,
    hardDeleteLedgerEntry,
} from "@/server/actions/accounting"
```

- [ ] **Step 2: Add hard delete modal state**

After the existing `showDeleteModal` state (line ~190), add:

```typescript
    const [showHardDeleteModal, setShowHardDeleteModal] = useState<LedgerEntry | null>(null)
```

- [ ] **Step 3: Add hard delete button next to restore button in trash table**

Find the trash table's Actions column cell containing the restore button (inside the `trashEntries.map()` block, near line ~1296). The current cell contains only one button. Replace the entire `<td>` with:

```tsx
                                            <td className='px-4 py-2 text-sm text-center'>
                                                <div className='flex items-center justify-center gap-2'>
                                                    <button
                                                        onClick={async () => {
                                                            const result = await restoreLedgerEntry(entry.id)
                                                            if (result.success) {
                                                                addNotification("Entry restored successfully", "SUCCESS")
                                                                fetchTrashData()
                                                                fetchData()
                                                            } else {
                                                                addNotification(result.error || "Failed to restore entry", "ERROR")
                                                            }
                                                        }}
                                                        className='text-yellow-400 hover:text-yellow-300 transition-colors'
                                                        title='Restore entry'
                                                    >
                                                        <ArchiveRestoreIcon className='w-4 h-4' />
                                                    </button>
                                                    <button
                                                        onClick={() => setShowHardDeleteModal(entry)}
                                                        className='text-red-500 hover:text-red-400 transition-colors'
                                                        title='Delete permanently'
                                                    >
                                                        <Trash2Icon className='w-4 h-4' />
                                                    </button>
                                                </div>
                                            </td>
```

- [ ] **Step 4: Add `HardDeleteModal` component and mount it**

At the bottom of the file, after the existing `DeleteModal` component (after line ~1536), add:

```tsx

// ============================================
// Hard Delete Modal Component
// ============================================

function HardDeleteModal({
    entry,
    onClose,
    onConfirm,
}: {
    entry: LedgerEntry
    onClose: () => void
    onConfirm: () => void
}) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm()
        setLoading(false)
    }

    return (
        <div
            className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-red-500/30'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='p-6 border-b border-white/10'>
                    <div className='flex items-center gap-3'>
                        <div className='p-3 bg-red-500/30 rounded-full'>
                            <Trash2Icon className='w-6 h-6 text-red-400' />
                        </div>
                        <div>
                            <h3 className='text-xl font-bold text-red-300'>Delete Permanently</h3>
                            <p className='text-red-400/80 text-sm'>
                                This action is irreversible. The entry will be removed from the database.
                            </p>
                        </div>
                    </div>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='bg-red-500/10 rounded-lg p-3 text-sm border border-red-500/20'>
                        <p>
                            <span className='text-white/60'>Description:</span>{" "}
                            <span className='text-white line-through'>
                                {entry.description}
                            </span>
                        </p>
                        <p className='mt-1'>
                            <span className='text-white/60'>Date:</span>{" "}
                            <span className='text-white'>
                                {safeFormatDate(entry.entry_date)}
                            </span>
                        </p>
                        <p className='mt-1'>
                            <span className='text-white/60'>Amount:</span>{" "}
                            <span
                                className={
                                    entry.debit > 0
                                        ? "text-red-300"
                                        : "text-green-300"
                                }
                            >
                                {entry.debit > 0
                                    ? `Debit ${entry.debit.toFixed(2)}`
                                    : `Credit ${entry.credit.toFixed(2)}`}
                            </span>
                        </p>
                    </div>

                    <div className='flex justify-end gap-3'>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className='px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
                        >
                            {loading && (
                                <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                            )}
                            Delete Permanently
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

- [ ] **Step 5: Mount the `HardDeleteModal` in the page**

Find the `{/* Delete Confirmation Modal */}` section. After the closing `</AnimatePresence>` of that modal block, add:

```tsx

            {/* Hard Delete Confirmation Modal */}
            <AnimatePresence>
                {showHardDeleteModal && (
                    <HardDeleteModal
                        entry={showHardDeleteModal}
                        onClose={() => setShowHardDeleteModal(null)}
                        onConfirm={async () => {
                            const result = await hardDeleteLedgerEntry(showHardDeleteModal.id)
                            if (result.success) {
                                addNotification("Entry permanently deleted", "SUCCESS")
                                fetchTrashData()
                            } else {
                                addNotification(result.error || "Failed to permanently delete entry", "ERROR")
                            }
                            setShowHardDeleteModal(null)
                        }}
                    />
                )}
            </AnimatePresence>
```

- [ ] **Step 6: Run TypeScript type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add hard delete button and modal to trash tab"
```

### Task 5: Enrich Entry Notification with Date

**Files:**
- Modify: `components/accounting/EntryModal.tsx`
- Modify: `app/accounting/accountingPage.tsx`

**Why:** After creating or editing an entry, the notification should show what was added and when, as a form of double confirmation.

- [ ] **Step 1: Add `EntryNotificationDetails` interface and update `onSuccess` signature in `EntryModal.props`**

In `components/accounting/EntryModal.tsx`, add the interface and update the prop type. Find lines 39–46:

```typescript
interface EntryModalProps {
    entry: LedgerEntry | null
    currencySymbol: string
    categories: AccountingCategory[]
    onClose: () => void
    onSuccess: () => void
    isAdmin: boolean
}
```

Replace with:

```typescript
export interface EntryNotificationDetails {
    description: string
    date: Date
    isUpdate: boolean
}

interface EntryModalProps {
    entry: LedgerEntry | null
    currencySymbol: string
    categories: AccountingCategory[]
    onClose: () => void
    onSuccess: (details: EntryNotificationDetails) => void
    isAdmin: boolean
}
```

- [ ] **Step 2: Update the two `onSuccess()` calls in `handleSubmit`**

In `components/accounting/EntryModal.tsx`, find the two `onSuccess()` call sites in `handleSubmit`.

**For the update path (line ~225):** Replace `onSuccess()` with:

```typescript
                    onSuccess({
                        description: formData.description,
                        date: formData.entry_date,
                        isUpdate: true,
                    })
```

**For the create path (line ~238):** Replace `onSuccess()` with:

```typescript
                    onSuccess({
                        description: formData.description,
                        date: formData.entry_date,
                        isUpdate: false,
                    })
```

- [ ] **Step 3: Update the `onSuccess` handler in `accountingPage.tsx`**

In `app/accounting/accountingPage.tsx`, find lines 1359–1368:

```typescript
                        onSuccess={() => {
                            setShowAddModal(false)
                            setEditingEntry(null)
                            fetchData()
                            addNotification(
                                editingEntry
                                    ? "Entry updated successfully"
                                    : "Entry created successfully",
                                "SUCCESS",
                            )
                        }}
```

Replace with:

```typescript
                        onSuccess={(details) => {
                            setShowAddModal(false)
                            setEditingEntry(null)
                            fetchData()
                            addNotification(
                                `${details.isUpdate ? "Entry updated" : "Entry created"} — ${details.description} on ${safeFormatDate(details.date)}`,
                                "SUCCESS",
                            )
                        }}
```

- [ ] **Step 4: Run TypeScript type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors. The `EntryNotificationDetails` type ensures compile-time safety.

- [ ] **Step 5: Commit**

```bash
git add components/accounting/EntryModal.tsx app/accounting/accountingPage.tsx
git commit -m "feat(accounting): enrich entry notification with description and date for double confirmation"
```

---

## Phase 4: Verification

### Task 6: Full Build and Smoke Test

**Why:** Validate that all three changes work together without regressions.

- [ ] **Step 1: Run full TypeScript build**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: Zero errors

- [ ] **Step 2: Run Next.js build (catches SSR issues)**

Run: `npx next build 2>&1 | tail -30`
Expected: Successful build

- [ ] **Step 3: Manual verification checklist**

Access the application and verify:
- [ ] Trash tab shows voided entries (was previously empty)
- [ ] Each voided entry has both a Restore (yellow) and Delete Permanently (red) button
- [ ] Clicking Delete Permanently opens the hard delete modal with entry details
- [ ] Confirming hard delete removes the entry from trash
- [ ] Reports tab no longer shows Payroll Breakdown section
- [ ] Adding a new entry shows notification: `"Entry created — [description] on [date]"`
- [ ] Editing an entry shows notification: `"Entry updated — [description] on [date]"`

- [ ] **Step 4: Final commit (if any adjustments were needed)**

```bash
git add -A
git commit -m "chore(accounting): final adjustments from verification pass"
```