# Testing Guide

This guide covers manual testing procedures for the Inksight RDMD application.

## Prerequisites

Before running tests, ensure:

- [ ] Development database is running and accessible
- [ ] Environment variables are configured (`.env.local`)
- [ ] Dependencies are installed (`bun install`)
- [ ] Development server can start (`bun run dev`)

## Quality Checks

Run these commands before testing:

```bash
# TypeScript type checking
bunx tsc --noEmit

# ESLint validation
bun run lint

# Environment validation
bun run validate:env

# Database connection test
bun run scripts/check-schema.ts
```

## Manual Testing Checklist

### Authentication

#### Sign Up with Invitation Code
- [ ] Navigate to `/login`
- [ ] Click "Sign Up" link
- [ ] Enter valid invitation code
- [ ] Fill in user details (email, password, name)
- [ ] Submit form
- [ ] Verify account is created
- [ ] Verify welcome email is sent (if configured)

#### Sign In with Credentials
- [ ] Navigate to `/login`
- [ ] Enter valid email and password
- [ ] Submit form
- [ ] Verify successful login
- [ ] Verify redirect to dashboard

#### Password Reset Flow
- [ ] Navigate to `/login`
- [ ] Click "Forgot Password" link
- [ ] Enter registered email
- [ ] Submit form
- [ ] Check email for reset link
- [ ] Click reset link
- [ ] Enter new password
- [ ] Verify password is updated

#### Session Persistence
- [ ] Log in to application
- [ ] Close browser tab
- [ ] Reopen application
- [ ] Verify still logged in (session persisted)

### Appointments

#### Create New Appointment
- [ ] Navigate to Appointments page
- [ ] Click "New Appointment" button
- [ ] Fill in client information
- [ ] Select date and time
- [ ] Select service type
- [ ] Assign staff member
- [ ] Add notes
- [ ] Submit form
- [ ] Verify appointment appears on calendar

#### Update Appointment Status
- [ ] Open existing appointment
- [ ] Change status (e.g., PENDING → CONFIRMED)
- [ ] Save changes
- [ ] Verify status is updated

#### Create Walk-In
- [ ] Navigate to Appointments page
- [ ] Click "Walk-In" button
- [ ] Fill in client details
- [ ] Select service
- [ ] Submit form
- [ ] Verify walk-in is created with correct timestamp

### Inventory

#### Create Inventory Item
- [ ] Navigate to Inventory page
- [ ] Click "Add Item" button
- [ ] Fill in item details (name, type, category)
- [ ] Set initial stock quantity
- [ ] Set perishable status
- [ ] Submit form
- [ ] Verify item appears in inventory list

#### Update Stock Quantity
- [ ] Open existing inventory item
- [ ] Modify stock quantity
- [ ] Add reason for change
- [ ] Save changes
- [ ] Verify quantity is updated

#### Restock Logging
- [ ] Navigate to inventory item
- [ ] Click "Restock" button
- [ ] Enter quantity received
- [ ] Enter supplier information
- [ ] Submit restock entry
- [ ] Verify stock is increased
- [ ] Verify restock history is logged

#### Export Inventory
- [ ] Navigate to Inventory page
- [ ] Click "Export" button
- [ ] Select export format (CSV/Excel)
- [ ] Download file
- [ ] Verify data is accurate in exported file

### Sales/POS

#### Create Transaction
- [ ] Navigate to POS/Sales page
- [ ] Add items to cart
- [ ] Select customer (or create walk-in)
- [ ] Apply any discounts
- [ ] Select payment method
- [ ] Complete transaction
- [ ] Verify receipt is generated

#### Apply Discount
- [ ] Add items to cart
- [ ] Click "Apply Discount"
- [ ] Select discount type (percentage/fixed)
- [ ] Enter discount amount
- [ ] Verify total is recalculated

#### Split Payment
- [ ] Add items to cart
- [ ] Select "Split Payment" option
- [ ] Enter amounts for each payment method
- [ ] Verify totals match
- [ ] Complete transaction

#### Void Transaction
- [ ] Navigate to transaction history
- [ ] Select transaction to void
- [ ] Click "Void" button
- [ ] Enter reason for void
- [ ] Confirm void
- [ ] Verify transaction status is VOIDED

### Payroll

#### Time Clock In/Out
- [ ] Navigate to Payroll/Time Clock page
- [ ] Click "Clock In" button
- [ ] Verify timestamp is recorded
- [ ] Work for test period
- [ ] Click "Clock Out" button
- [ ] Verify total hours calculated

#### Create Payroll Request
- [ ] Navigate to Payroll page
- [ ] Click "New Request" button
- [ ] Select date range
- [ ] Review calculated hours
- [ ] Submit request
- [ ] Verify request is pending

#### Approve/Reject Payroll
- [ ] Log in as admin/manager
- [ ] Navigate to Payroll Approvals
- [ ] Select pending request
- [ ] Review hours and calculations
- [ ] Click "Approve" or "Reject"
- [ ] Add notes if rejecting
- [ ] Verify status is updated

#### View Payroll History
- [ ] Navigate to Payroll page
- [ ] Click "History" tab
- [ ] Verify past payrolls are listed
- [ ] Click on specific payroll
- [ ] Verify details are accurate

### Admin

#### Branch Management
- [ ] Navigate to Admin → Branches
- [ ] Click "Add Branch" button
- [ ] Fill in branch details (name, address, phone)
- [ ] Submit form
- [ ] Verify branch is created
- [ ] Edit existing branch
- [ ] Verify changes are saved

#### User Management
- [ ] Navigate to Admin → Users
- [ ] View list of users
- [ ] Click on user to edit
- [ ] Modify user role
- [ ] Update user permissions
- [ ] Save changes
- [ ] Verify changes are applied

#### System Settings
- [ ] Navigate to Admin → Settings
- [ ] Update business information
- [ ] Modify tax settings
- [ ] Update notification preferences
- [ ] Save settings
- [ ] Verify changes persist after refresh

## Automated Testing

### Running Integration Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/integration/appointments.test.ts
```

### Test Files Location

- `tests/integration/` - Integration tests for server actions
- `tests/integration/appointments.test.ts` - Appointment action tests
- `tests/integration/inventory.test.ts` - Inventory action tests

## Troubleshooting

### Common Issues

#### Database Connection Errors
- Verify `DATABASE_URL` in `.env.local`
- Check database server is running
- Ensure network connectivity

#### Environment Variable Errors
- Run `bun run validate:env` to check configuration
- Verify all required variables are set
- Check for typos in variable names

#### TypeScript Errors
- Run `bunx tsc --noEmit` to see errors
- Check for missing type definitions
- Ensure `@types/bun` is installed

#### Lint Errors
- Run `bun run lint` to see issues
- Most issues can be auto-fixed with `bun run lint --fix`

## Test Data Management

### Creating Test Data

Use the seed script to populate test data:

```bash
bun run scripts/seed-database.ts
```

### Generating Test Invitations

Create invitation codes for testing:

```bash
bun run scripts/generate-invite.ts
```

### Cleaning Test Data

⚠️ **Warning**: Only run in development environment!

```bash
# Clean all data (destructive)
bun run scripts/clean-test-data.ts
```

## Performance Testing

### Load Testing Checklist

- [ ] Concurrent user login (10+ users)
- [ ] Multiple simultaneous transactions
- [ ] Large inventory dataset (1000+ items)
- [ ] Calendar with many appointments
- [ ] Report generation with date ranges

### Browser Compatibility

Test in these browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Responsiveness

Test on these devices:
- [ ] iPhone (iOS Safari)
- [ ] Android (Chrome)
- [ ] iPad/Tablet
- [ ] Desktop (various resolutions)

## Security Testing

### Authentication Security
- [ ] Verify password requirements enforced
- [ ] Test for SQL injection in login forms
- [ ] Verify session timeout after inactivity
- [ ] Test CSRF protection on forms

### Authorization Testing
- [ ] Verify role-based access control
- [ ] Test accessing admin pages as non-admin
- [ ] Verify users can't access other users' data
- [ ] Test API endpoint authorization

## Release Testing

Before each release, verify:

1. All quality checks pass
2. Manual testing checklist completed
3. No console errors in browser
4. No errors in server logs
5. All critical workflows functional
6. Documentation is up to date

## Feedback and Updates

If you find issues during testing:

1. Document the exact steps to reproduce
2. Note the expected vs actual behavior
3. Include browser and OS information
4. Take screenshots if applicable
5. Report to the development team

---

**Last Updated**: March 2026

**Version**: 2026.1.0
