# Service Type & Is Shared Fields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `service_type` and `is_shared` fields to service create/edit forms, refactor the inline service modal into a standalone component using BaseModal, and display these fields in the service list.

**Architecture:** Extract the service form from `configPage.tsx` into a standalone `ServiceModal` component that uses `BaseModal`. Add `service_type` and `is_shared` to server payloads and DB operations. Update the service list cards to display badges for these fields. Keep the form as a flat single-page modal (not a wizard) since ~8 fields is manageable.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Drizzle ORM, Supabase

---

### Task 1: Update Server Payloads — Add `service_type` and `is_shared`

**Files:**
- Modify: `server/actions/services.ts:22-44` (CreateServicePayload, UpdateServicePayload)

**Step 1: Update CreateServicePayload**

Add `service_type` and `is_shared` to the `CreateServicePayload` type:

```typescript
export type CreateServicePayload = {
    title: string
    price: number
    pricing_type?: 'FIXED' | 'HOURLY'
    hourly_rate?: number
    branch_id?: string | null
    is_shared?: boolean
    service_type?: 'TATTOO' | 'PIERCING' | 'SHOE'
    items: {
        inventory_id: string
        quantity: number
    }[]
}
```

**Step 2: Update UpdateServicePayload**

Add the same fields to `UpdateServicePayload`:

```typescript
export type UpdateServicePayload = {
    title: string
    price: number
    pricing_type?: 'FIXED' | 'HOURLY'
    hourly_rate?: number
    branch_id?: string | null
    is_shared?: boolean
    service_type?: 'TATTOO' | 'PIERCING' | 'SHOE'
    items: {
        inventory_id: string
        quantity: number
    }[]
}
```

**Step 3: Verify it compiles**

Run: `bun run build 2>&1 | head -40`
Expected: Build should still pass (fields are optional, so existing callers still work)

**Step 4: Commit**

```bash
git add server/actions/services.ts
git commit -m "feat(services): add service_type and is_shared to payload types"
```

---

### Task 2: Update Server Action — Persist `service_type` and `is_shared`

**Files:**
- Modify: `server/actions/services.ts:208-272` (createService function)
- Modify: `server/actions/services.ts:274-351` (updateService function)

**Step 1: Update createService to persist new fields**

In the `createService` function, update the `db.insert(services).values({...})` call (around line 226) to include the new fields:

```typescript
const [newService] = await db.insert(services).values({
    title: sanitizeText(payload.title),
    price: String(payload.price),
    pricingType: payload.pricing_type || 'FIXED',
    hourlyRate: payload.hourly_rate ? String(payload.hourly_rate) : '0',
    branchId: payload.branch_id,
    isShared: payload.is_shared ?? false,
    serviceType: payload.service_type || 'TATTOO',
    isActive: true,
}).returning()
```

**Step 2: Update updateService to persist new fields**

In the `updateService` function, update the `db.update(services).set({...})` call (around line 299) to include the new fields:

```typescript
await db.update(services)
    .set({
        title: sanitizeText(payload.title),
        price: String(payload.price),
        pricingType: payload.pricing_type || 'FIXED',
        hourlyRate: payload.hourly_rate ? String(payload.hourly_rate) : '0',
        branchId: payload.branch_id,
        isShared: payload.is_shared ?? false,
        serviceType: payload.service_type || 'TATTOO',
        updatedAt: new Date(),
    })
    .where(eq(services.id, id))
```

**Step 3: Verify it compiles**

Run: `bun run build 2>&1 | head -40`
Expected: Build should still pass

**Step 4: Commit**

```bash
git add server/actions/services.ts
git commit -m "feat(services): persist service_type and is_shared in create/update"
```

---

### Task 3: Update getInactiveServices to Return `service_type` and `is_shared`

**Files:**
- Modify: `server/actions/services.ts:136-202` (getInactiveServices function)

**Step 1: Add missing fields to getInactiveServices response**

In the `getInactiveServices` function, the response mapping (around line 172) is missing `service_type` and `is_shared`. Update the returned object to include them:

```typescript
return {
    id: service.id,
    created_at: service.createdAt.toISOString(),
    title: service.title,
    price: Number(service.price),
    pricing_type: service.pricingType as 'FIXED' | 'HOURLY',
    hourly_rate: Number(service.hourlyRate),
    is_active: service.isActive,
    is_shared: service.isShared ?? false,
    service_type: service.serviceType as 'TATTOO' | 'PIERCING' | 'SHOE' | undefined,
    items: items.map(item => ({
        service_id: item.serviceId,
        inventory_id: item.inventoryId,
        quantity: String(item.quantity),
        fluid_quantity: item.fluidQuantity ? Number(item.fluidQuantity) : undefined,
        inventory: {
            name: item.inventoryName,
            unit_price: Number(item.inventoryUnitPrice || 0),
        }
    }))
}
```

**Step 2: Verify it compiles**

Run: `bun run build 2>&1 | head -40`
Expected: Build should pass

**Step 3: Commit**

```bash
git add server/actions/services.ts
git commit -m "fix(services): return service_type and is_shared in inactive services"
```

---

### Task 4: Create the ServiceModal Component

**Files:**
- Create: `components/services/ServiceModal.tsx`

**Step 1: Create the ServiceModal component**

This component extracts the inline service form from `configPage.tsx` into a standalone `BaseModal`-based component with `service_type` and `is_shared` fields.

```typescript
"use client"

import { useState, useEffect, useRef, useContext } from "react"
import { AnimatePresence, motion } from "motion/react"
import { SaveIcon, XIcon, PackageIcon, ShareIcon, TagIcon } from "lucide-react"
import BaseModal from "@/components/inventory/BaseModal"
import { Button } from "@/components/ui/button"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { BranchSelectorInline } from "@/components/ui/branch-selector-inline"
import { ServiceWithItems } from "@/server/actions/services"
import { InventoryItem } from "@/utils/types/inventory"
import { ServiceType } from "@/utils/types/payroll"

type ServiceFormState = {
    title: string
    price: number
    pricing_type: "FIXED" | "HOURLY"
    hourly_rate: number
    items: { inventory_id: string; quantity: number }[]
    branch_id: string | null
    service_type: ServiceType
    is_shared: boolean
}

interface ServiceModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (form: ServiceFormState) => Promise<void>
    editingService?: ServiceWithItems | null
    inventory: InventoryItem[]
    currencySymbol: string
    saving: boolean
}

const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string; description: string }[] = [
    { value: "TATTOO", label: "Tattoo", description: "Tattoo services" },
    { value: "PIERCING", label: "Piercing", description: "Piercing services" },
    { value: "SHOE", label: "Shoe Cleaning", description: "Shoe cleaning/repair services" },
]

export default function ServiceModal({
    isOpen,
    onClose,
    onSave,
    editingService,
    inventory,
    currencySymbol,
    saving,
}: ServiceModalProps) {
    const [form, setForm] = useState<ServiceFormState>({
        title: "",
        price: 0,
        pricing_type: "FIXED",
        hourly_rate: 0,
        items: [],
        branch_id: null,
        service_type: "TATTOO",
        is_shared: false,
    })
    const [itemSearch, setItemSearch] = useState("")
    const [showItemDropdown, setShowItemDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen) {
            if (editingService) {
                setForm({
                    title: editingService.title,
                    price: editingService.price,
                    pricing_type: editingService.pricing_type,
                    hourly_rate: editingService.hourly_rate,
                    items: editingService.items.map((i) => ({
                        inventory_id: i.inventory_id,
                        quantity: Number(i.quantity),
                    })),
                    branch_id: editingService.branch_id ?? null,
                    service_type: editingService.service_type ?? "TATTOO",
                    is_shared: editingService.is_shared ?? false,
                })
            } else {
                setForm({
                    title: "",
                    price: 0,
                    pricing_type: "FIXED",
                    hourly_rate: 0,
                    items: [],
                    branch_id: null,
                    service_type: "TATTOO",
                    is_shared: false,
                })
            }
            setItemSearch("")
            setShowItemDropdown(false)
        }
    }, [isOpen, editingService])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            if (showItemDropdown && dropdownRef.current && !dropdownRef.current.contains(target)) {
                setShowItemDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showItemDropdown])

    const handleSave = async () => {
        if (!form.title || form.price < 0) {
            return
        }
        await onSave(form)
    }

    const filteredItems = inventory.filter(
        (item) =>
            item.name.toLowerCase().includes(itemSearch.toLowerCase()) &&
            !form.items.find((i) => i.inventory_id === item.id)
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={editingService ? "Edit Service" : "New Service"}
            icon={TagIcon}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-500/10"
            size="lg"
            maxHeight="90vh"
            footer={
                <div className="flex gap-3 justify-end">
                    <Button onClick={onClose} variant="outline">
                        Cancel
                    </Button>
                    <AdminActionGuard onAction={handleSave}>
                        <Button loading={saving}>
                            <SaveIcon className="w-4 h-4" />
                            {editingService ? "Update Service" : "Create Service"}
                        </Button>
                    </AdminActionGuard>
                </div>
            }
        >
            <div className="flex flex-col gap-5">
                {/* Service Type */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-white/70">Service Type</span>
                    <div className="grid grid-cols-3 gap-2">
                        {SERVICE_TYPE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                    setForm({ ...form, service_type: option.value })
                                }
                                className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all cursor-pointer ${
                                    form.service_type === option.value
                                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                        : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10"
                                }`}
                            >
                                <span className="text-sm font-medium">{option.label}</span>
                                <span className="text-xs opacity-60">{option.description}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title & Price Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">Service Title</span>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                            placeholder="e.g., Full Sleeve Tattoo"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">
                            Base Price ({currencySymbol})
                        </span>
                        <input
                            type="number"
                            value={form.price}
                            onChange={(e) =>
                                setForm({ ...form, price: Number(e.target.value) })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                            min="0"
                        />
                    </label>
                </div>

                {/* Pricing Type & Hourly Rate */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">Pricing Type</span>
                        <select
                            value={form.pricing_type}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    pricing_type: e.target.value as "FIXED" | "HOURLY",
                                })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                        >
                            <option value="FIXED">Fixed Price</option>
                            <option value="HOURLY">Hourly Rate</option>
                        </select>
                    </label>
                    {form.pricing_type === "HOURLY" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-white/60">
                                Hourly Rate ({currencySymbol}/hr)
                            </span>
                            <input
                                type="number"
                                value={form.hourly_rate}
                                onChange={(e) =>
                                    setForm({ ...form, hourly_rate: Number(e.target.value) })
                                }
                                className="bg-white/10 rounded-md px-3 py-2 text-sm"
                                min="0"
                            />
                        </label>
                    )}
                </div>

                {/* Branch & Shared */}
                <div className="flex items-end gap-4">
                    <div className="flex-1">
                        <BranchSelectorInline
                            value={form.branch_id}
                            onChange={(id) => setForm({ ...form, branch_id: id })}
                            showAllOption={true}
                            label="Branch (optional)"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                        <input
                            type="checkbox"
                            checked={form.is_shared}
                            onChange={(e) =>
                                setForm({ ...form, is_shared: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-white/70 flex items-center gap-1.5">
                            <ShareIcon size={14} />
                            Shared across branches
                        </span>
                    </label>
                </div>

                {/* Linked Inventory Items */}
                <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-white/80">
                            Linked Inventory Items
                        </span>
                    </div>
                    <div ref={dropdownRef} className="relative">
                        <input
                            type="text"
                            placeholder="Search items to link..."
                            value={itemSearch}
                            onChange={(e) => setItemSearch(e.target.value)}
                            onFocus={() => setShowItemDropdown(true)}
                            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                        />
                        {showItemDropdown && (
                            <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {filteredItems.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-white/40 text-center">
                                        {itemSearch ? "No matching items" : "No items available"}
                                    </div>
                                ) : (
                                    filteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                setForm({
                                                    ...form,
                                                    items: [
                                                        ...form.items,
                                                        { inventory_id: item.id, quantity: 1 },
                                                    ],
                                                })
                                                setItemSearch("")
                                                setShowItemDropdown(false)
                                            }}
                                            className="w-full px-3 py-2 text-left hover:bg-white/10 text-sm text-left flex justify-between"
                                        >
                                            <span>{item.name}</span>
                                            <span className="text-white/60">
                                                ${item.unit_price}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {form.items.length === 0 ? (
                        <div className="text-sm text-white/40 italic p-4 border border-dashed border-white/10 rounded-md text-center">
                            No inventory items linked
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {form.items.map((item, index) => {
                                const invItem = inventory.find(
                                    (i) => i.id === item.inventory_id
                                )
                                return (
                                    <div
                                        key={item.inventory_id}
                                        className="flex items-center gap-3 bg-white/5 p-2 rounded-md"
                                    >
                                        <span className="flex-1 text-sm">
                                            {invItem?.name || "Unknown Item"}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-white/60">Qty:</span>
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => {
                                                    const newItems = [...form.items]
                                                    newItems[index].quantity = Math.max(
                                                        1,
                                                        Number(e.target.value)
                                                    )
                                                    setForm({ ...form, items: newItems })
                                                }}
                                                className="w-16 bg-white/10 rounded px-2 py-1 text-sm"
                                                min="1"
                                            />
                                        </div>
                                        <Button
                                            onClick={() => {
                                                const newItems = form.items.filter(
                                                    (_, i) => i !== index
                                                )
                                                setForm({ ...form, items: newItems })
                                            }}
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-400/20 h-8 w-8"
                                        >
                                            <XIcon size={16} />
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    )
}
```

**Step 2: Verify it compiles**

Run: `bun run build 2>&1 | head -40`
Expected: Build should pass or show only import-related errors (will be wired up in next task)

**Step 3: Commit**

```bash
git add components/services/ServiceModal.tsx
git commit -m "feat(services): create ServiceModal component with service_type and is_shared"
```

---

### Task 5: Wire ServiceModal into configPage.tsx — Replace Inline Form

**Files:**
- Modify: `app/config/configPage.tsx` (remove inline service modal, import and use ServiceModal)

**Step 1: Add import for ServiceModal**

At the top of `configPage.tsx`, add the import:

```typescript
import ServiceModal from "@/components/services/ServiceModal"
```

**Step 2: Update serviceForm state to include new fields**

Update the `serviceForm` state (around line 97-104) to include `service_type` and `is_shared`:

```typescript
const [serviceForm, setServiceForm] = useState({
    title: "",
    price: 0,
    pricing_type: "FIXED" as "FIXED" | "HOURLY",
    hourly_rate: 0,
    items: [] as { inventory_id: string; quantity: number }[],
    branch_id: null as string | null,
    service_type: "TATTOO" as "TATTOO" | "PIERCING" | "SHOE",
    is_shared: false,
})
```

**Step 3: Update the Add Service button to set default values**

Update the "Add Service" button click handler (around line 414-424) to include the new fields:

```typescript
onClick={() => {
    setServiceForm({
        title: "",
        price: 0,
        pricing_type: "FIXED",
        hourly_rate: 0,
        items: [],
        branch_id: currentBranch?.id ?? null,
        service_type: "TATTOO",
        is_shared: false,
    })
    setEditingServiceId(null)
    setIsEditingService(true)
}}
```

**Step 4: Update edit button to include new fields**

Update the edit button click handler (around line 540-557) to include `service_type` and `is_shared`:

```typescript
onClick={() => {
    setServiceForm({
        title: service.title,
        price: service.price,
        pricing_type: service.pricing_type,
        hourly_rate: service.hourly_rate,
        items: service.items.map((i) => ({
            inventory_id: i.inventory_id,
            quantity: Number(i.quantity),
        })),
        branch_id: service.branch_id ?? null,
        service_type: service.service_type ?? "TATTOO",
        is_shared: service.is_shared ?? false,
    })
    setEditingServiceId(service.id)
    setIsEditingService(true)
}}
```

**Step 5: Update handleSaveService to use ServiceModal pattern**

Update the `handleSaveService` function (around line 306-344) to accept the form data. Change it to:

```typescript
const handleSaveService = async (form?: typeof serviceForm) => {
    const data = form || serviceForm
    if (!data.title || data.price < 0) {
        addNotification("Please fill in all required fields", "ERROR")
        return
    }

    setSaving(true)
    let result

    if (editingServiceId) {
        result = await updateService(editingServiceId, data, userInfo.id)
    } else {
        result = await createService(data, userInfo.id)
    }

    if (result.success) {
        addNotification(
            `Service ${editingServiceId ? "updated" : "created"} successfully`,
            "SUCCESS"
        )
        setIsEditingService(false)
        setEditingServiceId(null)
        setServiceForm({ title: "", price: 0, pricing_type: "FIXED", hourly_rate: 0, items: [], branch_id: null, service_type: "TATTOO", is_shared: false })
        await fetchServicesData()
        await fetchInactiveServicesData()
    } else {
        addNotification(
            `Failed to ${editingServiceId ? "update" : "create"} service`,
            "ERROR"
        )
    }
    setSaving(false)
}
```

**Step 6: Replace the inline modal with ServiceModal component**

Remove the entire `AnimatePresence` block that contains the inline service form (lines 587-869). Replace it with:

```tsx
<ServiceModal
    isOpen={isEditingService}
    onClose={() => {
        setIsEditingService(false)
        setEditingServiceId(null)
    }}
    onSave={async (form) => {
        setServiceForm(form)
        await handleSaveService(form)
    }}
    editingService={
        editingServiceId
            ? services.find((s) => s.id === editingServiceId) ?? null
            : null
    }
    inventory={inventory}
    currencySymbol={currencyTax.currency_symbol}
    saving={saving}
/>
```

**Step 7: Also remove the `itemSearch` and `showItemDropdown` state from configPage.tsx**

Remove these lines from configPage.tsx since they're now in ServiceModal:

```typescript
const [itemSearch, setItemSearch] = useState("")
const [showItemDropdown, setShowItemDropdown] = useState(false)
```

Also remove the `useEffect` for click-outside handler that references `showItemDropdown` (around lines 295-304).

**Step 8: Remove unused imports**

Remove `PackageIcon` from the lucide-react imports if it was only used in the service form. Check which imports are no longer needed after the refactor. Remove `AnimatePresence` and `motion` imports only if they are no longer used elsewhere in configPage.tsx (they likely are still used in the service list, so keep them).

**Step 9: Verify it renders**

Run: `bun run dev`
Expected: Service create/edit modal opens and closes correctly, all fields including service_type and is_shared are displayed and functional.

**Step 10: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "refactor(services): wire ServiceModal component into config page"
```

---

### Task 6: Display `service_type` and `is_shared` Badges in Service List Cards

**Files:**
- Modify: `app/config/configPage.tsx` (service list card rendering)

**Step 1: Add service_type and is_shared badges to active service cards**

In `renderServicesSettings()`, update the active service card (around lines 510-581). Find the div with `text-sm text-white/60` that shows pricing info and linked items, and add badges after the existing pricing badge:

```tsx
<div className='flex items-center gap-4 text-sm text-white/60'>
    <span>
        {service.pricing_type === "HOURLY"
            ? `${currencyTax.currency_symbol}${service.hourly_rate.toFixed(2)}/hr`
            : `${currencyTax.currency_symbol}${service.price.toFixed(2)}`}
    </span>
    {service.pricing_type === "HOURLY" && (
        <span className='text-xs bg-amber-400/20 px-2 py-0.5 rounded'>
            HOURLY
        </span>
    )}
    {service.service_type && (
        <span className={`text-xs px-2 py-0.5 rounded ${
            service.service_type === 'TATTOO' ? 'bg-purple-400/20 text-purple-300' :
            service.service_type === 'PIERCING' ? 'bg-cyan-400/20 text-cyan-300' :
            'bg-orange-400/20 text-orange-300'
        }`}>
            {service.service_type}
        </span>
    )}
    {service.is_shared && (
        <span className='text-xs bg-green-400/20 px-2 py-0.5 rounded text-green-300'>
            SHARED
        </span>
    )}
    {service.items.length > 0 && (
        <span className='flex items-center gap-1'>
            <PackageIcon size={14} />
            {service.items.length} linked item
            {service.items.length !== 1 ? "s" : ""}
        </span>
    )}
</div>
```

**Step 2: Add service_type and is_shared badges to inactive service cards**

Apply the same badge additions to the inactive service cards (around lines 452-476). Find the same pattern and add:

```tsx
{service.service_type && (
    <span className={`text-xs px-2 py-0.5 rounded ${
        service.service_type === 'TATTOO' ? 'bg-purple-400/20 text-purple-300' :
        service.service_type === 'PIERCING' ? 'bg-cyan-400/20 text-cyan-300' :
        'bg-orange-400/20 text-orange-300'
    }`}>
        {service.service_type}
    </span>
)}
{service.is_shared && (
    <span className='text-xs bg-green-400/20 text-xs px-2 py-0.5 rounded text-green-300'>
        SHARED
    </span>
)}
```

**Step 3: Verify rendering**

Run: `bun run dev`
Expected: Service cards show "TATTOO", "PIERCING", or "SHOE" badges, and shared services show "SHARED" badge

**Step 4: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "feat(services): display service_type and is_shared badges in service list"
```

---

### Task 7: Fix lint and build errors

**Files:**
- Any files with lint or build errors from previous tasks

**Step 1: Run lint**

Run: `bun run lint 2>&1`
Review all warnings and errors.

**Step 2: Fix all lint errors**

Address each lint error. Common issues to expect:
- Unused imports (remove them)
- Unused variables (remove or prefix with `_`)
- Missing type annotations (add them)
- Any TypeScript errors from the refactoring

**Step 3: Run build**

Run: `bun run build 2>&1`
Review all build errors and fix them.

**Step 4: Common build fixes**

Likely fixes needed:
- Ensure `ServiceType` import is added to `app/config/configPage.tsx` if used
- Ensure the `ServiceModal` props match what `configPage.tsx` is passing
- Ensure `service_type` type compatibility between `ServiceWithItems` response and form state
- Ensure `ShareIcon` is imported in the ServiceModal component

**Step 5: Verify clean build**

Run: `bun run build 2>&1`
Expected: Build completes successfully with no errors

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve lint and build errors from services refactor"
```

---

## Summary of Changes

| Area | Change |
|------|--------|
| **Server Payloads** | Add `service_type` and `is_shared` to `CreateServicePayload` and `UpdateServicePayload` |
| **Server Actions** | Persist `service_type` and `is_shared` in `createService()` and `updateService()` |
| **Server Actions** | Return `service_type` and `is_shared` in `getInactiveServices()` |
| **New Component** | `ServiceModal` - standalone modal using `BaseModal` with all fields |
| **Config Page** | Replace inline form with `ServiceModal` component |
| **Service List** | Display `service_type` badge (color-coded) and `is_shared` badge |
| **Form Fields** | Add service type selector (Tattoo/Piercing/Shoe), shared toggle checkbox |
| **Lint/Build** | Fix all errors and warnings |