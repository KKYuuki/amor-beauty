# InkSight RDMD

Tattoo Studio Management Platform - Next.js 15 + React 19 + TypeScript

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values. See [Environment Variables](#environment-variables) section.

### 3. Setup Database

**One-command setup (recommended for fresh install):**

```bash
bun run setup
```

This will:
1. Push schema to database (`db:push`)
2. Seed default data (settings, payroll rates, accounting categories)
3. Prompt to create initial admin user

**Or step-by-step:**

```bash
# Push schema only
bun run db:push

# Seed default data only
bun run seed

# Create admin invitation only
bun run invite
```

### 4. Start Development Server

```bash
bun dev
```

Visit [https://localhost:3000](https://localhost:3000)

---

## Installation

### Prerequisites

- **Node.js** 20+ (managed via Nixpacks/NVM)
- **Bun** 1.1.38+ ([Install guide](https://bun.sh/docs/installation))
- **PostgreSQL** 15+ (or Neon, Supabase, etc.)
- **S3-compatible storage** (RustFS, MinIO, AWS S3, or Supabase Storage)
- **Resend account** (for email)
- **Cloudflare account** (for Turnstile bot protection)

### Detailed Setup

For comprehensive setup instructions including troubleshooting, see [docs/SETUP.md](docs/SETUP.md).

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd inksight-rdmd
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. **Set up the database**
   ```bash
   # Push schema to database
   bun run db:push
   
   # Seed default data
   bun run seed
   ```

5. **Create admin user**
   ```bash
   bun run invite --email admin@example.com
   ```

6. **Start development server**
   ```bash
   bun run dev
   ```

Visit `https://localhost:3000` and log in with your admin credentials.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the application | `https://inksight.example.com` |
| `NEXT_PUBLIC_APP_URL` | Auth callback URL | `https://inksight.example.com` |
| `BETTER_AUTH_SECRET` | Secret for session encryption (min 32 chars) | `your-32-char-secret` |
| `BETTER_AUTH_URL` | Auth service URL | `https://inksight.example.com` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Public auth URL | `https://inksight.example.com` |

### S3 Storage Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `S3_ACCESS_KEY` | S3 access key | `your-access-key` |
| `S3_SECRET_KEY` | S3 secret key | `your-secret-key` |
| `S3_BUCKET` | S3 bucket name | `inksight-storage` |
| `S3_ENDPOINT` | S3 endpoint URL | `https://s3-frontend.ranlabs.space` |
| `S3_PUBLIC_URL` | Public URL for accessing files | `https://s3.ranlabs.space` |

### Email Variables (Resend)

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key | `re_xxxxx` |

### Security Variables (Cloudflare Turnstile)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key for bot protection | `your-turnstile-site-key` |

### System Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NIXPACKS_NODE_VERSION` | Node.js version for Nixpacks builds | `22` |

### Cron Job Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CRON_SECRET` | Secret for cron job authentication (min 32 chars) | `your-32-char-secret` |

### Complete Example

See [.env.example](.env.example) for a complete example configuration.

---

## Scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Start dev server (HTTPS + Turbopack) |
| `bun build` | Production build |
| `bun start` | Start production server |
| `bun lint` | Run ESLint |
| `bun run setup` | Full database setup (push schema + seed + admin) |
| `bun run seed` | Seed default data only |
| `bun run invite` | Create admin invitation code |
| `bun run db:push` | Push Drizzle schema to database |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:pull` | Pull schema from database |
| `bun run db:drop` | Drop migrations |

---

## Scheduled Tasks (Cron Jobs)

The application includes automated daily maintenance tasks that should be configured in your deployment environment.

### Daily Maintenance Tasks

These tasks run automatically at midnight (00:00) every day:

1. **QR Code Rotation** - Deactivates expired QR codes and generates new ones for all active branches
2. **Log Cleanup** - Identifies system logs older than 90 days for archival
3. **Session Cleanup** - Cleans up expired/stale session data

### Setup (Dokploy)

**Required:** Add `CRON_SECRET` to your environment variables (generate with `openssl rand -hex 32`)

**Configuration:**
1. In Dokploy, go to Scheduled Jobs
2. Create a new job:
   - **Schedule:** `0 0 * * *` (midnight daily)
   - **Type:** HTTP Request
   - **URL:** `https://your-domain.com/api/cron/daily`
   - **Headers:** `Authorization: Bearer YOUR_CRON_SECRET`

**Testing:**
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/daily
```

**Documentation:** See [docs/cron-setup.md](docs/cron-setup.md) for detailed setup and troubleshooting.

---

## Database Migrations

This project uses Drizzle ORM for database management.

### Quick Migration Workflow

1. **Make schema changes** in `server/db/schema/*.ts`
2. **Generate migration:** `bun run db:generate`
3. **Review generated SQL** in `drizzle/`
4. **Apply to database:** `bun run db:push`

### Migration Files

Migrations are stored in `drizzle/` with sequential numbering:
- `0000_polite_whirlwind.sql` - Initial schema
- `0001_sudden_toad_men.sql` - Migration 1
- ...
- `0013_lonely_black_cat.sql` - Latest migration

The `_journal.json` file tracks migration history and order.

### Naming Convention

Migrations follow: `{sequence}_{descriptive_name}.sql`

**Tip:** After generating, rename auto-generated names (like `lying_stark_industries`) to descriptive names (like `add_payroll_tables`).

### Full Documentation

See [docs/MIGRATION-GUIDE.md](docs/MIGRATION-GUIDE.md) for detailed workflow, troubleshooting, and best practices.

---

## Troubleshooting

### Database Connection Issues

1. **Verify DATABASE_URL is correct**
   - Check format: `postgresql://user:password@host:port/database`
   - Ensure password doesn't contain special characters that need URL encoding

2. **Check PostgreSQL is running**
   ```bash
   pg_isready
   ```

3. **Test connection**
   ```bash
   bun run db:pull
   ```

4. **Common errors:**
   - `connection refused` - PostgreSQL is not running or wrong host/port
   - `authentication failed` - Wrong username or password
   - `database does not exist` - Database not created yet

### Authentication Issues

1. **Verify BETTER_AUTH_SECRET is set**
   - Must be at least 32 characters
   - Generate with: `openssl rand -base64 32`

2. **Check URLs match**
   - `BETTER_AUTH_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` must match
   - Must include protocol (`https://` or `http://`)
   - Must match the URL you're accessing the app from

3. **Clear browser cookies**
   - Sometimes stale cookies cause issues
   - Clear cookies for localhost and try again

### S3 Upload Issues

1. **Verify S3 credentials are correct**
   - Check `S3_ACCESS_KEY` and `S3_SECRET_KEY`
   - Verify bucket name in `S3_BUCKET`

2. **Check bucket permissions**
   - Bucket must allow public read for file access
   - Verify CORS settings allow your app domain

3. **Verify endpoint URL is accessible**
   ```bash
   curl -I $S3_ENDPOINT
   ```

### Bun Installation Issues

1. **Bun not found**
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   # Or with npm
   npm install -g bun
   ```

2. **Permission errors**
   ```bash
   # Ensure Bun is in PATH
   export PATH="$HOME/.bun/bin:$PATH"
   ```

### Port Already in Use

If port 3000 is taken:
```bash
# Use a different port
bun dev --port 3001
```

---

## Deployment (Dokploy + Nixpacks)

For comprehensive deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

For Dokploy installation and initial setup, see [docs/dokploy-setup.md](docs/dokploy-setup.md).

### Quick Deploy

- **Type**: Application
- **Build Pack**: Nixpacks
- **Repository**: Connect your Git repo

Add all required environment variables in Dokploy dashboard. See [Environment Variables](#environment-variables) section.

Dokploy will automatically:
1. Install dependencies with Bun
2. Run `bun run build`
3. Start with `bun run start`

After first deployment:

```bash
# Connect to your production database and run:
bun run setup --url "postgresql://prod-db-url"

# Or for existing database (seed only):
bun run seed
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Auth | Better Auth |
| Storage | S3 (RustFS) |
| Email | Resend |
| Package Manager | Bun |
| Bot Protection | Cloudflare Turnstile |

---

## Additional Documentation

- [Setup Guide](docs/SETUP.md) - Comprehensive installation and setup instructions
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment with Dokploy
- [Dokploy Setup](docs/dokploy-setup.md) - Setting up Dokploy from scratch
- [Migration Guide](docs/MIGRATION-GUIDE.md) - Database migration workflow
- [HTTPS Setup](docs/HTTPS_SETUP.md) - Local HTTPS configuration
- [System Actions](docs/SYSTEM-ACTIONS.md) - System action documentation
