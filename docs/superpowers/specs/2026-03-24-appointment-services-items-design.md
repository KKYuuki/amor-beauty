# Appointment Services & Items Feature Design

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Add multi-select services with quantities and inventory items to appointment creation and editing

## Overview

Enable users to select multiple services (with quantities) and inventory items (with quantities) when creating or editing appointments. This replaces the current single-service dropdown with a full multi-select interface.

## Requirements

1. **Services:** Multiple services with quantities per appointment
2. **Items:** Multiple inventory items with quantities per appointment
3. **Creation:** Full selection in `WalkinAppointmentModal`
4. **Editing:** Full add/remove in`AppointmentDetailClient`
5. **UI:** Tag-based multi-select with quantity controls (pill style)

## Architecture

### Components to Create/Modify

**Modify:**
- `components/appointments/WalkinAppointmentModal.tsx`
  - Add state for `selectedServices: ServiceWithQuantity[]`
  - Add state for `selectedItems: ItemWithQuantity[]`
  - Replace single service dropdown with multi-select UI

- `app/appointments/appointmentDetailClient.tsx`
  - Add editing UI for services and items
  - Integrate with existing edit mode

**Create:**
- `components/appointments/ServicesMultiSelect.tsx`
  - Reusable multi-select for services
  - Search dropdown + selected items as pills
  - Quantity controls `[−]Qty:1[+]` per item

- `components/appointments/ItemsMultiSelect.tsx`
  - Reusable multi-select for inventory items
  - Same pattern as services

### Shared Types

```typescript
//utils/types/general.ts
interface ServiceWithQuantity {
  id: string
  title: string
  price: number
  quantity: number
}

interface ItemWithQuantity {
  id: string
  name: string
  price?: number
  quantity: number
}
```

### Data Flow

**Creation Flow:**
```
User selects services/items in WalkinAppointmentModal
     ↓
createWalkinAppointment(payload)
     ↓
For each service: addServiceToAppointment(appointmentId, serviceId)
     ↓
For each item: addAppointmentItem(appointmentId, itemId, quantity)
```

**Editing Flow:**
```
User clicks Edit in appointmentDetailClient
     ↓
ServicesMultiSelect and ItemsMultiSelect become editable
     ↓
Add: addServiceToAppointment / addAppointmentItem (immediate)
Remove: removeServiceFromAppointment / deleteAppointmentItem (immediate)
```

## UI Design

### WalkinAppointmentModal

**Services Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ Services (Optional)                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search services...                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Small Tattoo - ₱500  [−]Qty:1  [+]  [✕]               │ │
│ │ Consultation - ₱200  [−]Qty:2  [+]  [✕]               │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Estimated Total: ₱900                                        │
└─────────────────────────────────────────────────────────────┘
```

**Items Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ Items (Optional)                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search inventory...                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Tattoo Ink Black - ₱150  [−]Qty:1  [+]  [✕]            │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Items Subtotal: ₱150                                        │
└─────────────────────────────────────────────────────────────┘
```

### AppointmentDetailClient

**Edit Mode Services:**
```
┌─────────────────────────────────────────────────────────────┐
│ Services                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Small Tattoo - ₱500  [−]Qty:1  [+]  [✕]               │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [+Add Service]                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search services...                                    │ │
│ │   • Photography - ₱300                                    │ │
│ │   • Touch-up - ₱400                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Edit Mode Items:**
```
┌─────────────────────────────────────────────────────────────┐
│ Items Used                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Tattoo Ink Black - ₱150  [−]Qty:1  [+]  [✕]            │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [+Add Item]                                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search inventory...                                   │ │
│ │   • Needles Pack - ₱200                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Behavior Details

### Quantity Controls
- `[−]` decrements quantity (minimum 1, clicking at 1 removes item)
- `[+]` increments quantity
- `[✕]` removes item entirely
- Quantity updates are immediate (no save button)

### Search Dropdown
- Filters services/inventory by name (case-insensitive)
- Client-side filtering (no API debounce)
- Shows price in dropdown option
- Click to add → appears as selected pill

### Total Calculation
- Real-time sum of selected items
- Services: sum(price × quantity)
- Items: sum(price × quantity) if price exists

### Permissions
- Only staff with appointment management permissions
- Same `isStaff` check as other edit controls
- Disabled when appointment status is COMPLETED or CANCELLED

## Error Handling

### Service Errors
-Duplicate service → Toast: "Service already added"
- Add failed → Toast: "Failed to add service", rollback UI

### Item Errors
- Item not found → Toast: "Item not found"
- Insufficient stock → Toast: "Insufficient stock (X available)"
- Duplicate item → Update quantity instead of new entry

### Network Errors
- Failed add/remove → Toast with error, rollback optimistic update
- Partial failures → Individual toasts for each failure

## Implementation Notes

### Server Actions (Already Exist)
- `addServiceToAppointment(appointmentId, serviceId)`
- `removeServiceFromAppointment(appointmentId, serviceId)`
- `getAppointmentServices(appointmentId)`
- `addAppointmentItem(appointmentId, itemId, quantity)`
- `updateAppointmentItem(appointmentItemId, quantity)`
- `deleteAppointmentItem(appointmentItemId)`
- `getAppointmentItems(appointmentId)`

### New Server Actions Needed
- `updateAppointmentServiceQuantity(appointmentId, serviceId, quantity)` - Update quantity for existing service

### Styling
- Match existing dark theme (bg-white/5, border-white/10)
- Use existing notification system for toasts
- Pill style matches `getStatusBadgeClasses` pattern

### Performance
- Load services/inventory once on component mount
- Client-side search filtering
- Optimistic UI updates with rollback