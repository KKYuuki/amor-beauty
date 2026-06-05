# Payroll Audit & Shoe Rate Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SHOE service type to the payroll rate system, fix the hardcoded service/client type lookup in payroll calculation, and audit the entire payroll flow for robustness.

**Architecture:** Extend the existing 3-dimensional rate lookup (service_type × client_type × artist_level) to include SHOE alongside TATTOO and PIERCING. Fix `calculateAndCreatePayrollEntry()` to dynamically resolve service type and client type instead of hardcoding. Audit and fix the full payroll request flow on both manager and employee sides.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase (PostgreSQL), Tailwind CSS 4

---

## Critical Bugs Found During Audit

1. **Hardcoded service/client type** in `calculateAndCreatePayrollEntry()` (payroll.ts:475-476) — all payroll entries use `TATTOO`/`WALKIN` regardless of actual service
2. **SHOE service type missing** from `ServiceType` — shoe techs have no payroll rate configs or entries
3. **Deductions not integrated** — `applyDeductions()` exists but is never called during `completePayrollRequest()`
4. **Zod validation mismatch** in profile.ts — `artist_level` validates against wrong enum values (`APPRENTICE/JUNIOR/SENIOR/MASTER` instead of `NORMAL/HEAD_ARTIST/OWNER`); `payout_period` validates against `BIWEEKLY` instead of `BIMONTHLY`
5. **No rate creation UI** — Rates tab only allows editing existing rates; cannot create new rate combos (needed for SHOE)
6. **`client_type` not passed** from SalesContext → `createTransaction` → `calculateAndCreatePayrollEntry()`
7. **Existing seed script not idempotent** — `seed-database.ts` skips payroll rates entirely if ANY rates exist, preventing SHOE rates from being added after TATTOO/PIERCING are already seeded. The unique index on `(service_type, client_type, artist_level)` means `onConflictDoNothing()` must be used per-row instead of a blanket skip

---

## Phase 1: Type System & Schema Changes (SHOE Service Type)

### Task 1: Add SHOE to ServiceType enum

**Files:**
- Modify: `utils/types/payroll.ts:3`
- Modify: `server/actions/payroll-schemas.ts:7`

**Step 1: Update ServiceType in payroll types**

In `utils/types/payroll.ts`, change line 3:

```typescript
export type ServiceType = 'TATTOO' | 'PIERCING' | 'SHOE'
```

**Step 2: Update Zod schema for ServiceType**

In `server/actions/payroll-schemas.ts`, change line 7:

```typescript
export const ServiceTypeSchema = z.enum(['TATTOO', 'PIERCING', 'SHOE'])
```

**Step 3: Commit**

```bash
git add utils/types/payroll.ts server/actions/payroll-schemas.ts
git commit -m "feat(payroll): add SHOE to ServiceType enum"
```

---

### Task 2: Update payroll DB schema comments for SHOE support

**Files:**
- Modify: `server/db/schema/payroll.ts:17-18`

**Step 1: Update schema comments to document SHOE**

In `server/db/schema/payroll.ts`, update the comment on line 17:

```typescript
    // Type: 'TATTOO', 'PIERCING', 'SHOE'
```

**Step 2: Run drizzle push to update schema**

```bash
bunx drizzle-kit push
```

**Step 3: Commit**

```bash
git add server/db/schema/payroll.ts
git commit -m "docs(payroll): update schema comments for SHOE service type"
```

---

### Task 3: Add service_type to services table for payroll mapping

**Files:**
- Modify: `server/db/schema/services.ts`
- Modify: `server/actions/transactions.ts`

**Step 1: Add service_type column to services table**

In `server/db/schema/services.ts`, add after the `isShared` field (line 29):

```typescript
    // Service type for payroll rate mapping
    serviceType: varchar('service_type', { length: 50 }).default('TATTOO'),
    // Type: 'TATTOO', 'PIERCING', 'SHOE', 'OTHER'
```

Add index in the table definition callback:

```typescript
    serviceTypeIdx: index('idx_services_service_type').on(table.serviceType),
```

**Step 2: Update services relations** — no relation changes needed since this is just a field.

**Step 3: Run drizzle push**

```bash
bunx drizzle-kit push
```

**Step 4: Commit**

```bash
git add server/db/schema/services.ts
git commit -m "feat(services): add service_type column for payroll rate mapping"
```

---

## Phase 2: Fix Hardcoded Service/Client Type Resolution

### Task 4: Fix calculateAndCreatePayrollEntry to resolve service type dynamically

**Files:**
- Modify: `server/actions/payroll.ts:61-67,464-562`

**Step 1: Update PayrollEntryInput interface to include service type and client type**

In `server/actions/payroll.ts`, update the `PayrollEntryInput` interface (lines 61-67):

```typescript
export interface PayrollEntryInput {
    transactionId: string
    serviceId: string
    artistId: string
    amount: number
    quantity: number
    serviceType?: ServiceType
    clientType?: ClientType
}
```

**Step 2: Update calculateAndCreatePayrollEntry to use dynamic service/client type**

Replace the hardcoded block at lines 474-476 in `server/actions/payroll.ts`:

```typescript
        // For now, use default values - these could be fetched from service config
        const serviceType: ServiceType = 'TATTOO'
        const clientType: ClientType = 'WALKIN'
```

With:

```typescript
        let serviceType: ServiceType
        let clientType: ClientType

        if (input.serviceType) {
            serviceType = input.serviceType
        } else {
            // Fallback: resolve service type from the service record
            const serviceRecord = await dbClient
                .select({ serviceType: services.serviceType })
                .from(services)
                .where(eq(services.id, input.serviceId))
                .limit(1)

            serviceType = (serviceRecord[0]?.serviceType as ServiceType) || 'TATTOO'
        }

        if (input.clientType) {
            clientType = input.clientType
        } else {
            // Fallback: resolve client type from the transaction
            const transactionRecord = await dbClient
                .select({ clientType: transactions.clientType })
                .from(transactions)
                .where(eq(transactions.id, input.transactionId))
                .limit(1)

            clientType = (transactionRecord[0]?.clientType as ClientType) || 'WALKIN'
        }
```

Also add the missing imports at the top of the file:

```typescript
import { services } from "@/server/db/schema"
```

**Step 3: Verify the fix compiles**

```bash
bun run build 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): resolve service type and client type dynamically instead of hardcoding"
```

---

### Task 5: Pass client_type through the transaction creation flow

**Files:**
- Modify: `server/actions/transactions.ts:184-205`

**Step 1: Update the payroll entry creation in createTransaction to pass client_type**

In `server/actions/transactions.ts`, update the payroll entry creation block (lines 184-205). The `payload` already has `client_type` from `CreateTransactionPayload`. Update the `calculateAndCreatePayrollEntry` call:

```typescript
        // Create payroll entries for services
        if (payload.staff_id) {
            for (const item of payload.items) {
                if (item.service_id) {
                    try {
                        await calculateAndCreatePayrollEntry({
                            transactionId: newTransaction.id,
                            serviceId: item.service_id,
                            artistId: payload.staff_id!,
                            amount: item.quantity * item.unit_price,
                            quantity: item.quantity,
                            clientType: payload.client_type as ClientType | undefined,
                        }, tx)
                    } catch (payrollError) {
                        // Log but don't fail the transaction
                        await logError({
                            type: 'PAYROLL',
                            message: `Failed to create payroll entry for transaction ${transactionNumber}: ${payrollError instanceof Error ? payrollError.message : String(payrollError)}`
                        })
                    }
                }
            }
        }
```

Add the import at the top:

```typescript
import { ClientType } from '@/utils/types/payroll'
```

**Step 2: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(transactions): pass client_type to payroll entry creation"
```

---

### Task 6: Add clientType column to transactions table

**Files:**
- Modify: `server/db/schema/transactions.ts`
- Modify: `server/actions/transactions.ts` (createTransaction)

**Step 1: Add clientType to transactions table**

In `server/db/schema/transactions.ts`, add after the `notes` field (around line 43):

```typescript
    // Client type for payroll rate calculation
    clientType: text('client_type'),
    // Type: 'WALKIN', 'PERSONAL'
```

**Step 2: Update createTransaction to store client_type on the transaction**

In `server/actions/transactions.ts`, in the `createTransaction` function, add `clientType` to the insert values object. Find the section where the transaction is created (it creates `newTransaction`) and add the `clientType` field:

```typescript
    clientType: payload.client_type || null,
```

**Step 3: Run drizzle push**

```bash
bunx drizzle-kit push
```

**Step 4: Commit**

```bash
git add server/db/schema/transactions.ts server/actions/transactions.ts
git commit -m "feat(transactions): store client_type on transaction for payroll resolution"
```

---

## Phase 3: Payroll Rate UI for SHOE

### Task 7: Add SHOE rate section to the Rates tab

**Files:**
- Modify: `app/payroll/payrollPage.tsx:1253-1341`

**Step 1: Add SHOE rates to the RatesTab component**

In `app/payroll/payrollPage.tsx`, update the `RatesTab` component. After line 1282 where `piercingRates` is defined, add:

```typescript
    const shoeRates = rates.filter((r) => r.service_type === "SHOE")
```

And after line 1338 where `piercingRates` is rendered, add:

```typescript
            <RateTable
                title='Shoe Rates'
                rateList={shoeRates}
            />
```

**Step 2: Verify lint passes**

```bash
bun run lint 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add SHOE rate section to Rates tab"
```

---

### Task 8: Add create rate modal and server action

**Files:**
- Modify: `server/actions/payroll.ts` (add `createStaffRate` function)
- Modify: `app/payroll/payrollPage.tsx` (add CreateRateModal component)

**Step 1: Add createStaffRate server action**

In `server/actions/payroll.ts`, add a new function after `updateStaffRate` (after line 219):

```typescript
export async function createStaffRate(
    payload: {
        rate_name: string
        service_type: ServiceType
        client_type: ClientType
        artist_level: ArtistLevel
        shop_percentage: number
        artist_percentage: number
        payment_mode: 'PERCENTAGE' | 'FIXED'
        fixed_amount?: number
    }
): Promise<ActionResponse<PayrollStaffRate>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        if (payload.payment_mode === 'PERCENTAGE') {
            if (payload.shop_percentage + payload.artist_percentage !== 100) {
                return failure('Shop and artist percentages must sum to 100')
            }
        }

        // Check if rate already exists for this combination
        const existing = await db
            .select()
            .from(payrollStaffRate)
            .where(
                and(
                    eq(payrollStaffRate.serviceType, payload.service_type),
                    eq(payrollStaffRate.clientType, payload.client_type),
                    eq(payrollStaffRate.artistLevel, payload.artist_level),
                    eq(payrollStaffRate.isActive, true)
                )
            )
            .limit(1)

        if (existing.length > 0) {
            return failure('A rate already exists for this service/client/level combination')
        }

        const [rate] = await db
            .insert(payrollStaffRate)
            .values({
                rateName: payload.rate_name,
                serviceType: payload.service_type,
                clientType: payload.client_type,
                artistLevel: payload.artist_level,
                shopPercentage: String(payload.shop_percentage),
                artistPercentage: String(payload.artist_percentage),
                paymentMode: payload.payment_mode,
                fixedAmount: payload.fixed_amount ? String(payload.fixed_amount) : '0',
                isActive: true,
                updatedBy: currentUser.id,
            })
            .returning()

        const data: PayrollStaffRate = {
            id: rate.id,
            created_at: rate.createdAt,
            rate_name: rate.rateName,
            service_type: rate.serviceType as ServiceType,
            client_type: rate.clientType as ClientType,
            artist_level: rate.artistLevel as ArtistLevel,
            shop_percentage: Number(rate.shopPercentage),
            artist_percentage: Number(rate.artistPercentage),
            payment_mode: (rate.paymentMode as 'PERCENTAGE' | 'FIXED') || 'PERCENTAGE',
            fixed_amount: Number(rate.fixedAmount) || 0,
            is_active: rate.isActive,
            updated_at: rate.updatedAt || undefined,
            updated_by: rate.updatedBy || undefined,
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate created: ${rate.id} by ${currentUser.id}`,
            }],
        })

        cache.invalidate('payroll_rates')

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create rate')
    }
}
```

**Step 2: Add CreateRateModal to PayrollPage**

In `app/payroll/payrollPage.tsx`, add a `CreateRateModal` component. Add the `createStaffRate` import and add a modal after the `EditRateModal`:

```typescript
function CreateRateModal({
    onClose,
    onSave,
}: {
    onClose: () => void
    onSave: (data: {
        rate_name: string
        service_type: string
        client_type: string
        artist_level: string
        shop_percentage: number
        artist_percentage: number
        payment_mode: 'PERCENTAGE' | 'FIXED'
        fixed_amount?: number
    }) => Promise<void>
}) {
    const [serviceName, setServiceName] = useState("TATTOO")
    const [clientType, setClientType] = useState("WALKIN")
    const [artistLevel, setArtistLevel] = useState("NORMAL")
    const [shopPct, setShopPct] = useState(60)
    const [artistPct, setArtistPct] = useState(40)
    const [paymentMode, setPaymentMode] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
    const [fixedAmount, setFixedAmount] = useState(0)
    const [loading, setLoading] = useState(false)

    const handleShopChange = (value: number) => {
        setShopPct(value)
        setArtistPct(100 - value)
    }

    const handleArtistChange = (value: number) => {
        setArtistPct(value)
        setShopPct(100 - value)
    }

    const handleSave = async () => {
        setLoading(true)
        await onSave({
            rate_name: `${serviceName} - ${clientType} - ${artistLevel === 'NORMAL' ? 'Normal Artist' : artistLevel === 'HEAD_ARTIST' ? 'Head Artist' : 'Owner'}`,
            service_type: serviceName,
            client_type: clientType,
            artist_level: artistLevel,
            shop_percentage: shopPct,
            artist_percentage: artistPct,
            payment_mode: paymentMode,
            fixed_amount: fixedAmount,
        })
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Rate</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Service Type</label>
                        <select
                            value={serviceName}
                            onChange={(e) => setServiceName(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='TATTOO'>Tattoo</option>
                            <option value='PIERCING'>Piercing</option>
                            <option value='SHOE'>Shoe</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Client Type</label>
                        <select
                            value={clientType}
                            onChange={(e) => setClientType(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='WALKIN'>Walk-in</option>
                            <option value='PERSONAL'>Personal</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Artist Level</label>
                        <select
                            value={artistLevel}
                            onChange={(e) => setArtistLevel(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='NORMAL'>Normal Artist</option>
                            <option value='HEAD_ARTIST'>Head Artist</option>
                            <option value='OWNER'>Owner</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-2'>Payment Mode</label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('PERCENTAGE')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'PERCENTAGE' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Percentage
                            </button>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('FIXED')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'FIXED' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Fixed Amount
                            </button>
                        </div>
                    </div>

                    {paymentMode === 'PERCENTAGE' && (
                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Shop %</label>
                                <input
                                    type='number' min='0' max='100'
                                    value={shopPct}
                                    onChange={(e) => handleShopChange(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Artist %</label>
                                <input
                                    type='number' min='0' max='100'
                                    value={artistPct}
                                    onChange={(e) => handleArtistChange(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                        </div>
                    )}

                    {paymentMode === 'FIXED' && (
                        <div>
                            <label className='block text-sm font-medium mb-1'>Fixed Amount for Artist</label>
                            <input
                                type='number' min='0' step='0.01'
                                value={fixedAmount}
                                onChange={(e) => setFixedAmount(Number(e.target.value))}
                                className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                            />
                            <p className='text-xs text-white/40 mt-1'>Shop receives: (Total - Fixed Amount)</p>
                        </div>
                    )}

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || (paymentMode === 'PERCENTAGE' && shopPct + artistPct !== 100)}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create Rate"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 3: Wire up the Create button in the RatesTab**

Add a "Create Rate" button to the `RatesTab` component header and connect the `CreateRateModal`. The admin-only Create button should appear above the rate table sections.

**Step 4: Import `createStaffRate` in payrollPage.tsx**

Add `createStaffRate` to the import from `@/server/actions/payroll`.

**Step 5: Verify lint**

```bash
bun run lint 2>&1 | tail -5
```

**Step 6: Commit**

```bash
git add server/actions/payroll.ts app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add create rate modal and server action for new rate combos"
```

---

### Task 9: Add SHOE default rates to seed scripts (idempotent)

**Files:**
- Modify: `scripts/seed-database.ts` (add SHOE rates, fix idempotency)
- Create: `scripts/seed-shoe-rates.ts` (standalone idempotent seeder)

**Problem:** The current `seed-database.ts` has a critical idempotency bug — it skips ALL payroll rate seeding if ANY rates already exist (line 200-204: `if (existingRates.length > 0) { return }`). This means once TATTOO/PIERCING rates are seeded, SHOE rates can never be added via this script. The `payroll_staff_rate` table has a unique index on `(service_type, client_type, artist_level)`, so we can safely use `onConflictDoNothing()` per row for true idempotency.

**Step 1: Fix seed-database.ts idempotency and add SHOE rates**

In `scripts/seed-database.ts`, make two changes:

**1a.** Add SHOE rates to `DEFAULT_PAYROLL_RATES` array (after the existing Piercing rates, around line 145):

```typescript
    // Shoe rates
    {
        rateName: 'Shoe - Walk-in - Normal Artist',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'NORMAL',
        shopPercentage: '60.00',
        artistPercentage: '40.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Walk-in - Head Artist',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'HEAD_ARTIST',
        shopPercentage: '50.00',
        artistPercentage: '50.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Walk-in - Owner',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'OWNER',
        shopPercentage: '40.00',
        artistPercentage: '60.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Normal Artist',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'NORMAL',
        shopPercentage: '60.00',
        artistPercentage: '40.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Head Artist',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'HEAD_ARTIST',
        shopPercentage: '50.00',
        artistPercentage: '50.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Owner',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'OWNER',
        shopPercentage: '40.00',
        artistPercentage: '60.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
]
```

**1b.** Fix the `seedPayrollRates()` function (lines 199-209) to use per-row idempotent upserts instead of the blanket skip:

```typescript
// BEFORE (broken idempotency):
async function seedPayrollRates() {
    const existingRates = await db.select().from(payrollStaffRate)

    if (existingRates.length > 0) {
        return
    }

    for (const rate of DEFAULT_PAYROLL_RATES) {
        await db.insert(payrollStaffRate).values(rate)
    }
}

// AFTER (idempotent — uses onConflictDoNothing on the unique index):
async function seedPayrollRates() {
    for (const rate of DEFAULT_PAYROLL_RATES) {
        await db.insert(payrollStaffRate).values(rate).onConflictDoNothing()
    }
}
```

Also fix the `main()` function's payroll rates seeding section (lines 266-276) to match:

```typescript
// BEFORE (skip entirely if any exist):
console.log('\n💰 Seeding default payroll rates...')
const existingRates = await db.select().from(payrollStaffRate)
if (existingRates.length > 0) {
    console.log(`   ⏭️  ${existingRates.length} rates already exist, skipping`)
} else {
    for (const rate of DEFAULT_PAYROLL_RATES) {
        await db.insert(payrollStaffRate).values(rate)
        console.log(`   ✅ ${rate.rateName}`)
    }
    console.log('✅ Payroll rates seeded successfully')
}

// AFTER (idempotent per-row upsert):
console.log('\n💰 Seeding default payroll rates...')
let ratesSeeded = 0
let ratesSkipped = 0
for (const rate of DEFAULT_PAYROLL_RATES) {
    const result = await db.insert(payrollStaffRate).values(rate).onConflictDoNothing()
    // onConflictDoNothing returns result with rows affected
    // If row was inserted, counts as seeded; if conflict, skipped
    const existing = await db
        .select()
        .from(payrollStaffRate)
        .where(
            and(
                eq(payrollStaffRate.serviceType, rate.serviceType),
                eq(payrollStaffRate.clientType, rate.clientType),
                eq(payrollStaffRate.artistLevel, rate.artistLevel),
            )
        )
        .limit(1)

    if (existing.length > 0 && existing[0].shopPercentage === rate.shopPercentage && existing[0].artistPercentage === rate.artistPercentage) {
        console.log(`   ⏭️  ${rate.rateName} already exists, skipping`)
        ratesSkipped++
    } else if (existing.length > 0) {
        console.log(`   ⏭️  ${rate.rateName} exists with different values, skipping (edit in UI)`)
        ratesSkipped++
    } else {
        console.log(`   ✅ ${rate.rateName}`)
        ratesSeeded++
    }
}
console.log(`✅ Payroll rates: ${ratesSeeded} seeded, ${ratesSkipped} skipped`)
```

Add the required imports at the top of `seed-database.ts`:

```typescript
import { eq, and } from 'drizzle-orm'
```

Also add `Shoe Services` to `DEFAULT_ACCOUNTING_CATEGORIES` in the REVENUE section:

```typescript
    { name: 'Shoe Services', type: 'REVENUE', isActive: true },
```

**Step 2: Create standalone seed-shoe-rates.ts for manual migration**

Create `scripts/seed-shoe-rates.ts` — a standalone idempotent script that can be run independently to add SHOE rates to an existing database:

```typescript
#!/usr/bin/env bun
import { db } from '../server/db'
import { payrollStaffRate } from '../server/db/schema'
import { eq, and } from 'drizzle-orm'
import { config } from 'dotenv'

config({ path: '.env.local' })

const SHOE_RATES = [
    {
        rateName: 'Shoe - Walk-in - Normal Artist',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'NORMAL',
        shopPercentage: '60.00',
        artistPercentage: '40.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Walk-in - Head Artist',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'HEAD_ARTIST',
        shopPercentage: '50.00',
        artistPercentage: '50.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Walk-in - Owner',
        serviceType: 'SHOE',
        clientType: 'WALKIN',
        artistLevel: 'OWNER',
        shopPercentage: '40.00',
        artistPercentage: '60.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Normal Artist',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'NORMAL',
        shopPercentage: '60.00',
        artistPercentage: '40.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Head Artist',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'HEAD_ARTIST',
        shopPercentage: '50.00',
        artistPercentage: '50.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
    {
        rateName: 'Shoe - Personal - Owner',
        serviceType: 'SHOE',
        clientType: 'PERSONAL',
        artistLevel: 'OWNER',
        shopPercentage: '40.00',
        artistPercentage: '60.00',
        paymentMode: 'PERCENTAGE',
        fixedAmount: '0.00',
        isActive: true,
    },
]

async function seedShoeRates() {
    console.log('👟 Seeding SHOE payroll rates...\n')

    let seeded = 0
    let skipped = 0

    for (const rate of SHOE_RATES) {
        // Check if this exact rate combination already exists
        const existing = await db
            .select()
            .from(payrollStaffRate)
            .where(
                and(
                    eq(payrollStaffRate.serviceType, rate.serviceType),
                    eq(payrollStaffRate.clientType, rate.clientType),
                    eq(payrollStaffRate.artistLevel, rate.artistLevel),
                    eq(payrollStaffRate.isActive, true)
                )
            )
            .limit(1)

        if (existing.length > 0) {
            console.log(`  ⏭️  ${rate.rateName} — already exists, skipping`)
            skipped++
            continue
        }

        // Insert with onConflictDoNothing for safety against unique constraint
        await db.insert(payrollStaffRate).values(rate).onConflictDoNothing()
        console.log(`  ✅ ${rate.rateName}`)
        seeded++
    }

    console.log(`\nDone: ${seeded} seeded, ${skipped} skipped`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

seedShoeRates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Error seeding SHOE rates:', error)
        process.exit(1)
    })
```

**Key idempotency features:**
- **Per-row existence check**: Before each insert, checks if a rate with matching `(serviceType, clientType, artistLevel)` already exists
- **`onConflictDoNothing()`**: Double safety — if the unique index constraint fires, it silently skips instead of erroring
- **Safe to re-run**: Running this script multiple times will always skip existing rates and only insert missing ones
- **Detailed reporting**: Reports which rates were seeded vs. already existed

**Step 3: Run the standalone seed script**

```bash
bun run scripts/seed-shoe-rates.ts
```

Expected output:
```
👟 Seeding SHOE payroll rates...

  ✅ Shoe - Walk-in - Normal Artist
  ✅ Shoe - Walk-in - Head Artist
  ✅ Shoe - Walk-in - Owner
  ✅ Shoe - Personal - Normal Artist
  ✅ Shoe - Personal - Head Artist
  ✅ Shoe - Personal - Owner

Done: 6 seeded, 0 skipped
```

Running it again:
```
👟 Seeding SHOE payroll rates...

  ⏭️  Shoe - Walk-in - Normal Artist — already exists, skipping
  ⏭️  Shoe - Walk-in - Head Artist — already exists, skipping
  ⏭️  Shoe - Walk-in - Owner — already exists, skipping
  ⏭️  Shoe - Personal - Normal Artist — already exists, skipping
  ⏭️  Shoe - Personal - Head Artist — already exists, skipping
  ⏭️  Shoe - Personal - Owner — already exists, skipping

Done: 0 seeded, 6 skipped
```

**Step 4: Verify the main seed script is also idempotent**

```bash
bun run scripts/seed-database.ts
```

The main seed should now also handle SHOE rates idempotently. Verify it doesn't duplicate existing TATTOO/PIERCING rates.

**Step 5: Commit**

```bash
git add scripts/seed-database.ts scripts/seed-shoe-rates.ts
git commit -m "feat(payroll): add idempotent SHOE rate seeding with duplicate-safe upserts"
```

---

## Phase 4: Fix Zod Validation Mismatch

### Task 10: Fix artist_level and payout_period Zod validation in profile actions

**Files:**
- Modify: `server/actions/profile.ts` (find and fix the Zod validation enums)

**Step 1: Locate and fix the Zod validation mismatch**

Search for the incorrect enum values in `server/actions/profile.ts`. The `artist_level` validation uses `APPRENTICE/JUNIOR/SENIOR/MASTER` instead of `NORMAL/HEAD_ARTIST/OWNER`, and `payout_period` uses `BIWEEKLY` instead of `BIMONTHLY`.

Find the Zod schema definitions and update them to match the actual enum values:

```typescript
// BEFORE (incorrect):
artist_level: z.enum(['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER']).optional(),
payout_period: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),

// AFTER (correct):
artist_level: z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER']).optional(),
payout_period: z.enum(['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY']).optional(),
```

**Step 2: Verify lint**

```bash
bun run lint 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix(profile): correct artist_level and payout_period Zod enum values"
```

---

## Phase 5: Deductions Integration in Payroll Flow

### Task 11: Integrate applyDeductions into completePayrollRequest

**Files:**
- Modify: `server/actions/payroll.ts:948-1068`

**Step 1: Find the completePayrollRequest function and integrate deductions**

In `completePayrollRequest()`, after calculating total amounts and before creating the accounting ledger entry, add deduction application logic:

```typescript
        // Apply pending deductions for this staff member
        try {
            const pendingDeductions = await db
                .select()
                .from(payrollDeductions)
                .where(
                    and(
                        eq(payrollDeductions.userId, request.staffId),
                        eq(payrollDeductions.status, 'PENDING')
                    )
                )

            if (pendingDeductions.length > 0) {
                const totalDeduction = pendingDeductions.reduce(
                    (sum, d) => sum + d.amount, 0
                )

                // Mark deductions as applied
                for (const deduction of pendingDeductions) {
                    await db
                        .update(payrollDeductions)
                        .set({
                            status: 'DEDUCTED',
                            deductedAt: new Date(),
                        })
                        .where(eq(payrollDeductions.id, deduction.id))
                }

                createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'PAYROLL',
                        message: `Applied ${pendingDeductions.length} deductions totaling ${totalDeduction} for staff ${request.staffId}`,
                    }],
                })
            }
        } catch (deductionError) {
            await logError({
                type: 'PAYROLL',
                message: `Failed to apply deductions for payroll ${requestId}: ${deductionError instanceof Error ? deductionError.message : String(deductionError)}`
            })
            // Don't fail the payment - deductions are best-effort
        }
```

**Step 2: Verify lint**

```bash
bun run lint 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat(payroll): integrate deduction application into completePayrollRequest flow"
```

---

## Phase 6: Payroll Manager & My Payroll UI Audit Fixes

### Task 12: Add deduction management UI to Payroll Manager

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Step 1: Add deductions server action imports and hooks**

Add `createAdvance`, `createDeduction`, `getPendingDeductions`, `cancelDeduction` to the payroll action imports.

**Step 2: Add a Deductions tab to the payroll page**

Add a `'deductions'` tab type alongside `'dashboard' | 'requests' | 'rates'`. Create a `DeductionsTab` component that shows:
- Active advances/deductions per staff member
- Create advance/deduction modal (admin-only)
- Cancel deduction button

This should include a table listing all deductions with columns: Staff, Type, Amount, Reason, Status, Date, Actions.

**Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add deductions management tab to payroll manager"
```

---

### Task 13: Show service type on My Payroll earnings list

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Step 1: Display service type from rate snapshot in earnings entries**

In the earnings list, each `PayrollEntry` has an `artist_rate_snapshot` field containing `serviceType`. Add a badge/tag showing the service type (Tattoo/Piercing/Shoe) next to each entry.

Find the entry rendering in the earnings list and add:

```typescript
{entry.artist_rate_snapshot?.serviceType && (
    <span className='text-xs px-2 py-0.5 rounded bg-white/10 text-white/60'>
        {entry.artist_rate_snapshot.serviceType}
    </span>
)}
```

**Step 2: Commit**

```bash
git add app/my-payroll/myPayrollPage.tsx
git commit -m "feat(my-payroll): display service type badge on earnings entries"
```

---

### Task 14: Show service type on Payroll Manager entries

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Step 1: Display service type in payroll entry details**

In the payroll manager, wherever entries are displayed (within payment requests, pending entries), add a service type badge similar to Task 13.

**Step 2: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(payroll): display service type badge on entries in manager view"
```

---

### Task 15: Fix payroll entry to store service type from rate snapshot

**Files:**
- Modify: `server/actions/payroll.ts` (the `calculateAndCreatePayrollEntry` and `createPayrollEntry` functions)

**Step 1: Ensure artistRateSnapshot captures serviceType**

The `calculateAndCreatePayrollEntry` function already stores `serviceType` in the `artistRateSnapshot` (line 534). Verify that `createPayrollEntry` (the manual entry function) also captures it. In the `createPayrollEntry` function around line 393-462, ensure the snapshot includes the resolved `serviceType`.

For manual entries that don't have a rate, add `serviceType: 'MANUAL'` to the snapshot.

**Step 2: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): ensure serviceType is stored in artist rate snapshot for all entries"
```

---

## Phase 7: Sales Integration for Shoe Services

### Task 16: Add service_type mapping from appointment type to payroll service type

**Files:**
- Modify: `server/actions/sales.ts`

**Step 1: Map appointment type to payroll service type**

In `server/actions/sales.ts`, when creating a transaction from an appointment, ensure the `client_type` and service type context are passed. Add a utility mapping function:

```typescript
export function mapAppointmentTypeToServiceType(type: string | null): ServiceType {
    switch (type) {
        case 'TATTOO': return 'TATTOO'
        case 'PIERCING': return 'PIERCING'
        case 'SHOE': return 'SHOE'
        default: return 'TATTOO'
    }
}
```

**Step 2: Use this mapping in transaction creation from appointments**

When `createTransactionFromAppointment` calls `calculateAndCreatePayrollEntry`, pass the mapped `serviceType`.

**Step 3: Commit**

```bash
git add server/actions/sales.ts
git commit -m "feat(sales): map appointment type to payroll service type for shoe services"
```

---

### Task 17: Update SalesContext to provide service type context for payroll

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`

**Step 1: Track service type alongside client type in cart state**

In `SalesContext.tsx`, the `clientType` state already exists. Add awareness of service types in the cart items so when a service is added, its type (TATTOO/PIERCING/SHOE) is known and can be passed through to the payroll calculation.

Add a `serviceTypeMapping` that looks up each service's type when building the transaction payload.

**Step 2: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "feat(sales): track service type in cart for payroll rate resolution"
```

---

## Phase 8: Additional Robustness Fixes

### Task 18: Add service_type field to payrollEntry for direct queryability

**Files:**
- Modify: `server/db/schema/payroll.ts` (payrollEntry table)
- Modify: `server/actions/payroll.ts` (createPayrollEntry, calculateAndCreatePayrollEntry)

**Step 1: Add serviceType column to payrollEntry**

In `server/db/schema/payroll.ts`, add `serviceType` column to the `payrollEntry` table:

```typescript
    // Service type for direct queryability
    serviceType: varchar('service_type', { length: 50 }),
    // Type: 'TATTOO', 'PIERCING', 'SHOE'
```

Add an index:

```typescript
    serviceTypeIdx: index('idx_payroll_entry_service_type').on(table.serviceType),
```

**Step 2: Populate serviceType when creating payroll entries**

In `server/actions/payroll.ts`, update both `calculateAndCreatePayrollEntry` and `createPayrollEntry` to include `serviceType` in the insert values:

```typescript
serviceType: serviceType, // 'TATTOO', 'PIERCING', or 'SHOE'
```

**Step 3: Run drizzle push**

```bash
bunx drizzle-kit push
```

**Step 4: Commit**

```bash
git add server/db/schema/payroll.ts server/actions/payroll.ts
git commit -m "feat(payroll): add service_type column to payroll_entry for direct filtering"
```

---

### Task 19: Add payroll entry filtering by service type on My Payroll page

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Step 1: Add service type filter to earnings list**

Add filter buttons (All / Tattoo / Piercing / Shoe) above the earnings list to let staff filter their payroll entries by service type.

**Step 2: Commit**

```bash
git add app/my-payroll/myPayrollPage.tsx
git commit -m "feat(my-payroll): add service type filter to earnings list"
```

---

### Task 20: Update the ManualPayrollEntryModal to support service type selection

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (ManualPayrollEntryModal component)

**Step 1: Add service type dropdown to ManualPayrollEntryModal**

In the ManualPayrollEntryModal (around line 73), add a service type selector alongside the existing staff selection. This allows admins to correctly categorize manual payroll entries.

Add after the amount input:

```typescript
<div>
    <label className='block text-sm font-medium mb-1'>Service Type</label>
    <select
        value={serviceType}
        onChange={(e) => setServiceType(e.target.value)}
        className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
    >
        <option value='TATTOO'>Tattoo</option>
        <option value='PIERCING'>Piercing</option>
        <option value='SHOE'>Shoe</option>
    </select>
</div>
```

**Step 2: Update the manualPayrollEntry server action to accept service_type**

In `server/actions/payroll.ts`, update `createManualPayrollEntry` and `ManualPayrollEntrySchema` to accept an optional `service_type` field.

**Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx server/actions/payroll.ts server/actions/payroll-schemas.ts
git commit -m "feat(payroll): add service type selector to manual entry modal"
```

---

### Task 21: Add audit logging for payroll rate changes

**Files:**
- Modify: `server/actions/payroll.ts`

**Step 1: Enhance logging in updateStaffRate and createStaffRate**

Both functions already have basic logging. Add before/after data to the log messages for audit trail:

In `updateStaffRate`, after successfully updating, log the old vs new values:

```typescript
createLogs({
    logs: [{
        level: 'INFO',
        type: 'PAYROLL',
        message: `Staff rate updated: ${id} by ${user.id}. Old: shop=${existing[0].shopPercentage}%/artist=${existing[0].artistPercentage}%, New: shop=${updates.shop_percentage || Number(existing[0].shopPercentage)}%/artist=${updates.artist_percentage || Number(existing[0].artistPercentage)}%`,
    }],
})
```

**Step 2: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat(payroll): add detailed audit logging for rate changes"
```

---

## Phase 9: Verification & Build

### Task 22: Run full lint and build verification

**Step 1: Run lint**

```bash
bun run lint
```

**Step 2: Run build**

```bash
bun run build
```

**Step 3: Fix any lint/build errors**

If there are errors, fix them and re-run.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix lint and build errors from payroll audit changes"
```

---

## Summary of All Changes

| # | What | Files |
|---|------|-------|
| 1 | Add SHOE to ServiceType enum | `utils/types/payroll.ts`, `server/actions/payroll-schemas.ts` |
| 2 | Update schema comments for SHOE | `server/db/schema/payroll.ts` |
| 3 | Add service_type column to services table | `server/db/schema/services.ts` |
| 4 | Fix hardcoded service/client type in calculateAndCreatePayrollEntry | `server/actions/payroll.ts` |
| 5 | Pass client_type through transaction creation flow | `server/actions/transactions.ts` |
| 6 | Store client_type on transaction table | `server/db/schema/transactions.ts`, `server/actions/transactions.ts` |
| 7 | Add SHOE rate section to Rates tab | `app/payroll/payrollPage.tsx` |
| 8 | Add createStaffRate action + CreateRateModal | `server/actions/payroll.ts`, `app/payroll/payrollPage.tsx` |
| 9 | Add SHOE rates to seed scripts (idempotent) | `scripts/seed-database.ts`, `scripts/seed-shoe-rates.ts` |
| 10 | Fix Zod validation mismatch for artist_level & payout_period | `server/actions/profile.ts` |
| 11 | Integrate applyDeductions into completePayrollRequest | `server/actions/payroll.ts` |
| 12 | Add deductions tab to payroll manager | `app/payroll/payrollPage.tsx` |
| 13 | Show service type on My Payroll earnings | `app/my-payroll/myPayrollPage.tsx` |
| 14 | Show service type on Payroll Manager entries | `app/payroll/payrollPage.tsx` |
| 15 | Store serviceType in rate snapshot for all entries | `server/actions/payroll.ts` |
| 16 | Map appointment type to payroll service type | `server/actions/sales.ts` |
| 17 | Track service type in SalesContext cart | `components/sales/context/SalesContext.tsx` |
| 18 | Add service_type column to payrollEntry table | `server/db/schema/payroll.ts`, `server/actions/payroll.ts` |
| 19 | Add service type filter to My Payroll page | `app/my-payroll/myPayrollPage.tsx` |
| 20 | Add service type to manual entry modal | `app/payroll/payrollPage.tsx`, `server/actions/payroll.ts`, `server/actions/payroll-schemas.ts` |
| 21 | Enhanced audit logging for rate changes | `server/actions/payroll.ts` |
| 22 | Full lint & build verification | All files |

## Key Risks & Mitigations

1. **Database migration**: The `service_type` column on `services` and `payroll_entry`, and `client_type` column on `transactions` are additive (nullable/defaults). No breaking changes. Use `drizzle-kit push` for schema sync.

2. **Existing data**: Existing payroll entries will have `serviceType: null` (added as nullable). The rate snapshot `serviceType` field provides historical context. Run a backfill migration separately if needed.

3. **Rate lookup fallback**: `calculateAndCreatePayrollEntry` still defaults to `'TATTOO'`/`'WALKIN'` if service/client type can't be resolved, preserving backward compatibility.

4. **SHOE rates not configured**: If no SHOE rate exists, the function returns an error. The seed script (Task 9) creates defaults. Admins can also create rates via the new Create Rate modal.

5. **Deductions integration**: Applied as best-effort during `completePayrollRequest`. Failures are logged but don't block payment completion.

6. **Seed script idempotency**: The original `seed-database.ts` had a blanket skip that would prevent adding SHOE rates after TATTOO/PIERCING existed. Now fixed with per-row `onConflictDoNothing()` + existence checks. Both the main seed script and standalone `seed-shoe-rates.ts` can be safely re-run multiple times — existing rate combos are skipped, new ones are inserted.