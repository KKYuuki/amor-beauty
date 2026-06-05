# Deployment Guide

This guide covers deploying Inksight RDMD to Dokploy (self-hosted PaaS).

## Prerequisites

- Dokploy instance running on a VPS (Ubuntu 20.04+ recommended)
- PostgreSQL database (Dokploy or external provider like Neon)
- S3-compatible storage (MinIO, AWS S3, or Supabase Storage)
- Resend account for transactional emails
- Domain name with DNS access
- Server with at least 2GB RAM and 20GB storage

## Table of Contents

1. [Dokploy Setup](#dokploy-setup)
2. [DNS Configuration](#dns-configuration)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Storage Configuration](#storage-configuration)
6. [Email Setup](#email-setup)
7. [Deploying](#deploying)
8. [Post-Deployment](#post-deployment)
9. [Health Checks](#health-checks)
10. [Monitoring](#monitoring)
11. [Backup Procedures](#backup-procedures)
12. [Troubleshooting](#troubleshooting)

---

## Dokploy Setup

### 1. Create Application

1. Navigate to your Dokploy dashboard (`https://your-dokploy-domain.com`)
2. Create a new project or select existing one
3. Click **Create Application**:
   - **Name:** `inksight-rdmd`
   - **Description:** Tattoo Studio Management Platform
   - Click **Create**

4. Configure source:
   - **Repository Provider:** GitHub / GitLab / Gitea
   - **Repository:** Select your repository
   - **Branch:** `main` (or your production branch)
   - **Build Pack:** Nixpacks
   - Click **Save**

5. Build configuration:
   - Nixpacks will auto-detect the Bun project
   - Build command: `bun run build`
   - Start command: `bun run start`

### 2. Configure Environment

Add all required environment variables in the Dokploy dashboard:

Go to **Environment** tab and add the following:

```env
# System
NIXPACKS_NODE_VERSION=22

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Application URLs
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Authentication
BETTER_AUTH_SECRET=your-32-char-secret-here
BETTER_AUTH_URL=https://your-domain.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://your-domain.com

# S3 Storage
S3_ACCESS_KEY=your-s3-access-key
S3_SECRET_KEY=your-s3-secret-key
S3_BUCKET=inksight-storage
S3_ENDPOINT=https://s3.your-provider.com
S3_PUBLIC_URL=https://s3.your-provider.com

# Email (Resend)
RESEND_API_KEY=re_your_api_key

# Security
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

Click **Save** after adding all variables.

---

## DNS Configuration

### Domain Setup

1. In Dokploy dashboard, go to **Domains** tab
2. Click **Add Domain**:
   - **Host:** `your-domain.com`
   - Enable **HTTPS** (Let's Encrypt)
   - Enable **Redirect to HTTPS**
3. Click **Add**

### DNS Records

Configure these records with your DNS provider:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | Your server IP | 300 |
| CNAME | www | your-domain.com | 300 |

If using a subdomain:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | inksight | Your server IP | 300 |

**Wait 5-10 minutes** for DNS propagation before proceeding.

---

## Database Setup

### Option A: Dokploy PostgreSQL (Recommended for self-hosted)

1. In Dokploy dashboard, go to **Services** → **Databases**
2. Click **Create Database**:
   - **Name:** `inksight-postgres`
   - **Type:** PostgreSQL
   - **Version:** 15 or 16
   - Set a strong password
3. Click **Create**

4. Note the connection details:
   - Host: `inksight-postgres`
   - Port: `5432`
   - Database: `postgres`
   - Username: `postgres`

5. Update `DATABASE_URL` in your application's environment:
   ```
   DATABASE_URL=postgresql://postgres:password@inksight-postgres:5432/postgres
   ```

### Option B: External PostgreSQL (Neon, Supabase, etc.)

1. Create a database with your provider
2. Copy the connection string
3. Add to environment variables:
   ```
   DATABASE_URL=postgresql://user:pass@neon-host.neon.tech/dbname?sslmode=require
   ```

---

## Storage Configuration

### S3-Compatible Storage Setup

#### Option 1: MinIO (Self-hosted)

1. Deploy MinIO via Dokploy or Docker:
   ```bash
   docker run -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin \
     minio/minio server /data --console-address ":9001"
   ```

2. Create a bucket named `inksight-storage`
3. Set bucket policy to public read for file access
4. Generate access keys
5. Update environment variables:
   ```
   S3_ENDPOINT=http://minio:9000
   S3_PUBLIC_URL=https://minio.your-domain.com/inksight-storage
   ```

#### Option 2: AWS S3

1. Create an S3 bucket in AWS Console
2. Enable public read access (or use CloudFront)
3. Create IAM user with S3 access
4. Generate access keys
5. Update environment variables:
   ```
   S3_ENDPOINT=https://s3.amazonaws.com
   S3_REGION=us-east-1
   ```

#### Option 3: Supabase Storage

1. Create a Supabase project
2. Go to Storage → Create bucket
3. Set bucket to public
4. Get credentials from Settings → API
5. Update environment variables:
   ```
   S3_ENDPOINT=https://your-project.supabase.co/storage/v1/s3
   S3_REGION=ap-southeast-1
   ```

---

## Email Setup

### Resend Configuration

1. Create an account at [resend.com](https://resend.com)
2. Verify your domain:
   - Go to **Domains** → **Add Domain**
   - Enter your domain
   - Add the required DNS records (DKIM, SPF)
   - Wait for verification (can take up to 24 hours)
3. Generate an API key:
   - Go to **API Keys** → **Create API Key**
   - Select **Sending** permission
   - Copy the key (starts with `re_`)
4. Add to environment variables:
   ```
   RESEND_API_KEY=re_your_api_key_here
   ```

---

## Deploying

### First Deployment

1. Click **Deploy** in Dokploy dashboard
2. Monitor the build logs:
   - Nixpacks will detect Bun and install dependencies
   - Build process will run `bun run build`
   - Application will start with `bun run start`

3. Wait for deployment to complete
4. Verify by visiting your domain

### Automatic Deployments

Configure auto-deployment:
1. Go to **Settings** → **Git**
2. Enable **Auto Deploy**
3. Optional: Add deploy webhook URL for CI/CD integration

### Manual Redeployment

```bash
# From your local machine, push to main:
git push origin main

# Or trigger from Dokploy dashboard
# Click "Deploy" button
```

---

## Post-Deployment

### 1. Run Database Migrations

After the first deployment, run migrations:

```bash
# SSH into your Dokploy server or use the built-in terminal
# Access the running container
docker exec -it <container-id> /bin/sh

# Run migrations
bun run db:push
```

Or via Dokploy's **Terminal** feature:
1. Go to **Terminal** tab
2. Select your application container
3. Run: `bun run db:push`

### 2. Seed Default Data

```bash
bun run seed
```

This will create:
- Default system settings
- Payroll rate configurations
- Accounting categories

### 3. Create Admin User

```bash
bun run invite --email admin@your-domain.com
```

This generates an invitation code. Visit the app and complete registration.

---

## Health Checks

Configure health checks in Dokploy:

1. Go to **Advanced** → **Health Check**
2. Set configuration:
   - **Path:** `/api/health/db`
   - **Interval:** 30 seconds
   - **Timeout:** 10 seconds
   - **Retries:** 3
   - **Start Period:** 60 seconds

3. Save and Dokploy will monitor your app

### Creating a Health Check Endpoint

If `/api/health/db` doesn't exist, create it:

```typescript
// app/api/health/db/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/server/db'

export async function GET() {
  try {
    await db.execute('SELECT 1')
    return NextResponse.json({ status: 'healthy', database: 'connected' })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', database: 'disconnected' },
      { status: 503 }
    )
  }
}
```

---

## Monitoring

### Viewing Logs

**Via Dokploy Dashboard:**
1. Go to **Logs** tab
2. View real-time application logs
3. Filter by time range and log level

**Via SSH:**
```bash
# SSH into your server
ssh user@your-server-ip

# View container logs
docker logs inksight-rdmd --follow --tail 100

# View all application logs
docker-compose logs -f inksight-rdmd
```

### Monitoring Metrics

Set up monitoring for:
- **Database connections:** Should stay below 80% of max
- **Memory usage:** Alert if > 80%
- **Response time:** Alert if p95 > 2000ms
- **Error rate:** Alert if > 5%

### Common Alerts to Configure

1. **Database connection failures**
   ```bash
   # Check if health endpoint returns 503
   curl -f https://your-domain.com/api/health/db || echo "Database down"
   ```

2. **High memory usage**
   ```bash
   # Check container memory
   docker stats inksight-rdmd --no-stream
   ```

3. **SSL certificate expiry**
   - Dokploy auto-renews Let's Encrypt certificates
   - Check certificate status in **Domains** tab

---

## Backup Procedures

### Database Backup

#### Automated Daily Backups

Create a backup script:

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="inksight"

# Create backup
pg_dump -h inksight-postgres -U postgres $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete

# Optional: Sync to S3
aws s3 sync $BACKUP_DIR s3://your-backup-bucket/postgres/
```

Add to crontab:
```bash
0 2 * * * /path/to/backup.sh >> /var/log/backup.log 2>&1
```

#### Manual Backup

```bash
# SSH into server and run:
pg_dump -h localhost -U postgres inksight > backup_$(date +%Y%m%d).sql
```

#### Restore from Backup

```bash
# Stop the application or put in maintenance mode
# Restore database:
psql -h localhost -U postgres inksight < backup_20250323.sql
```

### S3 Storage Backup

1. **Enable versioning** on your S3 bucket
2. **Set up cross-region replication** for disaster recovery:
   - AWS: Configure CRR in bucket settings
   - MinIO: Use `mc mirror` command
   - Supabase: Enable point-in-time recovery

3. **Periodic sync to backup bucket:**
   ```bash
   # Sync to backup bucket
   aws s3 sync s3://primary-bucket s3://backup-bucket
   ```

### Application Configuration Backup

Backup these files regularly:
- Environment variables (export from Dokploy)
- Database connection strings
- SSL certificates (handled by Dokploy/Let's Encrypt)

---

## Troubleshooting

### Deployment Failures

**Build fails:**
```bash
# Check build logs in Dokploy
# Common issues:
# - Missing environment variables
# - Node.js version mismatch
# - TypeScript errors
```

**Container won't start:**
1. Check environment variables are set
2. Verify `DATABASE_URL` is correct
3. Check logs: `docker logs <container-id>`

### Database Connection Issues

**Connection refused:**
- Verify PostgreSQL service is running
- Check `DATABASE_URL` host/port
- Ensure network connectivity between containers

**Authentication failed:**
- Verify username/password in `DATABASE_URL`
- Check if special characters in password need URL encoding

### 502 Bad Gateway

1. Application not ready yet (wait 30-60 seconds)
2. Check container is running: `docker ps`
3. Check application logs for startup errors
4. Verify port 3000 is exposed in Dockerfile/Nixpacks

### SSL Certificate Issues

1. DNS not propagated (wait 5-10 minutes)
2. Domain not pointing to server
3. Let's Encrypt rate limits (wait 1 hour)

Check certificate:
```bash
curl -v https://your-domain.com 2>&1 | grep "SSL certificate"
```

### Memory Issues

**Out of memory during build:**
- Increase server RAM to at least 2GB
- Or add swap space:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  ```

### High CPU Usage

- Check for infinite loops in code
- Review build process (Next.js build can be CPU intensive)
- Scale up server resources if needed

---

## Security Considerations

1. **Keep secrets secure:**
   - Never commit `.env.local`
   - Use Dokploy's encrypted environment variables
   - Rotate secrets regularly

2. **Database security:**
   - Use strong passwords
   - Restrict database access to application only
   - Enable SSL connections

3. **S3 bucket security:**
   - Use IAM policies with minimal permissions
   - Enable bucket versioning
   - Set up lifecycle policies

4. **Application security:**
   - Keep dependencies updated
   - Enable Cloudflare Turnstile for bot protection
   - Monitor for suspicious activity

---

## Next Steps

After successful deployment:

1. Set up monitoring alerts
2. Configure automated backups
3. Document any custom configurations
4. Train staff on the application
5. Set up staging environment for testing

For additional help:
- Check [SETUP.md](SETUP.md) for local development
- Review [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for database changes
- See [dokploy-setup.md](dokploy-setup.md) for advanced Dokploy configuration
