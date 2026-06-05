# Dokploy Cron Job Setup

This guide explains how to set up the automated daily maintenance cron job in Dokploy for the Inksight RDMD application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variable Setup](#environment-variable-setup)
3. [Cron Job Configuration](#cron-job-configuration)
4. [What the Cron Job Does](#what-the-cron-job-does)
5. [Monitoring](#monitoring)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

Before setting up the cron job, ensure you have:

- [ ] Dokploy installed and running
- [ ] Inksight RDMD application deployed in Dokploy
- [ ] Access to the Dokploy dashboard
- [ ] Database connection working (QR sessions table exists)
- [ ] At least one active branch configured in the system

## Environment Variable Setup

The cron job requires a secure secret for authentication.

### Step 1: Generate a Secure CRON_SECRET

Generate a strong random secret (minimum 32 characters):

```bash
# Using OpenSSL (recommended)
openssl rand -base64 48

# Using Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

**Example output:**
```
xJ9mK2pL5nQ8rT3vW6yZ9aB4cD7fG1hJ4kL7mN0pQ3sT6vW9yZ
```

### Step 2: Add CRON_SECRET to Environment Variables

1. Log in to your **Dokploy Dashboard**
2. Navigate to your **Inksight RDMD** application
3. Click the **Environment** tab
4. Add the following variable:

```env
CRON_SECRET=xJ9mK2pL5nQ8rT3vW6yZ9aB4cD7fG1hJ4kL7mN0pQ3sT6vW9yZ
```

5. Click **Save**
6. **Redeploy** the application for changes to take effect

### Security Best Practices

- **Never commit** the CRON_SECRET to your Git repository
- **Rotate** the secret every 90 days
- Use a **different secret** for production and staging environments
- Store the secret in a **password manager** for safekeeping

## Cron Job Configuration

### Step 1: Access Cron Job Settings

1. In Dokploy Dashboard, go to your **Inksight RDMD** application
2. Click **Advanced** tab
3. Scroll to **Cron Jobs** section
4. Click **Add Cron Job**

### Step 2: Configure the Cron Job

Enter the following settings:

| Setting | Value | Description |
|---------|-------|-------------|
| **Schedule** | `0 0 * * *` | Runs at midnight (00:00) every day |
| **Command** | `curl` | HTTP client to trigger the endpoint |
| **Arguments** | See below | Full curl command with authentication |

#### Complete Curl Command

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE" \
  -H "Accept: application/json" \
  https://your-domain.com/api/cron/daily
```

**Replace:**
- `YOUR_CRON_SECRET_HERE` with your actual CRON_SECRET value
- `your-domain.com` with your actual domain

### Step 3: Alternative Configuration (Query Parameter)

If you prefer using a query parameter instead of headers:

```bash
curl -X GET \
  -H "Accept: application/json" \
  "https://your-domain.com/api/cron/daily?secret=YOUR_CRON_SECRET_HERE"
```

### Step 4: Save and Enable

1. Click **Save**
2. Verify the cron job appears in the list
3. Ensure it's **enabled** (toggle is on)

### Cron Schedule Reference

The schedule `0 0 * * *` means:

```
0 0 * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 = Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

**Common schedules:**

| Schedule | Description |
|----------|-------------|
| `0 0 * * *` | Daily at midnight (default) |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * 0` | Weekly on Sunday at midnight |
| `0 3 * * *` | Daily at 3:00 AM (low traffic) |

## What the Cron Job Does

The daily maintenance endpoint (`/api/cron/daily`) performs four automated tasks:

### Task 1: Deactivate Expired QR Codes

**Purpose:** Clean up QR codes from previous days that are no longer valid.

**Actions:**
- Finds all active QR codes with `valid_date < today`
- Deactivates them by setting `is_active = false`
- Logs the deactivation for audit purposes

**Example:**
```
Found 3 expired QR codes from 2026-03-23
→ Deactivated QR code CLK-a1b2c3d4-e5f6g7h8i9j0 for branch MAIN
→ Deactivated QR code CLK-x9y8z7w6-v5u4t3s2r1q0 for branch EAST
→ Deactivated QR code CLK-p1o2n3m4-l5k6j7i8h9g0 for branch WEST
```

### Task 2: Generate New QR Codes

**Purpose:** Create fresh QR codes for clock-in/out for all active branches.

**Actions:**
- Gets all active branches from the database
- Checks if a QR code already exists for today
- Generates new QR codes for branches without one
- QR format: `CLK-{branchId(8)}-{nanoid(12)}-{timestamp}`

**Example:**
```
Generated 3 new QR codes for 2026-03-24:
→ Branch MAIN: CLK-a1b2c3d4-XyZ123AbCdEf-8XK9
→ Branch EAST: CLK-x9y8z7w6-MnOpQrStUvWx-8XK9
→ Branch WEST: CLK-p1o2n3m4-JkLmNoPqRsTu-8XK9
```

### Task 3: Log Cleanup

**Purpose:** Archive or delete old system logs to maintain performance.

**Status:** Placeholder implementation

**Future Actions:**
- Archive logs older than 90 days
- Delete archived logs after 1 year
- Maintain audit trail for compliance

**Current Behavior:**
- Performs a cleanup check
- Logs the cutoff date (90 days ago)
- Reports "Archive/delete logic to be implemented"

### Task 4: Session Cleanup

**Purpose:** Remove expired user sessions and temporary data.

**Status:** Placeholder implementation

**Future Actions:**
- Delete expired authentication sessions
- Clean up temporary files
- Clear stale cache entries

**Current Behavior:**
- Performs a cleanup check
- Reports "Cleanup logic to be implemented"

### Response Format

The endpoint returns a JSON response:

```json
{
  "success": true,
  "timestamp": "2026-03-24T00:00:00.000Z",
  "tasks": {
    "qrDeactivation": {
      "count": 3,
      "details": [
        "Deactivated QR code CLK-a1b2c3d4... for branch a1b2c3d4... (expired: 2026-03-23)",
        "Deactivated QR code CLK-x9y8z7w6... for branch x9y8z7w6... (expired: 2026-03-23)",
        "Deactivated QR code CLK-p1o2n3m4... for branch p1o2n3m4... (expired: 2026-03-23)"
      ]
    },
    "qrGeneration": {
      "count": 3,
      "details": [
        "Generated QR code CLK-a1b2c3d4... for branch MAIN (Main Branch)",
        "Generated QR code CLK-x9y8z7w6... for branch EAST (East Branch)",
        "Generated QR code CLK-p1o2n3m4... for branch WEST (West Branch)"
      ]
    },
    "logCleanup": {
      "count": 0,
      "details": [
        "Log cleanup check performed. Cutoff date: 2025-12-24 (90 days ago)",
        "Archive/delete logic to be implemented"
      ],
      "olderThanDays": 90
    },
    "sessionCleanup": {
      "count": 0,
      "details": [
        "Session cleanup check performed",
        "Cleanup logic to be implemented"
      ]
    }
  },
  "errors": []
}
```

## Monitoring

### Method 1: Check System Logs

View cron job execution in Dokploy:

1. Go to your application in Dokploy
2. Click **Logs** tab
3. Filter by type: **System**
4. Look for messages containing:
   - `Daily maintenance started`
   - `Daily maintenance completed`
   - `Daily maintenance failed`

**Example log entries:**
```
[2026-03-24 00:00:01] [INFO] [SYSTEM] Daily maintenance started
[2026-03-24 00:00:02] [INFO] [SYSTEM] Daily maintenance: Deactivated 3 expired QR codes
[2026-03-24 00:00:03] [INFO] [SYSTEM] Daily maintenance: Generated 3 new QR codes for 3 active branches
[2026-03-24 00:00:04] [INFO] [SYSTEM] Daily maintenance completed in 3456ms. Success: true.
```

### Method 2: Check Cron Job History in Dokploy

1. Go to **Advanced** → **Cron Jobs**
2. Find your daily maintenance job
3. View the **Last Run** timestamp
4. Check **Status** (Success/Failed)

### Method 3: Manual Health Check

Run this command to verify the cron job is configured:

```bash
# SSH into your Dokploy server
ssh root@your-server-ip

# List all cron jobs for Dokploy
docker exec dokploy crontab -l

# Check if your job appears in the list
```

### Method 4: Application Logs

Check application logs directly:

```bash
# View logs from your application container
docker logs --tail 100 <container-name> | grep -i "daily maintenance"

# Follow logs in real-time
docker logs -f <container-name> | grep -i "daily maintenance"
```

### Setting Up Alerts

Configure notifications for cron job failures:

1. Go to **Settings** → **Notifications** in Dokploy
2. Add email or webhook notification
3. Set alert conditions:
   - Application crash
   - Build failure
   - High error rate

## Testing

### Method 1: Manual HTTP Request (Recommended)

Test the endpoint directly using curl:

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Accept: application/json" \
  https://your-domain.com/api/cron/daily
```

**Expected response:**
```json
{
  "success": true,
  "timestamp": "2026-03-24T12:34:56.789Z",
  "tasks": { ... },
  "errors": []
}
```

### Method 2: Browser Test (Query Parameter)

For quick testing in browser:

```
https://your-domain.com/api/cron/daily?secret=YOUR_CRON_SECRET
```

**Note:** This exposes the secret in browser history. Use only for temporary testing.

### Method 3: Dokploy Console Test

Run the cron job manually from Dokploy:

1. Go to **Advanced** → **Cron Jobs**
2. Find your daily maintenance job
3. Click **Run Now** button
4. Check the output/logs

### Method 4: Using an API Client

Test with Postman, Insomnia, or similar tools:

1. Create a new GET request
2. URL: `https://your-domain.com/api/cron/daily`
3. Headers:
   - `Authorization: Bearer YOUR_CRON_SECRET`
   - `Accept: application/json`
4. Send request
5. Verify 200 OK response

### Expected Test Results

**Success Scenario:**
- HTTP Status: `200 OK`
- Response: JSON with `success: true`
- All tasks show completion details
- No errors in the errors array

**Failure Scenarios:**

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Missing or incorrect CRON_SECRET | Verify secret is set correctly |
| `500 Internal Server Error` | Database connection issue | Check DATABASE_URL and DB status |
| Empty response | Network or routing issue | Verify domain and endpoint URL |

### Post-Test Verification

After running a test:

1. **Check QR Codes:**
   ```sql
   -- Run in database
   SELECT branch_id, qr_code, valid_date, is_active
   FROM qr_sessions
   WHERE valid_date = CURRENT_DATE;
   ```
   Should return newly generated QR codes for today.

2. **Check System Logs:**
   - Go to Admin Panel → System Logs
   - Look for "Daily maintenance" entries
   - Verify all tasks logged successfully

3. **Verify Old QR Deactivation:**
   ```sql
   -- Should return 0 rows
   SELECT COUNT(*) FROM qr_sessions
   WHERE valid_date < CURRENT_DATE AND is_active = true;
   ```

## Troubleshooting

### Issue: Cron Job Not Running

**Symptoms:**
- No log entries for daily maintenance
- QR codes not being generated
- Last run timestamp is old

**Solutions:**

1. **Verify cron job is enabled:**
   - Go to Advanced → Cron Jobs
   - Check if toggle is ON

2. **Check schedule syntax:**
   - Ensure format is `0 0 * * *`
   - Test with different schedule temporarily: `*/5 * * * *` (every 5 minutes)

3. **Verify CRON_SECRET:**
   ```bash
   # Check if environment variable is set
   docker exec <container-id> printenv | grep CRON_SECRET
   ```

4. **Restart Dokploy:**
   ```bash
   docker-compose -f /opt/dokploy/docker-compose.yml restart
   ```

### Issue: 401 Unauthorized

**Symptoms:**
- Response: `{"success": false, "error": "Unauthorized"}`
- Status: 401

**Solutions:**

1. **Verify CRON_SECRET is set:**
   ```bash
   # Check environment in Dokploy dashboard
   # Environment tab should show CRON_SECRET
   ```

2. **Check Authorization header format:**
   - Must be: `Authorization: Bearer YOUR_SECRET`
   - Not: `Authorization: YOUR_SECRET`
   - Not: `Authorization: bearer YOUR_SECRET`

3. **Verify secret length:**
   - Must be at least 32 characters
   - Check for whitespace or special characters

4. **Redeploy application:**
   - Environment variables require redeployment to take effect

### Issue: 500 Internal Server Error

**Symptoms:**
- Response contains error details
- Status: 500

**Solutions:**

1. **Check database connection:**
   ```bash
   # Test database connectivity
   docker exec <container-id> bun run db:check
   ```

2. **Verify qr_sessions table exists:**
   ```sql
   \dt qr_sessions
   ```

3. **Check for active branches:**
   ```sql
   SELECT * FROM branches WHERE is_active = true;
   ```

4. **Review application logs:**
   ```bash
   docker logs <container-id> --tail 200
   ```

### Issue: QR Codes Not Generated

**Symptoms:**
- `qrGeneration.count` is 0
- No new QR codes in database

**Solutions:**

1. **Check for active branches:**
   ```sql
   SELECT id, name, code, is_active FROM branches;
   ```
   Must have at least one branch with `is_active = true`

2. **Check if QR codes already exist:**
   ```sql
   SELECT branch_id, valid_date FROM qr_sessions
   WHERE valid_date = CURRENT_DATE;
   ```
   If they exist, job skips regeneration (expected behavior)

3. **Verify database permissions:**
   - Application must have INSERT permissions on `qr_sessions` table

### Issue: Cron Job Runs But Nothing Happens

**Symptoms:**
- Logs show "Daily maintenance completed"
- No QR codes generated or deactivated

**Solutions:**

1. **Check for tasks:**
   - Verify there are active branches to process
   - Check if any QR codes need deactivation

2. **Review task details:**
   - Look at `details` array in response
   - Should explain why tasks were skipped

3. **Test manually:**
   - Run the curl command manually
   - Check response details

### Issue: Wrong Timezone

**Symptoms:**
- Cron runs at wrong time
- QR codes generated with wrong date

**Solutions:**

1. **Set timezone in Dokploy:**
   Add environment variable:
   ```env
   TZ=America/New_York
   ```

2. **Adjust cron schedule:**
   - Calculate UTC offset
   - Example: For 12 AM EST (UTC-5), use `0 5 * * *`

3. **Verify server timezone:**
   ```bash
   date
   timedatectl status
   ```

### Common Error Messages

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| `CRON_SECRET environment variable is not set` | Secret not configured | Add CRON_SECRET to environment |
| `Unauthorized attempt to access daily maintenance endpoint` | Wrong or missing secret | Verify Authorization header |
| `No expired QR codes found` | Normal - no old QR to deactivate | No action needed |
| `No active branches found` | Normal - no branches to process | Create branches in admin panel |
| `QR code already exists for branch X` | Normal - prevents duplicates | No action needed |
| `Error deactivating QR codes` | Database error | Check DB connection and permissions |
| `Error generating QR codes` | Database error | Check DB connection and permissions |

### Getting Help

If issues persist:

1. **Check logs:**
   - Application logs: Dokploy → Application → Logs
   - System logs: Admin Panel → System Logs

2. **Verify setup:**
   - Environment variables configured
   - Database migrations applied
   - Branches exist and are active

3. **Test manually:**
   - Use curl to test endpoint
   - Verify response structure

4. **Contact support:**
   - Include: error messages, logs, environment details
   - Reference: `/api/cron/daily` endpoint

## Quick Reference

### Essential Commands

```bash
# Test cron job manually
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/daily

# Generate new CRON_SECRET
openssl rand -base64 48

# Check cron job logs
docker logs <container-id> | grep -i "daily maintenance"

# Verify environment variables
docker exec <container-id> printenv | grep CRON
```

### Configuration Checklist

- [ ] CRON_SECRET generated (32+ characters)
- [ ] CRON_SECRET added to environment variables
- [ ] Application redeployed after adding secret
- [ ] Cron job created in Dokploy
- [ ] Schedule set to `0 0 * * *`
- [ ] Curl command configured with correct URL and secret
- [ ] Manual test completed successfully
- [ ] System logs show successful execution
- [ ] QR codes generated for today
- [ ] Monitoring/alerts configured (optional)

### File Locations

- **Cron endpoint:** `/app/api/cron/daily/route.ts`
- **Environment config:** Dokploy Dashboard → Environment
- **Cron job config:** Dokploy Dashboard → Advanced → Cron Jobs
- **System logs:** Admin Panel → System Logs

---

**Last Updated:** 2026-03-24  
**Related Documentation:**
- [Dokploy Setup Guide](./dokploy-setup.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [SETUP.md](./SETUP.md)
