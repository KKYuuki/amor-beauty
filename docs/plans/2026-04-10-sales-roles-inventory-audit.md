# Sales, Roles, Inventory & Accounting Audit - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all reported bugs in roles, sales, inventory, and accounting modules; add direct amount editing for cart items and services; ensure mobile responsiveness across sales UI.

**Architecture:** Systematic audit-and-fix across 5 subsystems (roles/permissions, sales POS, inventory, accounting, mobile). Each fix is isolated to specific files with clear before/after behavior. Changes follow existing patterns: Tailwind dark-first styling, server actions for data, React Context for state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, Better-Auth, Motion (Framer Motion)

---

## Audit Summary & Root Causes

### Issue 1: Hybrid Roles Not Reflecting in Sales
**Root Cause:** `getStaffProfiles()` in `server/actions/profile.ts:272-285` only queries `eq(user.role, 'staff')`. This excludes artists, piercers, shoe_techs, and admins with hybrid capabilities from the sales staff assignment dropdown.

### Issue 2: Role Types Not Reflecting on Account and Sales
**Root Cause:** `manager` role is defined in `UserRoleType` but missing from the role dropdown in `app/accounts/[id]/page.tsx:445-449` and `components/accounts/InviteUserModal.tsx:91-97`. The `ROLE_COLORS` map in `invitationsClient.tsx` includes manager, but it's not selectable everywhere.

### Issue 3: Accounting Transaction History
**Root Cause:** Needs verification - accounting ledger entries are created via `createTransaction()` at `server/actions/transactions.ts:180-220`. The issue may be a tester mislabeling rather than a code bug. We will verify the flow works correctly.

### Issue 4: Sales UI - Hourly Services
**Root Cause:** In `components/sales/layout/CartPanel.tsx:158-195`, the hourly time inputs use `grid grid-cols-2` which causes overlapping on narrow cart panels. The calculated amount is not shown inline - users must look at the totals section to see the result. The cart panel has fixed `w-sm` width with no mobile adaptation.

### Issue 5: Inventory Items Not Showing in Sales
**Root Cause:** The filter in `components/sales/context/SalesContext.tsx:354-358` checks `item.show_in_sales && (item.branch_id === currentBranch?.id || item.is_shared)`. Items with `current_stock <= 0` are also filtered out at the UI level in `salesPage.tsx:36`. Potential issue: if `showInSales` defaults to `true` in DB but the mapping at `server/actions/inventory.ts:125` has a type mismatch.

### Suggestion: Direct Amount Edit
**Current State:** `CartPanel.tsx:121-128` already has a `unit_price` input field. However, it doesn't show the original price for comparison clearly, and there's no way to edit the line total directly (only unit price × quantity). Services have no inline amount editing.

---

## Task 1: Fix Hybrid Roles - Staff List Query

**Files:**
- Modify: `server/actions/profile.ts:272-309`

**Problem:** `getStaffProfiles()` only returns users with `role === 'staff'`. The `getStaffList()` function (used in sales checkout for staff assignment) derives from this, so artists, piercers, shoe_techs, and admins with hybrid capabilities never appear.

**Step 1: Update getStaffProfiles to include all assignable roles**

```typescript
// server/actions/profile.ts:272-285
export async function getStaffProfiles(): Promise<UserProfile[]> {
    try {
        const assignableRoles = ['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech']
        const staffUsers = await db.select().from(user).where(
            inArray(user.role, assignableRoles)
        )
        return staffUsers.map(mapUserToProfile)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching staff profiles: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}
```

Add `inArray` import from `drizzle-orm` if not already imported.

**Step 2: Verify**

- Check that `getStaffList()` returns all user roles (admin, manager, staff, artist, piercer, shoe_tech)
- In the sales checkout modal, the Staff Assignment dropdown should now show all users

**Step 3: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix: include all assignable roles in staff list for sales assignment"
```

---

## Task 2: Fix Role Types - Add Manager to Role Dropdowns

**Files:**
- Modify: `app/accounts/[id]/page.tsx:445-449`
- Modify: `components/accounts/InviteUserModal.tsx:91-97`

**Problem:** The `manager` role exists in `UserRoleType` and `ROLE_COLORS` but is missing from role selection dropdowns.

**Step 1: Add manager option to user detail page role dropdown**

In `app/accounts/[id]/page.tsx:445-449`, add manager option:

```tsx
<option value="admin">Admin</option>
<option value="manager">Manager</option>
<option value="staff">Staff</option>
<option value="artist">Artist</option>
<option value="piercer">Piercer</option>
<option value="shoe_tech">Shoe Tech</option>
```

**Step 2: Add manager option to invite user modal**

In `components/accounts/InviteUserModal.tsx:91-97`, add manager option:

```tsx
<option value="admin">Admin</option>
<option value="manager">Manager</option>
<option value="staff">Staff</option>
<option value="artist">Artist</option>
<option value="piercer">Piercer</option>
<option value="shoe_tech">Shoe Tech</option>
```

**Step 3: Verify consistency across all role selectors**

Check `components/accounts/CreateUserModal.tsx` - it already has all 6 roles. Confirm all role selectors are consistent.

**Step 4: Commit**

```bash
git add app/accounts/\[id\]/page.tsx components/accounts/InviteUserModal.tsx
git commit -m "fix: add manager role to account and invitation dropdowns"
```

---

## Task 3: Verify Accounting Transaction History Integration

**Files:**
- Read-only verification: `server/actions/transactions.ts:180-220`
- Read-only verification: `app/accounting/accountingPage.tsx`
- Read-only verification: `app/transactions/transactionsPage.tsx`

**Step 1: Verify ledger entry creation on transaction**

In `server/actions/transactions.ts`, confirm that `createTransaction()` creates a ledger entry with `source_type: 'TRANSACTION'` and `source_id` pointing to the transaction ID.

**Step 2: Verify accounting page displays transaction-linked entries**

Confirm that `getLedgerEntries()` in `server/actions/accounting.ts` returns entries with `source_type === 'TRANSACTION'` and the accounting page displays them.

**Step 3: If issue exists, fix; otherwise document as verified**

If the accounting entries are properly created and displayed, mark this as a tester mislabeling. If there's a gap, fix the ledger entry creation.

**Step 4: Commit (only if changes made)**

```bash
git add <changed files>
git commit -m "fix: ensure accounting entries link to transaction history"
```

---

## Task 4: Fix Sales UI - Hourly Service Layout & Calculation Display

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:108-205`

**Problem:** 
1. Hourly service time inputs use `grid grid-cols-2` inside a flex row, causing overlap on narrow panels
2. No inline calculated amount shown for hourly items
3. Cart items don't stack vertically when they have time inputs

**Step 1: Restructure cart item layout for hourly services**

Replace the current cart item rendering (lines 108-204) with a layout that stacks vertically when hourly:

```tsx
cart.map((item) => (
    <div
        key={item.id}
        className={`p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800 ${
            item.pricing_type === "HOURLY" ? 'space-y-3' : 'flex items-center justify-between'
        }`}
    >
        {/* Top row: name, price, quantity */}
        <div className={item.pricing_type === "HOURLY" ? '' : 'flex items-center justify-between'}>
            <div className='flex-1 min-w-0 mr-4'>
                <p className='font-medium truncate'>{item.name}</p>
                <div className='flex items-center gap-1 flex-wrap'>
                    {item.custom_price !== undefined && item.custom_price !== item.original_price && (
                        <span className='text-white/40 line-through text-xs'>
                            {taxSettings.currency_symbol}{item.original_price.toFixed(2)}
                        </span>
                    )}
                    <input
                        type='number'
                        value={item.unit_price}
                        onChange={(e) => updateCustomPrice(item.id, parseFloat(e.target.value) || 0)}
                        className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
                        min='0'
                        step='0.01'
                    />
                    <span className='text-sm text-zinc-500'>x {item.quantity}</span>
                    {item.pricing_type === "HOURLY" && (
                        <span className='text-blue-600 dark:text-blue-400 text-xs ml-2'>
                            (Hourly: {taxSettings.currency_symbol}{item.hourly_rate?.toFixed(2)}/hr)
                        </span>
                    )}
                </div>
            </div>
            <div className='flex items-center gap-3'>
                {/* Quantity controls */}
                <div className='flex items-center gap-1 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1'>
                    <button onClick={() => updateQuantity(item.id, -1)} className='p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded'>
                        <MinusIcon className='w-3 h-3' />
                    </button>
                    <span className='w-6 text-center text-sm font-medium'>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className='p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded'>
                        <PlusIcon className='w-3 h-3' />
                    </button>
                </div>
                <button onClick={() => removeFromCart(item.id)} className='text-zinc-400 hover:text-red-500 transition-colors'>
                    <Trash2Icon className='w-4 h-4' />
                </button>
            </div>
        </div>

        {/* Hourly section: time inputs + calculated amount */}
        {item.pricing_type === "HOURLY" && (
            <div className='space-y-2'>
                <div className='grid grid-cols-2 gap-2 text-xs'>
                    <div>
                        <label className='block text-zinc-500 mb-1'>Start</label>
                        <input
                            type='time'
                            value={item.start_time || ""}
                            onChange={(e) => {
                                setCart((prev) =>
                                    prev.map((i) =>
                                        i.id === item.id ? { ...i, start_time: e.target.value } : i,
                                    ),
                                )
                            }}
                            className='w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-sm'
                        />
                    </div>
                    <div>
                        <label className='block text-zinc-500 mb-1'>End</label>
                        <input
                            type='time'
                            value={item.end_time || ""}
                            onChange={(e) => {
                                setCart((prev) =>
                                    prev.map((i) =>
                                        i.id === item.id ? { ...i, end_time: e.target.value } : i,
                                    ),
                                )
                            }}
                            className='w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-sm'
                        />
                    </div>
                </div>
                {/* Inline calculated amount */}
                {item.start_time && item.end_time && item.hourly_rate && (
                    <div className='flex justify-between items-center text-xs px-1'>
                        <span className='text-zinc-500'>
                            {(() => {
                                const start = new Date(`1970-01-01T${item.start_time}`)
                                const end = new Date(`1970-01-01T${item.end_time}`)
                                const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                                return hours > 0 ? `${hours.toFixed(1)}h × ${taxSettings.currency_symbol}${item.hourly_rate.toFixed(2)}` : 'Invalid time range'
                            })()}
                        </span>
                        <span className='font-medium text-blue-600 dark:text-blue-400'>
                            {taxSettings.currency_symbol}
                            {(() => {
                                const start = new Date(`1970-01-01T${item.start_time}`)
                                const end = new Date(`1970-01-01T${item.end_time}`)
                                const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                                return hours > 0 ? (hours * item.hourly_rate * item.quantity).toFixed(2) : '0.00'
                            })()}
                        </span>
                    </div>
                )}
            </div>
        )}
    </div>
))
```

**Step 2: Test with hourly services**

- Add an hourly service to cart
- Verify time inputs appear stacked below the item info (not inline)
- Verify calculated amount shows immediately below the time inputs
- Verify changing start/end time updates the displayed calculation
- Verify the totals section still calculates correctly

**Step 3: Commit**

```bash
git add components/sales/layout/CartPanel.tsx
git commit -m "fix: improve hourly service layout with stacked time inputs and inline calculation"
```

---

## Task 5: Fix Inventory show_in_sales Debugging & Validation

**Files:**
- Verify: `server/actions/inventory.ts:125` (mapping)
- Verify: `components/sales/context/SalesContext.tsx:354-358` (filter)
- Verify: `app/sales/salesPage.tsx:32-36` (stock filter)

**Step 1: Add logging to inventory filter in sales context**

In `components/sales/context/SalesContext.tsx:353-358`, add debug logging to identify why items might not appear:

```typescript
// Filter out non-sales items and by branch
const salesInv = (invData || []).filter(
    (item) => {
        const showInSales = item.show_in_sales
        const branchMatch = item.branch_id === currentBranch?.id || item.is_shared
        const hasStock = item.current_stock > 0
        
        if (!showInSales) return false
        if (!branchMatch) return false
        if (!hasStock) return false
        
        return true
    },
)
```

**Step 2: Verify show_in_sales mapping is correct**

Check `server/actions/inventory.ts:125` confirms: `show_in_sales: item.showInSales` - this maps the DB column `showInSales` (camelCase from Drizzle) to the API field `show_in_sales` (snake_case). Verify the DB column type matches.

**Step 3: Verify default value**

Check that `showInSales` defaults to `true` in the DB schema (`server/db/schema/inventory.ts:49`). Confirm new items get `show_in_sales: true` by default.

**Step 4: Add visual indicator in product grid for items with low/no stock**

In `components/sales/layout/ProductGrid.tsx:80-112`, the stock badge already shows. Verify items with 0 stock are correctly disabled (they are, via `disabled={item.current_stock <= 0}` at line 84).

**Step 5: Commit (only if changes made)**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "fix: clarify inventory show_in_sales filter with explicit checks"
```

---

## Task 6: Add Direct Amount Editing for Cart Items and Services

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx` (enhance existing price input)
- Modify: `components/sales/context/SalesContext.tsx` (add line total editing)

**Step 1: Add line total editing capability to SalesContext**

In `SalesContext.tsx`, add a new function after `updateCustomPrice`:

```typescript
const updateLineTotal = (id: string, newTotal: number) => {
    setCart((prev) =>
        prev.map((item) => {
            if (item.id !== id) return item
            if (newTotal < 0) return item
            
            if (item.pricing_type === "HOURLY" && item.hourly_rate) {
                // For hourly: calculate equivalent hours from total
                const hours = newTotal / (item.hourly_rate * item.quantity)
                // Don't change the rate, just note the override
                return {
                    ...item,
                    custom_price: newTotal / item.quantity,
                    unit_price: newTotal / item.quantity,
                }
            }
            
            // For fixed: set unit_price so that unit_price * quantity = newTotal
            const newUnitPrice = item.quantity > 0 ? newTotal / item.quantity : newTotal
            return {
                ...item,
                custom_price: newUnitPrice,
                unit_price: newUnitPrice,
            }
        }),
    )
}
```

**Step 2: Export updateLineTotal from SalesContext**

Add `updateLineTotal` to the context interface and provider value.

**Step 3: Enhance CartPanel price display**

In `CartPanel.tsx`, add a line total display with edit capability below the unit price input:

```tsx
{/* Line total with edit capability */}
<div className='flex items-center gap-1 mt-1'>
    <span className='text-xs text-zinc-500'>Total:</span>
    <input
        type='number'
        value={(item.unit_price * item.quantity).toFixed(2)}
        onChange={(e) => updateLineTotal(item.id, parseFloat(e.target.value) || 0)}
        className='w-24 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-right font-medium'
        min='0'
        step='0.01'
    />
</div>
```

**Step 4: Update CartPanel props interface**

Add `updateLineTotal` to `CartPanelProps` and destructure it.

**Step 5: Pass updateLineTotal from salesPage**

Ensure `updateLineTotal` is passed through the spread `{...sales}` in `salesPage.tsx`.

**Step 6: Test**

- Add items to cart
- Edit unit price - verify line total updates
- Edit line total - verify unit price recalculates
- Verify totals section reflects changes
- Test with hourly services

**Step 7: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/CartPanel.tsx
git commit -m "feat: add direct line total editing for cart items"
```

---

## Task 7: Mobile Responsiveness for Sales Page

**Files:**
- Modify: `app/sales/salesPage.tsx:24-29` (remove mobile block)
- Modify: `app/sales/salesPage.tsx:50-77` (responsive layout)
- Modify: `components/sales/layout/CartPanel.tsx:73` (responsive width)
- Modify: `components/sales/layout/ProductGrid.tsx:36` (responsive height)

**Step 1: Remove the mobile "Only Available in Desktop" block**

In `app/sales/salesPage.tsx:24-29`, replace the mobile block with a responsive layout:

```tsx
// Remove this:
if (isMobile) {
    return (
        <div className='w-full h-full flex items-center justify-center font-semibold text-xl gap-4 text-center'>
            Only Available in Desktop
        </div>
    )
}
```

**Step 2: Create responsive layout**

Replace the layout in `salesPage.tsx:50-77` with a responsive design:

```tsx
return (
    <AnimatePresence>
        <div
            key='sales-content'
            className='flex-1 w-full flex flex-col lg:flex-row overflow-hidden gap-4 z-0'
        >
            {/* LEFT SIDE: Product Selection */}
            <div className='flex-1 flex-col h-full overflow-hidden relative'>
                <div className='flex items-center justify-between px-4 pt-4'>
                    <div />
                    <BranchSelector className='w-48' />
                </div>
                <SalesHeader {...sales} />
                <ProductGrid
                    {...sales}
                    filteredInventory={filteredInventory}
                    filteredServices={filteredServices}
                    filteredAppointments={filteredAppointments}
                />
                <RecentTransactions 
                    {...sales}
                    refreshTransactions={sales.refreshTransactions}
                />
            </div>

            {/* RIGHT SIDE: Cart & Checkout */}
            <CartPanel {...sales} />
        </div>
        {/* ... modals unchanged ... */}
    </AnimatePresence>
)
```

**Step 3: Make CartPanel responsive**

In `CartPanel.tsx:73`, change fixed width to responsive:

```tsx
<div className='w-full lg:w-sm flex flex-col h-full z-10 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl'>
```

On mobile, the cart will stack below the product grid. On desktop (lg+), it maintains the sidebar width.

**Step 4: Make ProductGrid responsive**

In `ProductGrid.tsx:36`, adjust max-height for mobile:

```tsx
<div className='flex-1 overflow-y-auto max-h-[calc(100%-22rem)] lg:max-h-[calc(100%-22rem)]'>
```

And adjust grid columns for mobile (already `grid-cols-2` which is fine).

**Step 5: Make CheckoutModal responsive**

In `CheckoutModal.tsx:132`, ensure modal is full-width on mobile:

```tsx
className='bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90svh] lg:max-h-[80svh] overflow-hidden flex flex-col'
```

**Step 6: Test on mobile viewport**

- Verify sales page loads on mobile
- Verify product grid shows 2 columns
- Verify cart panel stacks below on mobile
- Verify checkout modal is usable on mobile
- Verify time inputs for hourly services work on mobile

**Step 7: Commit**

```bash
git add app/sales/salesPage.tsx components/sales/layout/CartPanel.tsx components/sales/layout/ProductGrid.tsx components/sales/modals/CheckoutModal.tsx
git commit -m "feat: add mobile responsiveness to sales page"
```

---

## Task 8: Additional Improvements - Hybrid Roles in Sales Context

**Files:**
- Modify: `components/sales/context/SalesContext.tsx` (staff list filtering)
- Modify: `components/sales/modals/CheckoutModal.tsx` (display role info)

**Step 1: Show role badge next to staff names in checkout**

In `CheckoutModal.tsx:195-199`, enhance the staff dropdown to show role:

```tsx
{staffList.map((staff) => (
    <option key={staff.id} value={staff.id}>
        {staff.full_name} ({staff.role || 'staff'})
    </option>
))}
```

**Step 2: Verify hybrid role admins appear in staff list**

With Task 1's fix, `getStaffList()` now returns all roles. Confirm that admins with `artist` access_flag appear and can be selected for service transactions.

**Step 3: Commit**

```bash
git add components/sales/modals/CheckoutModal.tsx
git commit -m "feat: show role badge in sales staff assignment dropdown"
```

---

## Task 9: Additional Improvements - User Filters Include All Roles

**Files:**
- Verify: `components/accounts/UserFilters.tsx:96-111`

**Step 1: Verify UserFilters includes all roles**

The filter at `UserFilters.tsx:96-111` already includes: All, Admin, Staff, Artist, Piercer, Shoe Tech, Client. Verify that `manager` is included if it's a valid role.

**Step 2: Add manager if missing**

If manager is not in the filter options, add it.

**Step 3: Commit (only if changes made)**

```bash
git add components/accounts/UserFilters.tsx
git commit -m "fix: include manager role in user filter options"
```

---

## Task 10: Run Lint and Verify All Changes

**Step 1: Run ESLint**

```bash
bun run lint
```

Fix any warnings or errors.

**Step 2: Run type check**

```bash
bun run build
```

Verify no TypeScript errors.

**Step 3: Manual testing checklist**

- [ ] Create a user with role "artist" - verify they appear in sales staff dropdown
- [ ] Create an admin with "artist" hybrid capability - verify they appear in sales
- [ ] Set role to "manager" in user detail page - verify it saves and displays
- [ ] Toggle inventory item show_in_sales - verify it appears/disappears in sales grid
- [ ] Add hourly service to cart - verify stacked time inputs with inline calculation
- [ ] Edit line total in cart - verify unit price updates
- [ ] Open sales page on mobile viewport - verify responsive layout
- [ ] Complete a transaction - verify accounting entry is created
- [ ] Check transaction history - verify transaction appears

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `server/actions/profile.ts` | Modify | Broaden `getStaffProfiles()` to include all assignable roles |
| `app/accounts/[id]/page.tsx` | Modify | Add manager to role dropdown |
| `components/accounts/InviteUserModal.tsx` | Modify | Add manager to role dropdown |
| `components/sales/layout/CartPanel.tsx` | Modify | Stacked hourly layout, inline calc, responsive width, line total edit |
| `components/sales/context/SalesContext.tsx` | Modify | Add `updateLineTotal`, clarify inventory filter |
| `app/sales/salesPage.tsx` | Modify | Remove mobile block, responsive flex-col/row layout |
| `components/sales/layout/ProductGrid.tsx` | Verify | Confirm mobile grid works |
| `components/sales/modals/CheckoutModal.tsx` | Modify | Show role in staff dropdown, responsive modal |
| `components/accounts/UserFilters.tsx` | Verify/Modify | Ensure manager role in filter |
