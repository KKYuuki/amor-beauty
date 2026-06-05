# E2E Testing Implementation Plan — InkSight RDMD

> **For agentic workers:** This plan is a browser-testing execution guide using `agent_browser`. Each task documents exact agent_browser commands with expected outputs. No code is written for the application itself — this is pure testing.

**Goal:** Execute 14 browser test sessions covering all 15 subsystems, document every defect found, and produce a structured issue log.

**Spec:** `docs/superpowers/specs/2026-05-25-e2e-testing-architectural-spec.md`

---

## File Map

| File | Purpose |
|------|---------|
| **Create:** `scripts/e2e-setup.ts` | Bun script: creates test accounts via invitations + seeds test-specific services/inventory |
| **Create:** `docs/superpowers/issues/2026-05-25-issues-log.md` | Structured defect log — one entry per bug found |
| **Create:** `docs/superpowers/test-sessions/session-01-setup-auth.md` | Session 1: Environment verification + auth |
| **Create:** `docs/superpowers/test-sessions/session-02-services-inventory.md` | Session 2: Services & inventory setup |
| **Create:** `docs/superpowers/test-sessions/session-03-payroll-rates.md` | Session 3: Payroll rate configuration |
| **Create:** `docs/superpowers/test-sessions/session-04-appt-tattoo-lifecycle.md` | Session 4: Tattoo appointment full lifecycle |
| **Create:** `docs/superpowers/test-sessions/session-05-appt-other-types.md` | Session 5: Piercing + Shoe + Other |
| **Create:** `docs/superpowers/test-sessions/session-06-walkin-downpayment.md` | Session 6: Walk-in with downpayment |
| **Create:** `docs/superpowers/test-sessions/session-07-reschedule-cancel.md` | Session 7: Reschedule & cancel |
| **Create:** `docs/superpowers/test-sessions/session-08-sales-deep.md` | Session 8: Sales deep dive |
| **Create:** `docs/superpowers/test-sessions/session-09-payroll-processing.md` | Session 9: Payroll processing |
| **Create:** `docs/superpowers/test-sessions/session-10-accounting.md` | Session 10: Accounting verification |
| **Create:** `docs/superpowers/test-sessions/session-11-timeclock.md` | Session 11: Time-clock |
| **Create:** `docs/superpowers/test-sessions/session-12-metrics-config.md` | Session 12-13: Metrics, config, navigation |
| **Create:** `docs/superpowers/test-sessions/session-13-cleanup.md` | Session 14: Cleanup + cross-account verification |

---

## Phase 1: Foundation (Environment, Accounts, Seed Data)

> **Deliverable:** Running dev server, 4 test accounts registered, baseline seed data verified, all accounts can log in.

---

### Task 1: Verify Environment & Seed Database

**Files:**
- Use: `scripts/check-all-tables.ts`, `scripts/seed-database.ts`

**Dependencies:** None

**TDD Cycle:**

- [x] **RED: Attempt to check database state (may fail if DB unreachable)**

  First, verify the dev server is NOT running to avoid port conflicts:
  ```bash
  lsof -i :3000 | grep LISTEN
  ```
  If a process is listed, kill it:
  ```bash
  kill -9 $(lsof -ti :3000)
  ```

  Start the dev server in the background and wait for it to become ready:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run dev &
  # Wait up to 30 seconds for the server to start
  for i in $(seq 1 30); do
    if curl -sk https://localhost:3000/api/health 2>/dev/null | grep -q .; then
      echo "Server ready after ${i}s"
      break
    fi
    sleep 1
  done
  ```

  Check database connectivity via the check script:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/check-all-tables.ts
  ```
  **Expected:** FAIL or incomplete — the script lists table columns. Tables should exist but test data may be absent.

  Now check available data:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/check-data.ts
  ```
  **Expected:** Shows existing user count, branch count, service count.

- [x] **GREEN: Seed baseline data**

  Run the seed script to ensure all required reference data exists:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run db:seed
  ```
  **Expected output:**
  ```
  ✅ Database seeded: N new, M existing
  ```
  Where N >= 1 (at least the first run should seed new data). If all already seeded, `N=0, M>0` is also valid.

  Verify seed data immediately:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/check-data.ts
  ```
  **Expected:** Shows >= 3 rate levels (Standard, Senior, Owner), >= 1 branch (Main Studio), >= 18 payroll rates, >= 5 accounting categories.

- [x] **REFACTOR: Document environment state**

  Record the current environment state in the issue log:
  ```bash
  echo "## Environment State\n- Server URL: https://localhost:3000\n- Database: $(grep DATABASE_URL .env.local | head -1)\n- Date: $(date -Iseconds)" >> docs/superpowers/issues/2026-05-25-issues-log.md
  ```

- [x] **Commit (optional):** Environment verification doesn't change application files, so no commit needed. Record completion in task board.

---

### Task 2: Create Test Accounts via Automated Invitation Flow

**Files:**
- Create: `scripts/e2e-setup.ts`

**Dependencies:** Task 1 (dev server running, DB seeded)

**TDD Cycle:**

- [x] **RED: Write the setup script knowing invitations may fail if auth is misconfigured**

  Create `scripts/e2e-setup.ts` with the following content:

  ```typescript
  #!/usr/bin/env bun
  import { config } from 'dotenv'
  config({ path: '.env.local' })
  
  import { db } from '../server/db'
  import { eq, sql } from 'drizzle-orm'
  import { user } from '../server/db/schema/auth'
  import { services } from '../server/db/schema/services'
  import { inventory } from '../server/db/schema/inventory'
  import { staffSchedules } from '../server/db/schema/timeclock'
  import { payrollStaffRate } from '../server/db/schema/payroll'
  import { branches } from '../server/db/schema/branches'
  import { rateLevels } from '../server/db/schema/rate-levels'
  
  // ============================================================================
  // E2E Test Account Definitions
  // ============================================================================
  const TEST_ACCOUNTS = [
    {
      email: 'e2e-admin@rdmdstudio.com',
      fullName: 'E2E Admin',
      role: 'admin' as const,
      accessFlags: [] as string[], // admin gets all by default
      rateLevelSlug: 'owner',
      branchIds: [] as string[], // will be filled
    },
    {
      email: 'e2e-manager@rdmdstudio.com',
      fullName: 'E2E Manager',
      role: 'manager' as const,
      accessFlags: [
        'appointments_manage',
        'sales_access',
        'payroll_manage',
        'accounting_access',
        'transactions_manage',
      ],
      rateLevelSlug: 'senior',
      branchIds: [] as string[],
    },
    {
      email: 'e2e-artist@rdmdstudio.com',
      fullName: 'E2E Artist',
      role: 'artist' as const,
      accessFlags: [
        'appointments_view',
        'appointments_manage',
        'time_clock_manage',
        'artist',
      ],
      rateLevelSlug: 'standard',
      branchIds: [] as string[],
    },
    {
      email: 'e2e-staff@rdmdstudio.com',
      fullName: 'E2E Staff',
      role: 'staff' as const,
      accessFlags: [
        'appointments_view',
        'time_clock_manage',
      ],
      rateLevelSlug: 'standard',
      branchIds: [] as string[],
    },
  ]
  
  // ============================================================================
  // Test-Specific Seed Data
  // ============================================================================
  const TEST_SERVICES = [
    { title: '[E2E] Small Tattoo', price: '1500.00', pricingType: 'FIXED', serviceType: 'TATTOO', isActive: true },
    { title: '[E2E] Standard Piercing', price: '500.00', pricingType: 'FIXED', serviceType: 'PIERCING', isActive: true },
    { title: '[E2E] Shoe Cleaning Basic', price: '800.00', pricingType: 'FIXED', serviceType: 'SHOE', isActive: true },
    { title: '[E2E] Consultation', price: '300.00', pricingType: 'FIXED', serviceType: 'OTHER', isActive: true },
  ]
  
  const TEST_INVENTORY = [
    { name: '[E2E] Nitrile Gloves', itemType: 'ITEM', itemCategory: 'TATTOO', currentStock: '100', sellingPrice: '50.00', unitPrice: '25.00', isActive: true, showInSales: true },
    { name: '[E2E] Black Ink 30ml', itemType: 'FLUID', itemCategory: 'TATTOO', currentStock: '50', sellingPrice: '300.00', unitPrice: '150.00', fluidUnitSize: '30', fluidRemaining: '30', fluidUnitOfMeasure: 'ml', isActive: true, showInSales: true },
    { name: '[E2E] Titanium Stud', itemType: 'ITEM', itemCategory: 'PIERCING', currentStock: '200', sellingPrice: '150.00', unitPrice: '75.00', isActive: true, showInSales: true },
  ]
  
  // ============================================================================
  // Main Function
  // ============================================================================
  async function main() {
    console.log('🔧 E2E Test Setup Script\n')
  
    // Step 1: Get or create branch
    const existingBranches = await db.select().from(branches).where(eq(branches.code, 'MAIN'))
    let branchId: string
    if (existingBranches.length > 0) {
      branchId = existingBranches[0].id
      console.log(`✅ Using existing branch: ${existingBranches[0].name} (${branchId})`)
    } else {
      const [newBranch] = await db.insert(branches).values({
        name: 'E2E Main Studio',
        code: 'MAIN',
        city: 'Cebu City',
        address: '123 Test Street',
        phone: '+63 32 000 0000',
        isActive: true,
      }).returning()
      branchId = newBranch.id
      console.log(`✅ Created branch: ${newBranch.name} (${branchId})`)
    }
  
    // Update branch IDs for all test accounts
    for (const acc of TEST_ACCOUNTS) {
      acc.branchIds = [branchId]
    }
  
    // Step 2: Check for existing test accounts (skip if already registered)
    console.log('\n📧 Checking test accounts...')
    for (const acc of TEST_ACCOUNTS) {
      const existingUsers = await db.select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.email, acc.email))
  
      if (existingUsers.length > 0) {
        console.log(`   ⚠️  ${acc.email} — already exists (${existingUsers[0].id})`)
        // Re-activate if needed
        await db.update(user).set({ isActive: true }).where(eq(user.email, acc.email))
        console.log(`   ✅ ${acc.email} — set isActive = true`)
      } else {
        console.log(`   📝 ${acc.email} — needs invitation (run generate-invite.ts)`)
      }
    }
  
    // Step 3: Seed test services (skip if already exist)
    console.log('\n🛠️  Seeding test services...')
    const firstBranch = branchId
    for (const svc of TEST_SERVICES) {
      const existing = await db.select({ id: services.id })
        .from(services)
        .where(eq(services.title, svc.title))
      if (existing.length === 0) {
        await db.insert(services).values({
          ...svc,
          branchId: firstBranch,
          isShared: true,
        })
        console.log(`   ✅ Created service: ${svc.title}`)
      } else {
        console.log(`   ⚠️  Service already exists: ${svc.title}`)
      }
    }
  
    // Step 4: Seed test inventory
    console.log('\n📦 Seeding test inventory...')
    for (const item of TEST_INVENTORY) {
      const existing = await db.select({ id: inventory.id })
        .from(inventory)
        .where(eq(inventory.name, item.name))
      if (existing.length === 0) {
        await db.insert(inventory).values({
          ...item,
          branchId: firstBranch,
          isShared: true,
        })
        console.log(`   ✅ Created inventory: ${item.name}`)
      } else {
        console.log(`   ⚠️  Inventory already exists: ${item.name}`)
      }
    }
  
    // Step 5: Verify default payroll rates exist
    console.log('\n💰 Checking payroll rates...')
    const rateCountResult = await db.select({ count: sql<number>`count(*)` })
      .from(payrollStaffRate)
      .where(eq(payrollStaffRate.isActive, true))
    const rateCount = rateCountResult[0]?.count ?? 0
    console.log(`   Active payroll rates: ${rateCount}`)
    if (rateCount < 18) {
      console.log('   ⚠️  Insufficient payroll rates — re-run bun run db:seed')
    } else {
      console.log('   ✅ Payroll rates OK')
    }
  
    // Step 6: Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ E2E Setup Complete')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Next steps:')
    console.log('1. Generate invitations for accounts marked 📝')
    console.log('2. Register accounts via browser')
    console.log('3. Start test sessions')
  }
  
  main().catch((err) => {
    console.error('❌ Setup failed:', err)
    process.exit(1)
  })
  ```

  Run the script:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/e2e-setup.ts
  ```
  **Expected:** "Checking test accounts..." section may show 📝 for accounts that need invitation.

- [x] **RED: Verify test accounts don't exist yet (invitations needed)**

  Run the script and observe output. For each account showing 📝, you need to generate an invitation:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/generate-invite.ts
  ```
  This is interactive — you'll be prompted for email and role. You must run it 4 times:
  1. `e2e-admin@rdmdstudio.com` → `admin`
  2. `e2e-manager@rdmdstudio.com` → `manager`
  3. `e2e-artist@rdmdstudio.com` → `artist`
  4. `e2e-staff@rdmdstudio.com` → `staff`

  **Expected (per run):** A token URL is generated. Save all 4 tokens to a file:
  ```bash
  echo "TOKENS:" > /tmp/e2e-tokens.txt
  # After each invitation, append the token to /tmp/e2e-tokens.txt
  ```

- [x] **GREEN: All 4 accounts registered via browser**

  For each of the 4 accounts, open the registration page in agent_browser and complete registration.
  The registration URL is: `https://localhost:3000/auth?token=<TOKEN>`

  For the FIRST account (e2e-admin), the procedure is:
  ```bash
  # Use agent_browser to open the registration URL
  # Step-by-step for e2e-admin:
  
  # 1. Open the invite URL
  agent_browser open "https://localhost:3000/auth?token=<TOKEN>" --session-name e2e-setup --profile Default --session-mode fresh
  
  # 2. Take snapshot to see the registration form
  agent_browser snapshot -i --session-name e2e-setup
  
  # 3. Fill the registration form (name, password fields)
  # [Exact @refs depend on snapshot — see session-01-setup-auth.md for details]
  
  # 4. Submit the form
  
  # 5. Verify redirect to dashboard
  agent_browser snapshot -i --session-name e2e-setup
  # Expected: URL is https://localhost:3000/ (dashboard)
  ```

  **Expected result:** After registration, each account redirects to the dashboard showing sidebar with appropriate menu items for their role.

- [x] **GREEN: Re-run e2e-setup to confirm accounts exist**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/e2e-setup.ts
  ```
  **Expected:** All 4 accounts show ✅ (already exists) with active status.

- [x] **REFACTOR: Update setup script with access flags if missing**

  After registration, the accounts may not have the correct access flags or rate level. Run a manual DB update:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run -e '
  import { db } from "./server/db"
  import { user } from "./server/db/schema/auth"
  import { rateLevels } from "./server/db/schema/rate-levels"
  import { eq } from "drizzle-orm"
  
  // Get rate level IDs
  const levels = await db.select().from(rateLevels)
  const levelMap = Object.fromEntries(levels.map(l => [l.slug, l.id]))
  
  // Update e2e-admin with owner rate level
  await db.update(user).set({
    rateLevelId: levelMap.owner,
    accessFlags: ["artist", "piercing", "shoe"],
  }).where(eq(user.email, "e2e-admin@rdmdstudio.com"))
  
  // Update e2e-manager with all access flags
  await db.update(user).set({
    rateLevelId: levelMap.senior,
    accessFlags: ["appointments_manage","sales_access","payroll_manage","accounting_access","transactions_manage","inventory_manage","metrics_view","logs_view","notifications_send"],
  }).where(eq(user.email, "e2e-manager@rdmdstudio.com"))
  
  // Update e2e-artist
  await db.update(user).set({
    rateLevelId: levelMap.standard,
    accessFlags: ["appointments_view","appointments_manage","time_clock_manage","artist"],
  }).where(eq(user.email, "e2e-artist@rdmdstudio.com"))
  
  // Update e2e-staff
  await db.update(user).set({
    rateLevelId: levelMap.standard,
    accessFlags: ["appointments_view","time_clock_manage"],
  }).where(eq(user.email, "e2e-staff@rdmdstudio.com"))
  
  console.log("✅ All accounts updated with correct flags and rate levels")
  process.exit(0)
  '
  ```

- [x] **Commit:**
  ```bash
  git add scripts/e2e-setup.ts
  git commit -m "test: add E2E test account setup script (Task 2)"
  ```

---

### Task 3: Login Verification for All 4 Accounts

**Files:**
- Use: `docs/superpowers/test-sessions/session-01-setup-auth.md`

**Dependencies:** Task 2 (accounts registered)

**TDD Cycle:**

- [x] **RED: Attempt login with each account, expecting success, capturing failures**

  Create `docs/superpowers/test-sessions/session-01-setup-auth.md`:

  ```markdown
  # Session 1: Setup & Auth Verification
  
  ## Objective
  Verify all 4 test accounts can log in, the sidebar renders correctly per role, and the branch selector works.
  
  ## Preconditions
  - Dev server running at https://localhost:3000
  - All 4 accounts registered via Task 2
  - Passwords known: all accounts use `E2eTest2026!` (set during registration)
  
  ## Step 1: Login as e2e-admin
  
  ```bash
  agent_browser open "https://localhost:3000/auth" --session-name e2e-session1 --profile Default --session-mode fresh
  agent_browser snapshot -i --session-name e2e-session1
  ```
  
  **Verify:** Snapshot shows login form with email and password fields.
  
  ```bash
  agent_browser fill @e2 "e2e-admin@rdmdstudio.com" --session-name e2e-session1
  agent_browser fill @e3 "E2eTest2026!" --session-name e2e-session1
  agent_browser click @e4 --session-name e2e-session1
  ```
  
  **Wait and snapshot again to see dashboard:**
  ```bash
  sleep 3
  agent_browser snapshot -i --session-name e2e-session1
  ```
  
  **Verify:**
  - URL contains `/` or redirects to dashboard
  - Sidebar shows ALL navigation items (admin sees everything)
  - No `/unauthorized` redirect
  
  ## Step 2: Logout
  
  ```bash
  agent_browser open "https://localhost:3000/api/auth/signout" --session-name e2e-session1
  ```
  
  **Verify:** Redirected back to auth page.
  
  ## Step 3: Login as e2e-manager
  
  Repeat the login flow for e2e-manager@rdmdstudio.com.
  
  **Verify:**
  - Sidebar shows: Appointments, Sales, Payroll, Accounting, Transactions, Inventory, Metrics, Logs
  - Sidebar does NOT show: Config (system_config flag not assigned)
  - Dashboard loads without error
  
  ## Step 4: Logout & Login as e2e-artist
  
  Repeat for e2e-artist@rdmdstudio.com.
  
  **Verify:**
  - Sidebar shows: Appointments, My Payroll, My Time Clock, Time Clock
  - Sidebar does NOT show: Sales, Payroll, Accounting, Config
  - Dashboard loads without error
  
  ## Step 5: Logout & Login as e2e-staff
  
  Repeat for e2e-staff@rdmdstudio.com.
  
  **Verify:**
  - Sidebar shows: Appointments (view only), My Time Clock, Time Clock
  - Sidebar does NOT show: Sales, Payroll, Accounting, Config, Inventory
  - Dashboard loads without error
  
  ## Step 6: Branch Selector Verification
  
  Logged in as e2e-admin:
  
  ```bash
  agent_browser snapshot -i --session-name e2e-session1
  ```
  
  **Verify:**
  - Branch selector shows at least "Main Studio" (or the seeded branch)
  - Selecting a branch updates the current branch context
  
  ## Issues to Log
  - Any failed login → Issue HIGH: Auth broken for role X
  - Sidebar items missing that should be present → Issue MEDIUM: Access flag not granting route access
  - Sidebar items present that shouldn't be → Issue HIGH: Permission bypass
  - Branch selector empty → Issue MEDIUM: Branches not loaded
  - Dashboard errors → Issue LOW: Dashboard rendering issue
  ```

- [x] **GREEN: Execute Session 1 step by step**

  Execute each step from the session script using agent_browser. For each login:
  
  1. Open auth page → snapshot → expect login form visible
  2. Fill email → fill password → click submit
  3. Wait 3 seconds → snapshot → expect dashboard URL, no redirect to /unauthorized
  4. Verify sidebar items match expected per-role set
  
  **For each account that passes login:** Mark ✅ in the session script.
  **For each failure:** Log an issue in `docs/superpowers/issues/2026-05-25-issues-log.md`.

- [x] **REFACTOR: Record screenshot evidence**

  After each successful login, take a screenshot as evidence:
  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-01-admin-dashboard.png --session-name e2e-session1
  # Repeat for manager, artist, staff dashboards
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-01-setup-auth.md
  git add docs/superpowers/issues/2026-05-25-issues-log.md
  git commit -m "test: add session 1 (auth verification) script (Task 3)"
  ```

---

## Phase 2: Core Appointment Testing (Services, Inventory, Rates, Lifecycle)

> **Deliverable:** Test services/inventory exist in UI, payroll rates verified, all 4 appointment types created and lifecycle-tested, walk-in + downpayment flow tested, reschedule/cancel exercised.

---

### Task 4: Services & Inventory Setup via UI (Session 2)

**Files:**
- Create: `docs/superpowers/test-sessions/session-02-services-inventory.md`

**Dependencies:** Task 3 (all accounts can log in)

**TDD Cycle:**

- [x] **RED: Open config page as e2e-admin expecting services list**

  Login as e2e-admin, then navigate to Services:
  ```bash
  agent_browser open "https://localhost:3000/auth" --session-name e2e-session2 --profile Default --session-mode fresh
  agent_browser fill @e2 "e2e-admin@rdmdstudio.com" --session-name e2e-session2
  agent_browser fill @e3 "E2eTest2026!" --session-name e2e-session2
  agent_browser click @e4 --session-name e2e-session2
  sleep 3
  agent_browser snapshot -i --session-name e2e-session2
  ```

  Navigate to Config page (where services are managed):
  ```bash
  agent_browser open "https://localhost:3000/config" --session-name e2e-session2
  agent_browser snapshot -i --session-name e2e-session2
  ```

  **Expected:** Config page loads. Services tab shows any existing services. If [E2E] prefixed services from Task 2 seed script are visible, mark as VERIFIED. If not, we create them now.

- [x] **RED: Verify inventory items visible**

  Click the "Inventory" tab in config (or navigate there):
  ```bash
  agent_browser open "https://localhost:3000/inventory" --session-name e2e-session2
  agent_browser snapshot -i --session-name e2e-session2
  ```

  **Expected:** Inventory list shows items. [E2E] prefixed items should be visible. If not, create manually:
  
  Creating a service via UI (if needed):
  ```bash
  # Click "Add Service" button → look for @ref from snapshot
  # Fill: title="[E2E] Small Tattoo", price="1500", serviceType="TATTOO"
  # Save → verify appears in list
  ```

  Creating an inventory item via UI (if needed):
  ```bash
  # Click "Add Item" button → fill name="[E2E] Nitrile Gloves", type="ITEM", category="TATTOO", sellingPrice="50"
  # Save → verify appears in list
  ```

- [x] **GREEN: At least 4 services and 3 inventory items are visible in UI**

  Batch verify via snapshot text search:
  ```bash
  # For services:
  agent_browser snapshot -i --session-name e2e-session2
  # Expected text visible: "[E2E] Small Tattoo", "[E2E] Standard Piercing",
  # "[E2E] Shoe Cleaning Basic", "[E2E] Consultation"
  
  # For inventory:
  agent_browser open "https://localhost:3000/inventory" --session-name e2e-session2
  agent_browser snapshot -i --session-name e2e-session2
  # Expected text visible: "[E2E] Nitrile Gloves", "[E2E] Black Ink 30ml", "[E2E] Titanium Stud"
  ```

  **If any items are missing, create them via the UI add buttons now.**

- [x] **REFACTOR: Document service/inventory counts**

  Take screenshots of both pages for evidence and record in issues log if any services/inventory were missing.

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-02-services-list.png --session-name e2e-session2
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-02-inventory-list.png --session-name e2e-session2
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-02-services-inventory.md docs/superpowers/screenshots/
  git commit -m "test: session 2 — services & inventory UI verification (Task 4)"
  ```

---

### Task 5: Payroll Rate Verification (Session 3)

**Files:**
- Create: `docs/superpowers/test-sessions/session-03-payroll-rates.md`

**Dependencies:** Task 4 (services and inventory exist)

**TDD Cycle:**

- [x] **RED: Navigate to payroll rates page expecting rates to exist**

  Stay logged in as e2e-admin from Session 2, or re-login:
  ```bash
  agent_browser open "https://localhost:3000/payroll" --session-name e2e-session3 --profile Default --session-mode fresh
  agent_browser snapshot -i --session-name e2e-session3
  ```

  If not logged in, follow the standard login sequence first.

  **Expected:** Payroll page loads. Look for a "Rates" or "Staff Rates" tab/section.

- [x] **RED: Verify rate table contains expected combinations**

  After navigating to the rates section, snapshot and check for these text patterns:
  - "Tattoo - Walk-in - Standard"
  - "Tattoo - Walk-in - Senior"
  - "Tattoo - Walk-in - Owner"
  - "Tattoo - Personal - Standard"
  - "Piercing - Walk-in - Standard"
  - "Shoe - Walk-in - Standard"

  **Expected:** At minimum, rates for (TATTOO × WALKIN × each level) and (TATTOO × PERSONAL × each level) must be present.

- [x] **GREEN: Add a custom payroll rate if any are missing**

  Test the "Add Rate" / "Create Rate" button:
  ```bash
  # Click add rate button → fill form:
  # rate_name="[E2E] Test Rate - Manual - Personal"
  # service_type="MANUAL"
  # client_type="PERSONAL"
  # shop_percentage="60"
  # staff_percentage="40"
  # payment_mode="PERCENTAGE"
  # rate_level_id=[select Standard]
  # Save → verify appears in list
  ```

  Then edit the rate (change shop_percentage to 50, staff to 50):
  ```bash
  # Click edit on the newly created rate → change values → save
  # Verify changes persisted (navigate away, come back)
  ```

  Then delete the test rate to clean up:
  ```bash
  # Click delete/inactivate on the test rate
  ```

- [x] **REFACTOR: Screenshot rate table**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-03-payroll-rates.png --session-name e2e-session3
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-03-payroll-rates.md docs/superpowers/screenshots/
  git commit -m "test: session 3 — payroll rate verification (Task 5)"
  ```

---

### Task 6: Tattoo Appointment Full Lifecycle (Session 4)

**Files:**
- Create: `docs/superpowers/test-sessions/session-04-appt-tattoo-lifecycle.md`

**Dependencies:** Task 5 (rates exist), Task 4 (services exist)

**TDD Cycle:**

- [x] **RED: Attempt to create a tattoo appointment**

  Login as e2e-manager, navigate to Appointments:
  ```bash
  agent_browser open "https://localhost:3000/auth" --session-name e2e-session4 --profile Default --session-mode fresh
  # Login as e2e-manager@rdmdstudio.com / E2eTest2026!
  agent_browser open "https://localhost:3000/appointments" --session-name e2e-session4
  agent_browser snapshot -i --session-name e2e-session4
  ```

  **Expected:** Appointments page loads. Look for "New Appointment" or "+" button.

  Create a scheduled tattoo appointment:
  ```bash
  # Click "New Appointment" → expect create form/modal
  # Fill fields (use @refs from snapshot):
  #   title = "[E2E] Full Tattoo Lifecycle Test"
  #   type = "TATTOO"
  #   client_name = "Test Client A"
  #   client_phone = "+639000000001"
  #   staff = "E2E Artist" (assign to the artist account)
  #   date = [tomorrow's date]
  #   time_start = "10:00"
  #   time_end = "12:00"
  #   notes = "E2E test appointment"
  #   select service: "[E2E] Small Tattoo"
  # Submit
  ```

  **Expected:** Appointment created with status PENDING (or CONFIRMED if created via manager). Snapshot to verify.

- [x] **RED: Verify created appointment appears in list**

  ```bash
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Appointment "[E2E] Full Tattoo Lifecycle Test" visible. Status badge shows PENDING or CONFIRMED.

- [x] **RED: Attempt status transition PENDING → CONFIRMED**

  Click on the appointment to open detail view:
  ```bash
  agent_browser click @eN --session-name e2e-session4  # @ref for the appointment row
  agent_browser snapshot -i --session-name e2e-session4
  ```

  **Expected:** Detail page for the appointment loads. Action bar shows status transition buttons.

  If status is PENDING, click "Confirm":
  ```bash
  agent_browser click @eM --session-name e2e-session4  # @ref for Confirm button
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Status changes to CONFIRMED. Page refreshes.

- [x] **RED: Attempt status transition CONFIRMED → ONGOING**

  ```bash
  agent_browser click @eP --session-name e2e-session4  # @ref for "Start Session" button
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Status changes to ONGOING. `actual_time_start` is now set.

- [x] **RED: Attempt status transition ONGOING → COMPLETED**

  Click "Complete" button:
  ```bash
  agent_browser click @eQ --session-name e2e-session4  # @ref for Complete button
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Complete modal opens with optional final photo upload (tattoo type).

  Since S3/file upload is OUT OF SCOPE, skip photo upload. Click "Complete" (confirmation):
  ```bash
  agent_browser click @eR --session-name e2e-session4  # @ref for the Complete confirmation button inside modal
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Modal closes or shows "Appointment Completed!" success state. Status is now COMPLETED.

- [x] **RED: Attempt to create a transaction from the completed appointment**

  After completion, the detail page should show "Open in Sales" or "Collect Balance" button:
  ```bash
  agent_browser click @eS --session-name e2e-session4  # @ref for Open in Sales / Collect Balance
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Navigation to sales page. Transaction is auto-created from appointment.

- [x] **GREEN: Full lifecycle completed — verify end state**

  ```bash
  agent_browser open "https://localhost:3000/appointments" --session-name e2e-session4
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Appointment shows COMPLETED status.

  ```bash
  agent_browser open "https://localhost:3000/sales" --session-name e2e-session4
  agent_browser snapshot -i --session-name e2e-session4
  ```
  **Expected:** Transaction is visible in sales list.

- [x] **REFACTOR: Document the full transition sequence**

  Record timeline: PENDING → CONFIRMED → ONGOING → COMPLETED → Transaction Created.
  For each step, note: (a) status badge changed correctly, (b) no console errors, (c) page did not crash.
  Take a screenshot at each transition.

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-04-appt-completed.png --session-name e2e-session4
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-04-appt-tattoo-lifecycle.md
  git commit -m "test: session 4 — tattoo appointment full lifecycle (Task 6)"
  ```

---

### Task 7: Piercing, Shoe, and Other Appointment Types (Session 5)

**Files:**
- Create: `docs/superpowers/test-sessions/session-05-appt-other-types.md`

**Dependencies:** Task 6 (tattoo lifecycle completed, appointment creation is working)

**TDD Cycle:**

- [x] **RED: Create a piercing appointment with detail validation**

  Login as e2e-manager, create a piercing appointment:
  ```bash
  # Navigate to appointments → click New
  # Fill:
  #   title = "[E2E] Piercing Lifecycle Test"
  #   type = "PIERCING"
  #   client_name = "Test Client B"
  #   staff = "E2E Artist"
  #   date = [tomorrow + 2 days]
  #   time_start = "14:00"
  #   time_end = "15:00"
  #   select service: "[E2E] Standard Piercing"
  # Submit → snapshot → expect CONFIRMED
  ```

  **Piercing-specific detail fields to verify (on detail page):**
  - `piercing_location` field present
  - `jewelry_material` field present
  - `jewelry_style` dropdown (STUD/RING/BARBELL)
  - `previous_piercing_issues` checkbox
  - `aftercare_instructions` textarea

- [x] **RED: Create a shoe appointment**

  ```bash
  # Repeat with:
  #   title = "[E2E] Shoe Cleaning Test"
  #   type = "SHOE"
  #   select service: "[E2E] Shoe Cleaning Basic"
  #   date = [tomorrow + 3 days]
  ```

  **Shoe-specific detail fields:**
  - `shoe_name` field
  - `quantity` field
  - `drop_off_date` / `pick_up_date`
  - `cleaning_service` dropdown
  - Add-on checkboxes (rush, replacement, water repellent)
  - `sole_whitening` / `reglue_service` options
  - `total_cost` auto-calculated

- [x] **RED: Create an OTHER-type appointment**

  ```bash
  #   title = "[E2E] Consultation Test"
  #   type = "OTHER"
  #   select service: "[E2E] Consultation"
  ```

  **Expected:** No type-specific detail fields (OTHER has no detail table).

- [x] **GREEN: Complete each appointment type**

  For each appointment type (PIERCING, SHOE, OTHER):
  1. Navigate to detail page
  2. Click "Confirm" (if not already)
  3. Click "Start Session" → ONGOING
  4. Click "Complete" → verify modal
  5. Confirm completion
  6. Verify COMPLETED status

  **For SHOE:** Verify the complete modal does NOT show photo upload (only TATTOO type supports it).

- [x] **GREEN: Create transactions from all 3 completed appointments**

  For each completed appointment, click "Open in Sales":
  1. Verify navigation to /sales
  2. Verify transaction is created with correct items
  3. Snapshot to capture

- [x] **REFACTOR: Screenshot each type's completed page**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-05-piercing-done.png --session-name e2e-session5
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-05-shoe-done.png --session-name e2e-session5
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-05-other-done.png --session-name e2e-session5
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-05-appt-other-types.md
  git commit -m "test: session 5 — piercing + shoe + other appointment types (Task 7)"
  ```

---

### Task 8: Walk-in Appointment with Downpayment (Session 6)

**Files:**
- Create: `docs/superpowers/test-sessions/session-06-walkin-downpayment.md`

**Dependencies:** Task 7 (all appointment types work)

**TDD Cycle:**

- [x] **RED: Attempt to create a walk-in appointment with downpayment**

  Login as e2e-manager, on Appointments page:
  ```bash
  agent_browser open "https://localhost:3000/appointments" --session-name e2e-session6 --profile Default --session-mode fresh
  # Login as e2e-manager
  agent_browser snapshot -i --session-name e2e-session6
  ```

  Click "Walk-in" or "New Walk-in" button to open WalkinAppointmentModal:
  ```bash
  agent_browser click @eWALKIN --session-name e2e-session6
  agent_browser snapshot -i --session-name e2e-session6
  ```

  **Expected:** WalkinAppointmentModal opens with fields for client name, phone, type, staff, date, time, services, and downpayment section.

- [x] **RED: Fill walk-in details with downpayment enabled**

  ```bash
  # Fill:
  #   client_name = "Walk-in Client Z"
  #   client_phone = "+639000000005"
  #   type = "TATTOO"
  #   staff = "E2E Artist"
  #   date = today
  #   start_time = next available slot
  #   select service: "[E2E] Small Tattoo"
  #
  #   Downpayment section:
  #   toggle "Collect Downpayment" = ON
  #   estimated_total = "1500"
  #   downpayment_amount = "500"
  #   payment_method = "CASH"
  #
  # Submit
  ```

  **Expected:** Appointment created. Detail page shows `payment_status = "DEPOSIT_PAID"` and `downpayment_amount = 500`.

- [x] **RED: Verify downpayment is visible on appointment detail**

  ```bash
  agent_browser snapshot -i --session-name e2e-session6
  ```
  **Expected:** Payment section shows "Deposit Paid" badge. Downpayment amount ₱500.00 visible.

- [x] **RED: Complete the walk-in appointment**

  ```bash
  # Confirm → Start Session → Complete (same flow as Task 6)
  agent_browser snapshot -i --session-name e2e-session6
  # Expected: COMPLETED status, payment_status still DEPOSIT_PAID
  ```

- [x] **RED: Collect remaining balance**

  After completion, detail page should show "Collect Balance" button (because payment_status = DEPOSIT_PAID):
  ```bash
  agent_browser click @eCOLLECT --session-name e2e-session6
  agent_browser snapshot -i --session-name e2e-session6
  ```
  **Expected:** Opens in sales page. Transaction reflects the remaining balance (total - downpayment).

- [x] **GREEN: Verify full payment flow**

  On the sales page, complete the payment for the remaining balance:
  ```bash
  # The transaction should show balance_due = 1000 (1500 total - 500 downpayment)
  # Pay remaining balance → verify transaction status = COMPLETED
  agent_browser snapshot -i --session-name e2e-session6
  ```
  **Expected:** After full payment, `payment_status` on appointment should update to PAID_IN_FULL.

  Navigate back to appointment detail:
  ```bash
  agent_browser open "https://localhost:3000/appointments/[appointment-id]" --session-name e2e-session6
  agent_browser snapshot -i --session-name e2e-session6
  ```
  **Expected:** Payment section shows "Paid in Full" badge.

- [x] **REFACTOR: Document downpayment flow**

  Record: modal opens with downpayment toggle → deposit collected → appointment completed → balance collected → PAID_IN_FULL.
  Screenshot at each stage.

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-06-walkin-downpayment.md
  git commit -m "test: session 6 — walk-in appointment with downpayment (Task 8)"
  ```

---

### Task 9: Reschedule & Cancel (Session 7)

**Files:**
- Create: `docs/superpowers/test-sessions/session-07-reschedule-cancel.md`

**Dependencies:** Task 8 (appointment lifecycle verified)

**TDD Cycle:**

- [x] **RED: Create a confirmable appointment, then reschedule it**

  Login as e2e-manager, create a new appointment:
  ```bash
  # title="[E2E] Reschedule Test", type="TATTOO", client="Test Client D",
  # staff="E2E Artist", date=tomorrow, time=11:00-12:00
  # Status should be CONFIRMED or PENDING → confirm it
  ```

  Open the detail page. In CONFIRMED status, click "Edit":
  ```bash
  agent_browser click @eEDIT --session-name e2e-session7
  agent_browser snapshot -i --session-name e2e-session7
  ```
  **Expected:** Edit mode activates. Time fields, staff dropdown, notes become editable.

  Change the time and staff:
  ```bash
  # Change time_end from 12:00 to 13:00
  # Change staff from "E2E Artist" to "E2E Admin"
  # Click Save
  agent_browser snapshot -i --session-name e2e-session7
  ```
  **Expected:** Appointment updated. Time shows 11:00-13:00. Staff changed to E2E Admin.

- [x] **RED: Cancel an appointment from CONFIRMED status**

  Create another appointment, confirm it:
  ```bash
  # title="[E2E] Cancel From Confirmed Test"
  # Confirm → status = CONFIRMED
  ```

  Click "Cancel" button:
  ```bash
  agent_browser click @eCANCEL --session-name e2e-session7
  agent_browser snapshot -i --session-name e2e-session7
  ```
  **Expected:** Status changes to CANCELLED. Button changes to "Recover".

- [x] **RED: Recover from CANCELLED back to CONFIRMED**

  Click "Recover" button:
  ```bash
  agent_browser click @eRECOVER --session-name e2e-session7
  agent_browser snapshot -i --session-name e2e-session7
  ```
  **Expected:** Status changes back to CONFIRMED. Appointment is active again.

- [x] **RED: Cancel from ONGOING status**

  ```bash
  # Start session on the recovered appointment → ONGOING
  # Click Cancel
  agent_browser snapshot -i --session-name e2e-session7
  # Expected: Status changes to CANCELLED
  ```

- [x] **RED: Cancel from COMPLETED status**

  Complete another appointment, then from COMPLETED status:
  ```bash
  # Click Cancel on a COMPLETED appointment
  agent_browser snapshot -i --session-name e2e-session7
  # Expected: Status changes to CANCELLED (allowed per transition matrix)
  ```
  **Note:** This may show a warning/confirmation since COMPLETED appointments already have a transaction.

- [x] **GREEN: Verify all status transitions work**

  Document which transitions were tested:
  - ✅ PENDING → CONFIRMED (Task 6)
  - ✅ PENDING → CANCELLED (this task — via Reject on PENDING)  
  - ✅ CONFIRMED → ONGOING (Task 6)
  - ✅ CONFIRMED → CANCELLED (this task)
  - ✅ ONGOING → COMPLETED (Task 6)
  - ✅ ONGOING → CANCELLED (this task)
  - ✅ COMPLETED → CANCELLED (this task)
  - ✅ CANCELLED → CONFIRMED (this task — Recover)
  - ✅ CANCELLED → PENDING (verify Recover button shows as option or test separately)

- [x] **REFACTOR: Screenshot each transition**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-07-cancelled-recovery.png --session-name e2e-session7
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-07-reschedule-cancel.md
  git commit -m "test: session 7 — reschedule + cancel + recovery (Task 9)"
  ```

---

## Phase 3: Sales & Payments (Transaction Creation, Multi-Item, Split, Void, Refund)

> **Deliverable:** Manual POS sale created, multi-item sale tested, all 5 payment methods used, void/refund verified, accounting impact confirmed.

---

### Task 10: Manual POS Transaction & All Payment Methods (Session 8)

**Files:**
- Create: `docs/superpowers/test-sessions/session-08-sales-deep.md`

**Dependencies:** Task 9 (appointment lifecycle verified, some transactions already exist)

**TDD Cycle:**

- [x] **RED: Open sales page and verify existing transactions**

  Login as e2e-manager:
  ```bash
  agent_browser open "https://localhost:3000/sales" --session-name e2e-session8 --profile Default --session-mode fresh
  # Login as e2e-manager@rdmdstudio.com / E2eTest2026!
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Sales page loads. Transaction list shows entries created from prior appointments (Tasks 6-8).

- [x] **RED: Create an independent (non-appointment) transaction — CASH payment**

  Click "New Sale" / "POS" / "New Transaction" button:
  ```bash
  agent_browser click @eNEWSALE --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** POS/transaction creation form opens. Fields for customer, items, payment.

  Add items manually (not from appointment):
  ```bash
  # staff = "E2E Artist"
  # Add item: select service "[E2E] Small Tattoo" at price 1500
  # Add item: select inventory "[E2E] Nitrile Gloves", qty=2, price=50 each
  # subtotal = 1600, tax = 0, total = 1600
  # payment_method = "CASH"
  # cash_received = 2000
  # change_given should auto-calculate to 400
  # Click Complete / Finalize
  ```
  **Expected:** Transaction completed. Redirect to transaction list. New entry visible with transaction_number.

- [x] **RED: Create transaction with CARD payment**

  Create another manual sale:
  ```bash
  # staff = "E2E Artist"
  # client_name = "Card Customer"
  # item: "[E2E] Standard Piercing", price 500
  # payment_method = "CARD"
  # reference_number = "AUTH-12345"
  # Click Complete
  ```
  **Expected:** Transaction completed with CARD payment method. Reference number visible in detail.

- [x] **RED: Create transaction with GCASH payment**

  ```bash
  # client_name = "GCash Customer"
  # item: "[E2E] Shoe Cleaning Basic", price 800
  # payment_method = "GCASH"
  # reference_number = "GCASH-REF-67890"
  # Click Complete
  ```
  **Expected:** Transaction shows GCASH payment method.

- [x] **RED: Create transaction with BANK_TRANSFER payment**

  ```bash
  # client_name = "Bank Customer"
  # item: "[E2E] Consultation", price 300
  # payment_method = "BANK_TRANSFER"
  # reference_number = "BNK-54321"
  # Click Complete
  ```
  **Expected:** Transaction shows BANK_TRANSFER payment method.

- [x] **RED: Create transaction with SPLIT payment**

  ```bash
  # client_name = "Split Customer"
  # Add items totaling, e.g., 2000
  # payment_method = "SPLIT"
  # Split into:
  #   - CASH: 1000
  #   - CARD: 500, reference = "SPLIT-CARD-001"
  #   - GCASH: 500, reference = "SPLIT-GCASH-002"
  # Click Complete
  ```
  **Expected:** Transaction shows SPLIT. Payment breakdown visible in detail.

- [x] **GREEN: Verify all 5 payment methods are reflected correctly**

  For each transaction created above, open its detail and snapshot:
  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-08-cash-payment.png --session-name e2e-session8
  # Repeat for CARD, GCASH, BANK_TRANSFER, SPLIT transactions
  ```
  **Expected:** Each transaction detail shows the correct payment_method label and reference number.

- [x] **REFACTOR: Document payment method coverage**

  Create a checklist in the issue log:
  - [ ] CASH — tested ✅
  - [ ] CARD — tested ✅
  - [ ] GCASH — tested ✅
  - [ ] BANK_TRANSFER — tested ✅
  - [ ] SPLIT — tested ✅

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-08-sales-deep.md
  git commit -m "test: session 8 — all payment methods, void, refund (Tasks 10-11)"
  ```

---

### Task 11: Void & Refund Transactions (Session 8 continued)

**Files:**
- Modify: `docs/superpowers/test-sessions/session-08-sales-deep.md` (extend)

**Dependencies:** Task 10 (at least 5 COMPLETED transactions exist)

**TDD Cycle:**

- [x] **RED: Void a completed transaction**

  Open the CASH transaction from Task 10, find the Void button:
  ```bash
  agent_browser click @eVOID --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Void confirmation/modal appears. Requires a void reason.

  Enter void reason and confirm:
  ```bash
  agent_browser fill @eVOIDREASON "E2E test void — manager error" --session-name e2e-session8
  agent_browser click @eVOIDCONFIRM --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Transaction status changes to VOIDED. Original values preserved. Void reason visible.

- [x] **RED: Refund a completed transaction**

  Open the CARD transaction from Task 10, find the Refund button:
  ```bash
  agent_browser click @eREFUND --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Refund modal appears. Requires reason.

  Enter reason and confirm:
  ```bash
  agent_browser fill @eREFUNDREASON "E2E test refund — customer changed mind" --session-name e2e-session8
  agent_browser click @eREFUNDCONFIRM --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Transaction status changes to REFUNDED. Refund details visible.

- [x] **GREEN: Verify accounting impact of void and refund**

  Switch to Accounting page as e2e-manager:
  ```bash
  agent_browser open "https://localhost:3000/accounting" --session-name e2e-session8
  agent_browser snapshot -i --session-name e2e-session8
  ```
  **Expected:** Accounting page loads. Look for ledger entries related to the voided and refunded transactions.

  For voided transaction: Should see original revenue entry + void reversal entry (or is_voided = true on original).
  For refunded transaction: Should see original revenue entry + refund expense entry.

  Take screenshots of the ledger entries:
  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-08-void-ledger-impact.png --session-name e2e-session8
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-08-refund-ledger-impact.png --session-name e2e-session8
  ```

- [x] **REFACTOR: Document void/refund edge cases**

  - Can you void a PENDING transaction? → Try and log result
  - Can you refund a VOIDED transaction? → Expect error
  - Can you void a REFUNDED transaction? → Expect error

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-08-sales-deep.md
  git commit -m "test: session 8 part 2 — void + refund + accounting impact (Task 11)"
  ```

---

## Phase 4: Payroll & Accounting (Rate-Config → Entries → Requests → Ledger)

> **Deliverable:** Payroll entries auto-created from transactions, deductions applied, payroll request full lifecycle (REQUESTED→CONFIRMED→COMPLETED), staggered disbursement, general ledger verified for both transaction-source and payroll-source entries, manual ledger entry created and voided.

---

### Task 12: Payroll Processing — Entries, Deductions, Requests, Disbursements (Session 9)

**Files:**
- Create: `docs/superpowers/test-sessions/session-09-payroll-processing.md`

**Dependencies:** Task 11 (multiple completed transactions with staff assignments exist)

**TDD Cycle:**

- [x] **RED: Open payroll page and verify auto-created payroll entries**

  Login as e2e-manager:
  ```bash
  agent_browser open "https://localhost:3000/payroll" --session-name e2e-session9 --profile Default --session-mode fresh
  # Login as e2e-manager@rdmdstudio.com / E2eTest2026!
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Payroll page loads. Look for an "Entries" or "Earnings" tab/section.

  Navigate to entries/earnings:
  ```bash
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Payroll entries exist for at least the transactions created in Tasks 6-10 where staff was assigned (E2E Artist on [E2E] Small Tattoo service).

  For each entry, verify these fields are populated:
  - `staff_id` → matches "E2E Artist"
  - `gross_amount` → matches service price (e.g., 1500)
  - `shop_cut` → calculated from payroll rate (e.g., 50% of 1500 = 750 for Standard level WALKIN)
  - `staff_cut` → remaining (e.g., 750)
  - `payment_status` → "PENDING" (auto-created, not yet in a request)
  - `rate_id` → references the applicable payroll rate

- [x] **RED: Create a payroll deduction (advance) for E2E Artist**

  Find the Deductions section:
  ```bash
  agent_browser snapshot -i --session-name e2e-session9
  # Look for "Add Deduction" / "Create Advance" button
  ```

  Create a new deduction:
  ```bash
  agent_browser click @eADDDEDUCTION --session-name e2e-session9
  # Fill:
  #   user = select "E2E Artist"
  #   type = "ADVANCE"
  #   amount = 200
  #   reason = "E2E test advance"
  #   disbursement_type = "FULL"
  # Save
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Deduction appears in the list with status PENDING.

- [x] **RED: Create a payroll request for E2E Artist**

  Navigate to Requests section:
  ```bash
  agent_browser click @eNEWREQUEST --session-name e2e-session9
  # Fill:
  #   staff = select "E2E Artist"
  #   period_type = "WEEKLY"
  #   period_start = [this week's Monday]
  #   period_end = [this week's Sunday]
  # Submit
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Payroll request created with status REQUESTED. Shows total_gross, total_shop_cut, total_staff_cut aggregated from all PENDING entries in the period.

  Verify the deduction is reflected in the request totals (staff_cut minus deduction = net).

- [x] **RED: Transition payroll request REQUESTED → CONFIRMED**

  Open the request, click "Confirm" (this represents the artist acknowledging the amount):
  ```bash
  agent_browser click @eCONFIRMREQUEST --session-name e2e-session9
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Request status changes to CONFIRMED. `confirmed_at` timestamp set.

- [x] **RED: Transition payroll request CONFIRMED → COMPLETED with staggered disbursement**

  Click "Complete" on the confirmed request. This opens a disbursement form:
  ```bash
  agent_browser click @eCOMPLETEREQUEST --session-name e2e-session9
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** Disbursement modal/form appears.

  Set up staggered payment — e.g., total staff cut is 750 + other entries, net is ~550 (after 200 deduction):
  ```bash
  # Disbursement 1:
  #   amount = 300
  #   payment_method = "CASH"
  #   Add disbursement
  #
  # Disbursement 2:
  #   amount = 250 (remaining)
  #   payment_method = "GCASH"
  #   reference_number = "GCASH-DISB-001"
  #   Add disbursement
  # Complete
  ```
  **Expected:** Request status → COMPLETED. Both disbursements visible. Proof/reference fields populated.

- [x] **GREEN: Verify the full payroll lifecycle**

  Check the following:
  - Payroll entries that were PENDING → now linked to the request (payroll_request_id populated)
  - Entry payment_status → now "PAID"
  - Deduction status → "DEDUCTED"
  - Two disbursement records created with correct amounts
  - `completed_at` and `completed_by` timestamps set on the request

- [x] **GREEN: Test My Payroll (staff self-service view)**

  Login as e2e-artist:
  ```bash
  agent_browser open "https://localhost:3000/my-payroll" --session-name e2e-session9
  # Login as e2e-artist@rdmdstudio.com / E2eTest2026!
  agent_browser snapshot -i --session-name e2e-session9
  ```
  **Expected:** My Payroll page shows the artist's own entries and requests.
  Verify the artist can see:
  - Their payroll entries (gross, shop_cut, staff_cut)
  - The payroll request from above
  - The disbursement details

- [x] **REFACTOR: Document payroll flow**

  Screenshot the complete request detail page showing all disbursements:
  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-09-payroll-completed-request.png --session-name e2e-session9
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-09-my-payroll-view.png --session-name e2e-session9
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-09-payroll-processing.md
  git commit -m "test: session 9 — payroll entries, deductions, request lifecycle, disbursements (Task 12)"
  ```

---

### Task 13: Accounting — Ledger Verification, Manual Entries, Void/Restore (Session 10)

**Files:**
- Create: `docs/superpowers/test-sessions/session-10-accounting.md`

**Dependencies:** Task 12 (payroll entries created, transactions exist)

**TDD Cycle:**

- [x] **RED: Open accounting page and verify auto-created ledger entries**

  Login as e2e-manager:
  ```bash
  agent_browser open "https://localhost:3000/accounting" --session-name e2e-session10 --profile Default --session-mode fresh
  # Login as e2e-manager@rdmdstudio.com / E2eTest2026!
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Accounting (General Ledger) page loads. Shows entries sorted by date.

  Filter by source type to find auto-created entries:
  ```bash
  # If filter UI exists, filter source_type = "TRANSACTION"
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Ledger entries with `source_type = 'TRANSACTION'` correspond to completed sales.
  Each entry should show:
  - `entry_type = 'REVENUE'`
  - `category = 'SALES'`
  - `credit > 0` (revenue is credited)
  - `reference` matches transaction number
  - `payment_method` matches the transaction's payment method

  Filter by source_type = "PAYROLL":
  ```bash
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Ledger entries with `source_type = 'PAYROLL'` correspond to completed payroll requests.
  Each entry should show:
  - `entry_type = 'EXPENSE'`
  - `category = 'Staff Payroll'` (or similar)
  - `debit > 0` (expense is debited)

- [x] **RED: Create a manual ledger entry**

  Click "Add Entry" / "New Entry" button:
  ```bash
  agent_browser click @eADDLEDGER --session-name e2e-session10
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Ledger entry form appears.

  Fill the form:
  ```bash
  # entry_date = today
  # entry_type = "EXPENSE"
  # category = "Supplies"
  # description = "[E2E] Manual test entry — office supplies"
  # debit = 500.00
  # credit = 0
  # payment_method = "CASH"
  # reference = "E2E-MANUAL-001"
  # branch = "Main Studio"
  # Submit
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** New entry appears in ledger list. Status is active (not voided).

- [x] **RED: Void the manual ledger entry**

  Find the newly created entry, click "Void" or the void action:
  ```bash
  agent_browser click @eVOIDENTRY --session-name e2e-session10
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Void reason modal appears.

  ```bash
  agent_browser fill @eVOIDENTRYREASON "E2E test - voiding manual entry" --session-name e2e-session10
  agent_browser click @eVOIDENTRYCONFIRM --session-name e2e-session10
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Entry now shows as voided. `is_voided = true`. Original values still visible.

- [x] **RED: Restore (un-void) the entry**

  Find the voided entry, click "Restore":
  ```bash
  agent_browser click @eRESTOREENTRY --session-name e2e-session10
  agent_browser snapshot -i --session-name e2e-session10
  ```
  **Expected:** Entry back to active status. `is_voided = false`.

- [x] **GREEN: Verify entry type distribution**

  Check the ledger shows a mix of:
  - REVENUE entries (from TRANSACTION source)
  - EXPENSE entries (from PAYROLL source + manual)
  Verify that debits and credits are properly categorized.

- [x] **GREEN: Test accounting period locking (if implemented)**

  Try adding an entry with a date outside the configured period. If period locking is enabled in settings, expect an error message. If not, document as a feature gap.

- [x] **REFACTOR: Screenshot ledger view**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-10-ledger-revenue.png --session-name e2e-session10
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-10-ledger-payroll.png --session-name e2e-session10
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-10-ledger-void-restore.png --session-name e2e-session10
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-10-accounting.md
  git commit -m "test: session 10 — accounting ledger verification, manual entry, void/restore (Task 13)"
  ```

---

## Phase 5: Supporting Systems (Time-Clock, Metrics, Config, Profile, Notifications)

> **Deliverable:** QR code generated and scanned, clock-in/out verified, staff schedules set, dashboard metrics populated, configuration settings modified, profile edited, notifications checked, all sidebar items visited.

---

### Task 14: Time-Clock — QR Generation, Clock In/Out, Schedules (Session 11)

**Files:**
- Create: `docs/superpowers/test-sessions/session-11-timeclock.md`

**Dependencies:** Task 13 (accounts exist, admin config access verified)

**TDD Cycle:**

- [x] **RED: Generate a daily QR code as e2e-admin**

  Login as e2e-admin, navigate to Time Clock:
  ```bash
  agent_browser open "https://localhost:3000/time-clock" --session-name e2e-session11 --profile Default --session-mode fresh
  # Login as e2e-admin@rdmdstudio.com / E2eTest2026!
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Time Clock page loads. Shows QR generation controls.

  Generate a QR code for today:
  ```bash
  # Select branch "Main Studio"
  # Select date = today
  # Click "Generate QR"
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** QR code image displayed. Takes a visible screenshot for evidence.

- [x] **RED: Clock in as e2e-artist**

  Logout of admin, login as e2e-artist:
  ```bash
  agent_browser open "https://localhost:3000/my-time-clock" --session-name e2e-session11
  # Login as e2e-artist
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** My Time Clock page shows clock status — "Not clocked in" or clock-in button.

  Click "Clock In" button (or equivalent):
  ```bash
  agent_browser click @eCLOCKIN --session-name e2e-session11
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Clock-in confirmed. Shows "Clocked in at [time]". Duration counter starts.

  Now clock out:
  ```bash
  agent_browser click @eCLOCKOUT --session-name e2e-session11
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Clock-out confirmed. Shows duration. 

- [x] **RED: Verify time clock entry as admin**

  Login back as e2e-admin, navigate to Time Clock → Entries:
  ```bash
  agent_browser open "https://localhost:3000/time-clock" --session-name e2e-session11
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Time clock entries list shows the artist's clock-in/out. Fields: staff_name, clock_in, clock_out, duration, branch_name.

- [x] **RED: Set a staff schedule for E2E Artist**

  Navigate to Schedules tab in Time Clock:
  ```bash
  agent_browser snapshot -i --session-name e2e-session11
  # Look for "Schedules" tab/section
  ```

  Add a schedule entry:
  ```bash
  agent_browser click @eADDSCHEDULE --session-name e2e-session11
  # Fill:
  #   staff = "E2E Artist"
  #   day_of_week = "MONDAY"
  #   start_time = "09:00"
  #   end_time = "18:00"
  # Save
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Schedule appears for the artist.

  Repeat for TUESDAY through FRIDAY.

- [x] **GREEN: Verify clock status is reflected in My Time Clock**

  Login as e2e-artist one more time:
  ```bash
  agent_browser open "https://localhost:3000/my-time-clock" --session-name e2e-session11
  agent_browser snapshot -i --session-name e2e-session11
  ```
  **Expected:** Shows clock-out status. History shows all clock-in/out entries with durations.

- [x] **REFACTOR: Screenshot clock evidence**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-11-qr-code.png --session-name e2e-session11
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-11-clock-entry.png --session-name e2e-session11
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-11-staff-schedule.png --session-name e2e-session11
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-11-timeclock.md
  git commit -m "test: session 11 — time-clock QR, clock-in/out, schedules (Task 14)"
  ```

---

### Task 15: Metrics & Dashboard Verification (Session 12)

**Files:**
- Create: `docs/superpowers/test-sessions/session-12-metrics-config.md`

**Dependencies:** Task 14 (data exists: transactions, payroll, appointments)

**TDD Cycle:**

- [x] **RED: Open dashboard and verify today's summary**

  Login as e2e-admin, navigate to dashboard (home page):
  ```bash
  agent_browser open "https://localhost:3000/" --session-name e2e-session12 --profile Default --session-mode fresh
  # Login as e2e-admin
  agent_browser snapshot -i --session-name e2e-session12
  ```
  **Expected:** Dashboard loads. Shows today's summary cards (5-card layout per recent commit history).

  Verify at least the following metrics are displayed:
  - Today's appointments (should show test appointments if dates match today)
  - Today's sales/revenue
  - Active transactions or pending payments
  - Clocked-in staff

- [x] **RED: Open Metrics page with date range filtering**

  ```bash
  agent_browser open "https://localhost:3000/metrics" --session-name e2e-session12
  agent_browser snapshot -i --session-name e2e-session12
  ```
  **Expected:** Metrics page loads. Shows charts/summaries.

  Use the date range selector (DateRangeSelector component):
  ```bash
  # Set start_date = [7 days ago]
  # Set end_date = today
  # Click Apply / Filter
  agent_browser snapshot -i --session-name e2e-session12
  ```
  **Expected:** Charts update to reflect the selected period.

- [x] **RED: Verify Staff Earnings on dashboard**

  On the dashboard, look for "Staff Earnings" section/row:
  ```bash
  agent_browser snapshot -i --session-name e2e-session12
  ```
  **Expected:** StaffEarningsRow component shows staff members with:
  - Staff name (E2E Artist, E2E Admin should appear if they have payroll entries)
  - Total earnings for the period
  - Expandable detail panel showing individual entries

  Click expand on E2E Artist row:
  ```bash
  agent_browser click @eEXPANDARTIST --session-name e2e-session12
  agent_browser snapshot -i --session-name e2e-session12
  ```
  **Expected:** Detail panel expands showing individual payroll entries with amounts and dates.

- [x] **GREEN: Verify all metric values are non-zero after testing**

  Since we created appointments, transactions, and payroll entries in prior tasks, metrics should show non-zero values. If any metric shows 0, log as an issue.

- [x] **REFACTOR: Screenshot dashboard and metrics**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-12-dashboard.png --session-name e2e-session12
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-12-metrics.png --session-name e2e-session12
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-12-staff-earnings.png --session-name e2e-session12
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-12-metrics-config.md
  git commit -m "test: session 12-13 — metrics, config, profile, auth gating (Tasks 15-16)"
  ```

---

### Task 16: Configuration, Profile, Notifications, Navigation (Session 13)

**Files:**
- Modify: `docs/superpowers/test-sessions/session-12-metrics-config.md` (extend with config section)

**Dependencies:** Task 15 (dashboard verified)

**TDD Cycle:**

- [x] **RED: Modify system settings — business hours**

  Login as e2e-admin, navigate to Config:
  ```bash
  agent_browser open "https://localhost:3000/config" --session-name e2e-session13 --profile Default --session-mode fresh
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Config page loads. Shows settings categories.

  Find Business Hours setting:
  ```bash
  # Change business hours (e.g., start to 08:00, end to 22:00)
  # Save
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Setting saved. Confirm change persists (refresh page and verify).

  Restore original business hours after test.

- [x] **RED: Modify tax settings**

  Find currency/tax setting:
  ```bash
  # Toggle tax_enabled = ON
  # Set tax rate (if applicable)
  # Save
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Setting saved. Create a test transaction to verify tax is now applied.

  Restore tax_enabled = OFF after test.

- [x] **RED: Verify notification display**

  Navigate to Notifications page:
  ```bash
  agent_browser open "https://localhost:3000/notify" --session-name e2e-session13
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Notification page loads. May show system notifications related to account creation, appointment updates, etc.

- [x] **RED: Edit user profile**

  Navigate to Profile:
  ```bash
  agent_browser open "https://localhost:3000/profile" --session-name e2e-session13
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Profile page shows current user's name, email, phone, instagram, avatar.

  Edit a field:
  ```bash
  # Change phone_number to "+639000000999"
  # Change instagram_handle to "@e2e_test_admin"
  # Save
  agent_browser snapshot -i --session-name e2e-session13
  ```
  **Expected:** Profile updated. Navigate away and back, verify changes persisted.

- [x] **GREEN: Cross-account sidebar navigation audit**

  Login as e2e-staff and visit every sidebar item:
  ```bash
  # Login as e2e-staff
  # For each item in sidebar:
  #   1. Click the item
  #   2. Snapshot
  #   3. Verify no crash, no blank page, no unauthorized redirect (unless intentionally gated)
  #   4. Verify FlagGate hides admin-only UI elements
  ```

  Try to access restricted pages directly via URL:
  ```bash
  agent_browser open "https://localhost:3000/accounting" --session-name e2e-session13
  agent_browser snapshot -i --session-name e2e-session13
  # Expected: Redirected to /unauthorized page
  
  agent_browser open "https://localhost:3000/config" --session-name e2e-session13
  agent_browser snapshot -i --session-name e2e-session13
  # Expected: Redirected to /unauthorized page
  
  agent_browser open "https://localhost:3000/payroll" --session-name e2e-session13
  agent_browser snapshot -i --session-name e2e-session13
  # Expected: Redirected to /unauthorized page
  ```

  Repeat for e2e-artist:
  ```bash
  agent_browser open "https://localhost:3000/payroll" --session-name e2e-session13
  # Expected: Redirected to /unauthorized (artist doesn't have payroll_manage)
  
  agent_browser open "https://localhost:3000/accounting" --session-name e2e-session13
  # Expected: Redirected to /unauthorized
  ```

  Repeat for e2e-manager:
  ```bash
  agent_browser open "https://localhost:3000/config" --session-name e2e-session13
  # Expected: Redirected to /unauthorized (manager doesn't have system_config)
  ```

- [x] **REFACTOR: Document all sidebar states**

  ```bash
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-13-config-business-hours.png --session-name e2e-session13
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-13-profile-edit.png --session-name e2e-session13
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-13-unauthorized-staff.png --session-name e2e-session13
  agent_browser screenshot /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/screenshots/session-13-unauthorized-artist.png --session-name e2e-session13
  ```

- [x] **Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-12-metrics-config.md
  git commit -m "test: session 12-13 — config, profile, notifications, auth gating (Task 16)"
  ```

---

## Phase 6: Polish & Hardening (Issue Log, Cleanup, Final Report)

> **Deliverable:** Structured issue log with all defects categorized by severity, test accounts disabled, final testing summary.

---

### Task 17: Issue Log Consolidation & Testing Coverage Report

**Files:**
- Create: `docs/superpowers/issues/2026-05-25-issues-log.md`
- Create: `docs/superpowers/issues/2026-05-25-coverage-report.md`

**Dependencies:** Tasks 3-16 (all previous sessions executed)

**TDD Cycle:**

- [x] **RED: Review all session notes and extract every defect into structured issue log**

  Consolidate all issues found across sessions into the issue log file:

  ```markdown
  # E2E Testing Issue Log — 2026-05-25
  
  ## Summary
  - **Total issues found:** [count]
  - **HIGH severity:** [count]
  - **MEDIUM severity:** [count]
  - **LOW severity:** [count]
  - **Sessions executed:** 1-14
  - **Pass rate:** [X]% of steps executed without errors
  
  ---
  
  ### Issue #001
  - **Session:** [number] — [name]
  - **Subsystem:** [e.g., Appointments]
  - **Severity:** [HIGH / MEDIUM / LOW]
  - **Status:** OPEN
  - **Description:** [what happens vs what should happen]
  - **Steps to Reproduce:**
    1. [step]
    2. [step]
  - **Expected:** [behavior]
  - **Actual:** [behavior]
  - **Screenshot:** `docs/superpowers/screenshots/[file].png`
  - **Notes:** [additional context]
  
  ---
  ```

- [x] **GREEN: Populate issue log with actual findings**

  Go through each session's screenshots and notes. For every anomaly:
  1. Assign a unique issue ID
  2. Categorize by subsystem
  3. Assign severity (HIGH = data loss/wrong calculation, MEDIUM = feature broken but workaround exists, LOW = cosmetic/UX)
  4. Write clear steps to reproduce

- [x] **GREEN: Write testing coverage report**

  Create `docs/superpowers/issues/2026-05-25-coverage-report.md`:

  ```markdown
  # E2E Testing Coverage Report — 2026-05-25
  
  ## Coverage Matrix
  
  | Subsystem | Tested | Pass | Fail | Notes |
  |-----------|--------|------|------|-------|
  | Auth & User Mgmt | ✅ | [N] | [N] | 4 accounts registered |
  | Appointments | ✅ | [N] | [N] | All 4 types, full lifecycle |
  | Sales / Transactions | ✅ | [N] | [N] | All 5 payment methods |
  | Payroll | ✅ | [N] | [N] | Entries, deductions, requests, disbursements |
  | Accounting | ✅ | [N] | [N] | Auto + manual entries, void/restore |
  | Time-Clock | ✅ | [N] | [N] | QR, clock-in/out, schedules |
  | Services | ✅ | [N] | [N] | CRUD verified via UI |
  | Inventory | ✅ | [N] | [N] | CRUD verified via UI |
  | Metrics | ✅ | [N] | [N] | Dashboard + staff earnings |
  | Configuration | ✅ | [N] | [N] | Business hours, tax settings |
  | Sidebar & Navigation | ✅ | [N] | [N] | All items visited, auth gating tested |
  | My Payroll | ✅ | [N] | [N] | Staff self-service view |
  | My Time Clock | ✅ | [N] | [N] | Staff clock-in/out history |
  | Profile | ✅ | [N] | [N] | Edit profile fields |
  | Notifications | ✅ | [N] | [N] | Page loads |
  
  ## Appointment Status Transition Coverage
  
  | From \\ To | CONFIRMED | ONGOING | COMPLETED | CANCELLED |
  |------------|-----------|---------|-----------|-----------|
  | PENDING | ✅ | N/A | N/A | ✅ |
  | CONFIRMED | N/A | ✅ | N/A | ✅ |
  | ONGOING | N/A | N/A | ✅ | ✅ |
  | COMPLETED | N/A | N/A | N/A | ✅ |
  | CANCELLED | ✅ | N/A | N/A | N/A |
  
  ## Payment Method Coverage
  - CASH ✅
  - CARD ✅
  - GCASH ✅
  - BANK_TRANSFER ✅
  - SPLIT ✅
  
  ## Appointment Type Coverage
  - TATTOO ✅ (full lifecycle + downpayment)
  - PIERCING ✅
  - SHOE ✅
  - OTHER ✅
  ```

- [x] **REFACTOR: Cross-check with architectural spec**

  For each requirement in the spec, verify it was tested:
  - [ ] Every user-facing feature in sidebar visited? → Verify from session notes
  - [ ] Every appointment status transition exercised? → Cross-check with transition matrix
  - [ ] Every payment method used? → Check from Session 8 notes
  - [ ] Every appointment type created? → Check from Sessions 4-5 notes

  If any requirement is missing, add a note to the coverage report.

- [x] **Commit:**
  ```bash
  git add docs/superpowers/issues/
  git commit -m "test: issue log + coverage report (Task 17)"
  ```

---

### Task 18: Cleanup — Disable Test Accounts & Final Snapshot

**Files:**
- Create: `docs/superpowers/test-sessions/session-13-cleanup.md` 

**Dependencies:** Task 17 (all testing complete)

**TDD Cycle:**

- [x] **RED: Disable test accounts in database**

  Run a cleanup database script:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run -e '
  import { db } from "./server/db"
  import { user } from "./server/db/schema/auth"
  import { eq, like } from "drizzle-orm"
  
  // Disable all E2E test accounts
  const result = await db.update(user)
    .set({ isActive: false })
    .where(like(user.email, "e2e-%@rdmdstudio.com"))
    .returning({ email: user.email, isActive: user.isActive })
  
  console.log("Disabled accounts:", result.map(r => `${r.email} (active=${r.isActive})`).join(", "))
  console.log(`Total: ${result.length} accounts disabled`)
  
  // Verify
  const check = await db.select({ email: user.email, isActive: user.isActive })
    .from(user)
    .where(like(user.email, "e2e-%@rdmdstudio.com"))
  console.log("Verification:", check.map(c => `${c.email}: active=${c.isActive}`).join(", "))
  
  process.exit(0)
  '
  ```
  **Expected:** All 4 test accounts show `isActive = false`.

- [x] **GREEN: Verify accounts cannot log in**

  Attempt login with e2e-admin:
  ```bash
  agent_browser open "https://localhost:3000/auth" --session-name e2e-cleanup --profile Default --session-mode fresh
  agent_browser fill @e2_email "e2e-admin@rdmdstudio.com" --session-name e2e-cleanup
  agent_browser fill @e3_pass "E2eTest2026!" --session-name e2e-cleanup
  agent_browser click @e4_submit --session-name e2e-cleanup
  sleep 3
  agent_browser snapshot -i --session-name e2e-cleanup
  ```
  **Expected:** Login fails. Error message or redirect back to login page with error.

- [x] **GREEN: Stop the dev server**

  ```bash
  kill $(lsof -ti :3000)
  ```
  **Expected:** Server process terminated. Port 3000 is free.

- [x] **REFACTOR: Final summary commit**

  Create a brief testing summary:
  ```bash
  echo "
  # E2E Testing Summary
  
  - **Date:** $(date -I)
  - **Sessions executed:** 14
  - **Subsystems tested:** 15/15
  - **Issues found:** [from issue log]
  - **All test accounts disabled:** ✅
  - **Screenshots captured:** [count]
  
  See \`docs/superpowers/issues/2026-05-25-issues-log.md\` for detailed issue tracking.
  See \`docs/superpowers/issues/2026-05-25-coverage-report.md\` for coverage matrix.
  " >> docs/superpowers/issues/2026-05-25-issues-log.md
  ```

- [x] **Final Commit:**
  ```bash
  git add docs/superpowers/test-sessions/session-13-cleanup.md
  git add docs/superpowers/issues/
  git commit -m "test: cleanup — disable test accounts + final summary (Task 18)"
  ```

---

<!-- PLAN END -->
