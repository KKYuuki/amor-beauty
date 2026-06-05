# InkSight RDMD System Actions

## Overview

All server actions are located in `server/actions/` and use Drizzle ORM for PostgreSQL.

## Available Actions

### Authentication & Users (`profile.ts`)
- `getProfile(userId)` - Get user profile
- `getProfiles()` - Get all user profiles
- `updateProfile(userId, profile)` - Update user profile
- `createUser(params)` - Create new user (admin only)
- `inviteUser(params)` - Send invitation (admin only)

### Time Clock (`time-clock.ts`)
- `getClockStatus(staffId)` - Get current clock status
- `clockIn(staffId, notes?)` - Clock in staff
- `clockOut(staffId, notes?)` - Clock out staff
- `getStaffSchedule(staffId)` - Get staff schedule
- `updateStaffSchedule(staffId, schedules)` - Update schedule

### Inventory (`inventory.ts`)
- `getInventory()` - Get all active inventory
- `createInventoryItem(item)` - Create item
- `updateInventoryItem(itemId, item)` - Update item
- `deleteInventoryItem(itemId)` - Soft delete
- `restockInventoryItem(itemId, quantity)` - Add stock

### Logging (`logs.ts`)
- `createLogs({ logs })` - Create log entries
- `getLogs(page, level?, type?)` - Get paginated logs

### Email (`email.ts`)
- `sendEmail(to, subject, mail)` - Send email via Resend
- `sendAppointmentCreatedEmail(...)` - Appointment notification
- `sendAppointmentStatusEmail(...)` - Status update notification
- `sendAppointmentReminderEmail(...)` - Reminder notification
- `sendInventoryLowEmail(...)` - Low stock alert
- `sendInventoryRestockRequestEmail(...)` - Restock request
- `sendPayrollRequestNotification(...)` - Payroll request to managers
- `sendPayrollConfirmedNotification(...)` - Payment confirmed
- `sendPayrollCompletedNotification(...)` - Payment completed
- `sendPayrollCancelledNotification(...)` - Payment cancelled

### Accounting (`accounting.ts`)
- `getAllTransactions()` - Get all transactions
- `createTransaction(data)` - Create transaction
- `updateTransaction(id, data)` - Update transaction
- `deleteTransaction(id)` - Delete transaction

### Appointments (`appointments.ts`)
- `getAppointments()` - Get all appointments
- `createAppointment(data)` - Create appointment
- `updateAppointment(id, data)` - Update appointment
- `deleteAppointment(id)` - Cancel appointment

### Services (`services.ts`)
- `getServices()` - Get all services
- `createService(data)` - Create service
- `updateService(id, data)` - Update service
- `deleteService(id)` - Delete service

### Branches (`branches.ts`)
- `getBranches()` - Get all branches
- `createBranch(data)` - Create branch
- `updateBranch(id, data)` - Update branch
- `deleteBranch(id)` - Delete branch

### Payroll (`payroll.ts`)
- `getPayrollRecords()` - Get all payroll records
- `createPayrollRecord(data)` - Create payroll record
- `updatePayrollRecord(id, data)` - Update payroll record
- `deletePayrollRecord(id)` - Delete payroll record
- `requestPayment(staffId, amount)` - Staff request payment
- `confirmPayment(id)` - Manager confirm payment
- `completePayment(id, method)` - Mark payment complete
- `cancelPayment(id, reason)` - Cancel payment request

### Settings (`settings.ts`)
- `getSettings()` - Get system settings
- `updateSettings(data)` - Update settings

### Payment Methods (`payment-methods.ts`)
- `getPaymentMethods()` - Get all payment methods
- `createPaymentMethod(data)` - Create payment method
- `updatePaymentMethod(id, data)` - Update payment method
- `deletePaymentMethod(id)` - Delete payment method

### Metrics (`metrics.ts`)
- `getDashboardMetrics()` - Get dashboard KPIs
- `getRevenueMetrics(period)` - Get revenue data
- `getAppointmentMetrics(period)` - Get appointment stats

### Public (`public.ts`)
- `getPublicServices()` - Get services for public booking
- `getPublicBranches()` - Get branches for public booking
- `submitContactForm(data)` - Submit contact form

## Log Types
- `APPOINTMENT` - Appointment events
- `INVENTORY` - Inventory changes
- `SYSTEM` - System events
- `AUTH` - Authentication events
- `ACCOUNTING` - Financial transactions
- `PAYROLL` - Payroll events
- `OTHER` - Miscellaneous

## Log Levels
- `INFO` - Informational
- `WARN` - Warning
- `ERROR` - Error
- `DEBUG` - Debug information
- `FATAL` - Critical error

## Error Handling

All actions follow consistent error handling:
1. Check for errors from database operations
2. Log errors via `createLogs()` with appropriate level and type
3. Throw user-friendly error messages

Example:
```typescript
const { data, error } = await db.from('users').select('*')
if (error) {
    await createLogs({
        logs: [
            {
                level: 'ERROR',
                type: 'AUTH',
                message: `Failed to fetch users: ${error.message}`,
            },
        ],
    })
    throw new Error('Failed to fetch users')
}
```

## Usage Guidelines

### Import Pattern
```typescript
import { createLogs } from './logs'
```

### Logging Best Practices
- Always log errors with `ERROR` level
- Use `INFO` for successful operations
- Use `WARN` for recoverable issues
- Include relevant context in messages
- Use appropriate log type for the domain
