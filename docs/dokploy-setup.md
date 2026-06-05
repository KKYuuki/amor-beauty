# Dokploy Setup Guide

A step-by-step guide for setting up Dokploy from scratch and deploying Inksight RDMD.

## What is Dokploy?

Dokploy is a self-hosted Platform as a Service (PaaS) alternative to Heroku, Vercel, and Netlify. It provides:

- Automatic deployments from Git
- Built-in SSL/TLS with Let's Encrypt
- Container orchestration with Docker
- Database management
- Environment variable management

## Server Requirements

### Minimum Requirements

- **OS:** Ubuntu 20.04 LTS or newer
- **RAM:** 2 GB minimum (4 GB recommended)
- **CPU:** 2 vCPUs
- **Storage:** 20 GB SSD
- **Network:** Public IP address, ports 80/443 open

### Recommended for Production

- **RAM:** 4 GB
- **CPU:** 4 vCPUs
- **Storage:** 50 GB SSD
- **Bandwidth:** 1 TB/month

## Installing Dokploy

### Step 1: Provision a VPS

Recommended providers:
- **Hetzner Cloud:** Good value, EU-based
- **DigitalOcean:** $5-12/month droplets
- **Linode:** Reliable, good support
- **AWS/GCP/Azure:** Enterprise options

Create an Ubuntu 22.04 server with:
- 2+ GB RAM
- 20+ GB storage
- SSH key authentication

### Step 2: Initial Server Setup

Connect to your server:

```bash
ssh root@your-server-ip
```

Update system:

```bash
apt update && apt upgrade -y
```

Create a non-root user (optional but recommended):

```bash
adduser dokploy
usermod -aG sudo dokploy
su - dokploy
```

### Step 3: Install Dokploy

Run the official installer:

```bash
curl -sSL https://dokploy.com/install.sh | bash
```

This will:
1. Install Docker and Docker Compose
2. Set up Dokploy containers
3. Start the Dokploy dashboard

Wait for installation to complete (5-10 minutes).

### Step 4: Access Dokploy Dashboard

1. Visit `http://your-server-ip:3000`
2. Complete the setup wizard:
   - Set admin username and password
   - Configure server hostname
   - Save settings

3. Secure with HTTPS (optional but recommended):
   - Use a reverse proxy like Nginx or Traefik
   - Or access via SSH tunnel for local development

## Setting Up Your First Application

### Step 1: Create a Project

1. Log in to Dokploy dashboard
2. Click **Create Project**
3. Name: `inksight`
4. Description: `Tattoo Studio Management`
5. Click **Create**

### Step 2: Connect Git Repository

1. In your project, click **Create Application**
2. Name: `inksight-rdmd`
3. Select **Git Provider**:
   - Connect GitHub account, or
   - Connect GitLab account, or
   - Use Git URL
4. Select your repository
5. Select branch: `main`
6. Build Pack: `Nixpacks` (auto-detected)
7. Click **Create**

### Step 3: Configure Build Settings

1. Go to **Build** tab
2. Verify:
   - Build pack: Nixpacks
   - Nixpacks will auto-detect Bun from `package.json`
3. Optional: Custom build command (usually not needed)
4. Save settings

### Step 4: Add Environment Variables

Go to **Environment** tab and add:

```env
# System
NIXPACKS_NODE_VERSION=22

# Database (will update after creating DB)
DATABASE_URL=placeholder

# Application
NEXT_PUBLIC_SITE_URL=https://inksight.yourdomain.com
NEXT_PUBLIC_APP_URL=https://inksight.yourdomain.com

# Auth
BETTER_AUTH_SECRET=your-secret-key-here-generate-with-openssl
BETTER_AUTH_URL=https://inksight.yourdomain.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://inksight.yourdomain.com

# Storage (will update after S3 setup)
S3_ACCESS_KEY=placeholder
S3_SECRET_KEY=placeholder
S3_BUCKET=inksight-storage
S3_ENDPOINT=placeholder
S3_PUBLIC_URL=placeholder

# Email (will update after Resend setup)
RESEND_API_KEY=placeholder

# Security
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-key
```

Click **Save**

### Step 5: Set Up Database

1. Go to **Services** → **Databases**
2. Click **Create Database**
3. Configure:
   - Name: `inksight-db`
   - Type: PostgreSQL
   - Version: 15
   - Username: `postgres`
   - Password: Generate strong password
4. Click **Create**

5. Wait for database to be ready (1-2 minutes)

6. Get connection details:
   - Host: `inksight-db`
   - Port: `5432`
   - Database: `postgres`
   - Username: `postgres`
   - Password: (from step 4)

7. Update environment variable:
   ```
   DATABASE_URL=postgresql://postgres:password@inksight-db:5432/postgres
   ```

### Step 6: Configure Domain

1. In your application, go to **Domains** tab
2. Click **Add Domain**
3. Enter your domain: `inksight.yourdomain.com`
4. Enable **HTTPS** (Let's Encrypt)
5. Enable **Redirect to HTTPS**
6. Click **Add**

7. Configure DNS with your provider:
   ```
   Type: A
   Name: inksight
   Value: YOUR_SERVER_IP
   TTL: 300
   ```

8. Wait 5-10 minutes for DNS propagation

### Step 7: Set Up S3 Storage

See [DEPLOYMENT.md](DEPLOYMENT.md#storage-configuration) for detailed S3 setup options.

Quick setup with MinIO (runs in Dokploy):

1. Create a new application named `minio`
2. Use Docker Compose deployment:
   ```yaml
   version: '3.8'
   services:
     minio:
       image: minio/minio
       command: server /data --console-address ":9001"
       ports:
         - "9000:9000"
         - "9001:9001"
       environment:
         MINIO_ROOT_USER: minioadmin
         MINIO_ROOT_PASSWORD: your-secure-password
       volumes:
         - minio-data:/data
   
   volumes:
     minio-data:
   ```

3. Deploy and access MinIO console
4. Create bucket `inksight-storage`
5. Set bucket policy to public read
6. Update environment variables with MinIO credentials

### Step 8: Set Up Email (Resend)

1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Generate API key
4. Update environment variable:
   ```
   RESEND_API_KEY=re_your_api_key
   ```

### Step 9: First Deployment

1. In your application dashboard, click **Deploy**
2. Monitor the build logs
3. Wait for deployment to complete (3-5 minutes)
4. Visit your domain to verify

### Step 10: Post-Deployment Setup

1. Open Dokploy terminal (or SSH to server):
   ```bash
   docker exec -it <container-id> /bin/sh
   ```

2. Run database migrations:
   ```bash
   bun run db:push
   ```

3. Seed default data:
   ```bash
   bun run seed
   ```

4. Create admin user:
   ```bash
   bun run invite --email admin@yourdomain.com
   ```

5. Complete registration at your domain

## Advanced Configuration

### Setting Up CI/CD

Enable auto-deployment:
1. Go to **Settings** → **Git**
2. Enable **Auto Deploy**
3. Now pushing to main branch triggers deployment

Add deploy webhook for external CI:
```bash
# Trigger deployment via webhook
curl -X POST https://dokploy.yourdomain.com/api/deploy/WEBHOOK_TOKEN
```

### Health Checks

Configure in **Advanced** → **Health Check**:
- Path: `/api/health/db`
- Interval: 30s
- Timeout: 10s
- Retries: 3

### SSL/TLS Configuration

Dokploy handles SSL automatically with Let's Encrypt.

To force HTTPS:
1. In **Domains** tab, enable **Redirect to HTTPS**
2. Dokploy will redirect all HTTP traffic to HTTPS

### Monitoring & Alerts

Set up monitoring with Dokploy's built-in features:
1. **Logs**: Real-time application logs
2. **Metrics**: CPU, memory, disk usage
3. **Alerts**: Configure email notifications

Or integrate external monitoring:
- **Uptime Kuma**: Self-hosted uptime monitoring
- **Prometheus + Grafana**: Advanced metrics
- **Better Uptime**: Cloud monitoring service

### Backup Strategy

1. **Database**: Automated daily backups
2. **Files**: S3 versioning + cross-region sync
3. **Configuration**: Export environment variables monthly

Example backup cron job:
```bash
# Add to crontab
0 2 * * * /opt/dokploy/backups/backup-db.sh
0 3 * * * /opt/dokploy/backups/backup-s3.sh
```

## Troubleshooting Dokploy

### Can't Access Dashboard

```bash
# Check if Dokploy is running
docker ps | grep dokploy

# Check logs
docker logs dokploy

# Restart Dokploy
docker-compose -f /opt/dokploy/docker-compose.yml restart
```

### Deployment Stuck

1. Check build logs for errors
2. Verify environment variables are set
3. Check if container has enough resources
4. Try manual redeploy

### SSL Certificate Issues

```bash
# Force certificate renewal
docker exec dokploy certbot renew --force-renewal

# Check certificate status
docker exec dokploy certbot certificates
```

### Out of Disk Space

```bash
# Clean up Docker images
docker system prune -a

# Check disk usage
df -h

# Resize disk (provider-specific)
```

## Maintenance

### Updating Dokploy

```bash
# Update Dokploy to latest version
curl -sSL https://dokploy.com/install.sh | bash
```

### Updating Applications

1. Update code in Git repository
2. Push to main branch
3. Auto-deployment will trigger (if enabled)
4. Or manually click **Deploy**

### Security Updates

1. Keep server OS updated:
   ```bash
   apt update && apt upgrade -y
   ```

2. Update Docker images regularly
3. Rotate secrets every 90 days
4. Review access logs weekly

## Tips & Best Practices

### 1. Use Environment-Specific Branches

- `main`: Production
- `staging`: Pre-production testing
- `develop`: Development features

### 2. Set Up Staging Environment

1. Create separate Dokploy application
2. Use staging database
3. Deploy from `staging` branch
4. Test thoroughly before production deploy

### 3. Monitor Resource Usage

```bash
# Check container stats
docker stats

# Check disk usage
du -sh /var/lib/docker
```

### 4. Document Your Setup

Keep a runbook with:
- Server IP and credentials
- Domain configuration
- Environment variables (without values)
- Backup procedures
- Troubleshooting steps

### 5. Test Backups Regularly

Monthly restore test:
1. Restore database to test environment
2. Verify data integrity
3. Check application functionality

## Getting Help

- **Dokploy Documentation**: [docs.dokploy.com](https://docs.dokploy.com)
- **GitHub Issues**: [github.com/Dokploy/dokploy](https://github.com/Dokploy/dokploy)
- **Discord Community**: Join Dokploy Discord server
- **Inksight Support**: Check main project documentation

## Next Steps

After Dokploy is set up:

1. Review [DEPLOYMENT.md](DEPLOYMENT.md) for application-specific deployment
2. Set up monitoring and alerting
3. Configure automated backups
4. Document your specific configuration
5. Train team members on deployment process
