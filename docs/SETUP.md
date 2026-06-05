# InkSight RDMD - Setup Guide

This guide provides comprehensive instructions for setting up the InkSight RDMD application for development and production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Storage Setup](#storage-setup)
- [Email Setup](#email-setup)
- [Security Setup](#security-setup)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20+ | JavaScript runtime (managed by Nixpacks) |
| Bun | 1.1.38+ | Package manager and runtime |
| PostgreSQL | 15+ | Database |
| Git | Latest | Version control |

### External Services

| Service | Purpose | Sign Up |
|---------|---------|---------|
| PostgreSQL | Database | [Neon](https://neon.tech), [Supabase](https://supabase.com), or self-hosted |
| S3 Storage | File storage | [RustFS](https://rustfs.com), AWS S3, MinIO |
| Resend | Email service | [Resend](https://resend.com) |
| Cloudflare | Bot protection | [Cloudflare](https://cloudflare.com) |

---

## Development Setup

### 1. Install Bun

Bun is the package manager and runtime for this project.

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (via WSL):**
```bash
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Verify installation:**
```bash
bun --version  # Should be 1.1.38 or higher
```

### 2. Clone the Repository

```bash
git clone <repository-url>
cd inksight-rdmd
```

### 3. Install Dependencies

```bash
bun install
```

This will install all packages from `package.json`.

### 4. Set Up Environment Variables

Copy the example file:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values. See [Environment Variables](#environment-variables) section for details.

---

## Environment Variables

### Required Variables

These variables are required for the application to function:

#### Database

```bash
DATABASE_URL="postgresql://user:password@host:5432/inksight"
```

- Replace `user`, `password`, `host`, and `inksight` with your actual values
- For Neon: `postgresql://user:password@ep-xxx.neon.tech/inksight?sslmode=require`
- For Supabase: `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres`

#### Application URLs

```bash
NEXT_PUBLIC_SITE_URL="https://inksight.example.com"
NEXT_PUBLIC_APP_URL="https://inksight.example.com"
```

For local development:
```bash
NEXT_PUBLIC_SITE_URL="https://localhost:3000"
NEXT_PUBLIC_APP_URL="https://localhost:3000"
```

#### Better Auth

```bash
BETTER_AUTH_URL="https://inksight.example.com"
NEXT_PUBLIC_BETTER_AUTH_URL="https://inksight.example.com"
BETTER_AUTH_SECRET="your-secret-key-here-min-32-chars"
```

Generate a secret:
```bash
openssl rand -base64 32
```

### S3 Storage Variables

```bash
S3_ENDPOINT="https://s3-frontend.ranlabs.space"
S3_BUCKET="inksight-testing"
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"
S3_PUBLIC_URL="https://s3.ranlabs.space"
```

### Email Variables (Resend)

```bash
RESEND_API_KEY="re_your_resend_api_key"
```

Get your API key from [Resend Dashboard](https://resend.com/api-keys).

### Security Variables (Cloudflare Turnstile)

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key"
```

Get your site key from [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/).

---

## Database Setup

### Option 1: Neon PostgreSQL (Recommended)

1. Sign up at [Neon](https://neon.tech)
2. Create a new project
3. Get your connection string from the dashboard
4. Add to `.env.local`:
   ```bash
   DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/inksight?sslmode=require"
   ```

### Option 2: Supabase

1. Sign up at [Supabase](https://supabase.com)
2. Create a new project
3. Go to Settings > Database
4. Get your connection string
5. Add to `.env.local`:
   ```bash
   DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
   ```

### Option 3: Local PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15
sudo systemctl start postgresql
```

**Create database:**
```bash
psql -U postgres
create database inksight;
\q
```

### Initialize Database Schema

After setting up PostgreSQL, run:

```bash
# Push schema to database
bun run db:push

# Seed default data
bun run seed

# Create admin invitation
bun run invite --email admin@example.com
```

Or use the one-command setup:
```bash
bun run setup
```

---

## Storage Setup

### Option 1: RustFS (Recommended)

1. Sign up at [RustFS](https://rustfs.com)
2. Create a bucket
3. Get your credentials from the dashboard
4. Configure environment variables:
   ```bash
   S3_ENDPOINT="https://s3-frontend.ranlabs.space"
   S3_BUCKET="your-bucket-name"
   S3_ACCESS_KEY="your-access-key"
   S3_SECRET_KEY="your-secret-key"
   S3_PUBLIC_URL="https://s3.ranlabs.space"
   ```

### Option 2: AWS S3

1. Create an S3 bucket in AWS Console
2. Create IAM user with S3 access
3. Configure environment variables:
   ```bash
   S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"
   S3_BUCKET="your-bucket-name"
   S3_ACCESS_KEY="your-access-key"
   S3_SECRET_KEY="your-secret-key"
   S3_PUBLIC_URL="https://your-bucket.s3.us-east-1.amazonaws.com"
   ```

### Option 3: MinIO (Self-hosted)

1. Install MinIO:
   ```bash
   docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
   ```

2. Create bucket and get credentials
3. Configure environment variables:
   ```bash
   S3_ENDPOINT="http://localhost:9000"
   S3_BUCKET="inksight"
   S3_ACCESS_KEY="minioadmin"
   S3_SECRET_KEY="minioadmin"
   S3_PUBLIC_URL="http://localhost:9000/inksight"
   ```

---

## Email Setup

### Resend

1. Sign up at [Resend](https://resend.com)
2. Add your domain (required for production)
3. Get your API key from the dashboard
4. Add to `.env.local`:
   ```bash
   RESEND_API_KEY="re_your_resend_api_key"
   ```

---

## Security Setup

### Cloudflare Turnstile

Turnstile protects public forms from bots.

1. Sign up at [Cloudflare](https://cloudflare.com)
2. Go to Turnstile in the dashboard
3. Add your domain
4. Get the Site Key
5. Add to `.env.local`:
   ```bash
   NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key"
   ```

---

## Production Deployment

### Dokploy + Nixpacks (Recommended)

1. **Create Application in Dokploy**
   - Type: Application
   - Build Pack: Nixpacks
   - Repository: Connect your Git repo

2. **Configure Environment Variables**
   Add all required variables from `.env.local`

3. **Deploy**
   Dokploy will automatically:
   - Install dependencies with Bun
   - Run `bun run build`
   - Start with `bun run start`

4. **Post-Deploy Setup**
   ```bash
   # Connect to production database
   bun run setup --url "postgresql://prod-db-url"
   ```

### Environment Variables for Production

```bash
NIXPACKS_NODE_VERSION=22
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
DATABASE_URL="postgresql://prod-user:password@prod-host:5432/inksight"
BETTER_AUTH_URL="https://your-domain.com"
NEXT_PUBLIC_BETTER_AUTH_URL="https://your-domain.com"
BETTER_AUTH_SECRET="your-production-secret"
S3_ENDPOINT="https://s3-frontend.ranlabs.space"
S3_BUCKET="inksight-production"
S3_ACCESS_KEY="prod-access-key"
S3_SECRET_KEY="prod-secret-key"
S3_PUBLIC_URL="https://s3.ranlabs.space"
RESEND_API_KEY="re_prod_api_key"
NEXT_PUBLIC_TURNSTILE_SITE_KEY="prod-turnstile-key"
```

---

## Troubleshooting

### Database Connection Issues

**Error: `connection refused`**
- PostgreSQL is not running or wrong host/port
- For local: `brew services start postgresql@15`
- For cloud: Check firewall settings

**Error: `authentication failed`**
- Wrong username or password
- Check special characters are URL-encoded

**Error: `database does not exist`**
```bash
# Create database
psql -U postgres -c "create database inksight;"
```

### Authentication Issues

**Error: `Invalid secret`**
- `BETTER_AUTH_SECRET` must be at least 32 characters
- Generate with: `openssl rand -base64 32`

**Error: `Invalid callback URL`**
- `BETTER_AUTH_URL` must match `NEXT_PUBLIC_BETTER_AUTH_URL`
- Must include protocol (`https://` or `http://`)

**Cookies not being set**
- Clear browser cookies
- Check HTTPS is enabled (required for secure cookies)

### S3 Upload Issues

**Error: `Access Denied`**
- Verify S3 credentials
- Check bucket permissions allow writes

**Error: `No such bucket`**
- Bucket doesn't exist
- Create bucket in your S3 provider dashboard

**Files not accessible**
- Check `S3_PUBLIC_URL` is correct
- Verify bucket allows public read

### Build Issues

**Error: `bun not found`**
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # or ~/.zshrc
```

**Error: `Module not found`**
```bash
# Clear cache and reinstall
rm -rf node_modules bun.lockb
bun install
```

### Port Issues

**Port 3000 already in use**
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
bun dev --port 3001
```

### HTTPS Issues

See [docs/HTTPS_SETUP.md](HTTPS_SETUP.md) for local HTTPS configuration.

---

## Next Steps

After setup:

1. **Start development server:**
   ```bash
   bun run dev
   ```

2. **Access the application:**
   - Visit `https://localhost:3000`
   - Log in with admin credentials

3. **Read the guides:**
   - [Migration Guide](MIGRATION-GUIDE.md) - Database changes
   - [System Actions](SYSTEM-ACTIONS.md) - System capabilities

4. **Configure your studio:**
   - Go to Settings
   - Set up studio information
   - Configure payroll rates
   - Add accounting categories

---

## Support

For issues and questions:
- Check [Troubleshooting](#troubleshooting) section
- Review [Migration Guide](MIGRATION-GUIDE.md) for database issues
- Check HTTPS setup at [HTTPS_SETUP.md](HTTPS_SETUP.md)
