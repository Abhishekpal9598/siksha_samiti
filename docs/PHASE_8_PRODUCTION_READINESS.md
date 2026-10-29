# PHASE 8: PRODUCTION READINESS & OPERATIONAL SECURITY AUDIT

## 1. Executive Summary & Verification State

The **Education Committee Examination Portal (शिक्षा समिति प्रतियोगिता प्रबंधन प्रणाली)** has completed Phase 8: Production Deployment Readiness & Operational Security Audit.

All foundational, examination, central scoring, OMR vision processing, manual verification, governance, and frontend layers are verified and production-ready for real-world deployment.

### System Verification Matrix
- **Node.js/Express Backend Suite**: `backend/test/phase8_production_smoke.test.js` (13/13 passing)
- **Frontend Localization & UI Suite**: `frontend/test/ui.test.js` (24/24 passing)
- **OMR Security & Lifecycle Audit**: `backend/test/phase6_8_audit.test.js` (9/9 passing)
- **Frontend Registration Integration**: `backend/test/phase7_frontend_support.test.js` (5/5 passing)
- **Vite Production Build**: `frontend/dist` compiled cleanly in 3.34s (zero warnings, 106.25 kB gzip)

---

## 2. Environment Configuration & Startup Guardrails

To prevent misconfigurations in production environments, the backend includes an automated pre-flight security validation check (`validateProductionEnv()` in `src/config/env.js` executed at Step 0 in `src/server.js`).

### Startup Validation Rules (`NODE_ENV === 'production'`)
1. **JWT Secret Strength**:
   - Rejects the default development secret `dev_secret_key_change_in_production_education_committee_2026`.
   - Requires `JWT_SECRET` length $\ge 32$ characters.
2. **OMR Internal Microservice Key**:
   - Rejects the default key `edu_omr_internal_secret_key_2026`.
   - Requires `OMR_INTERNAL_KEY` length $\ge 16$ characters.
3. **CORS Security**:
   - Strictly prohibits wildcard `*` origins when credentials (`cookies`) are enabled.
4. **Database Connection String**:
   - Validates that `MONGODB_URI` starts with `mongodb://` or `mongodb+srv://`.

If any rule fails, the application aborts immediately with exit code `1` and a structured diagnostic error: `INVALID_PRODUCTION_CONFIG`.

### Production Environment Variables Matrix

| Variable | Required | Default / Placeholder | Production Recommendation | Description |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `development` | `production` | Enables security guards and error sanitization |
| `PORT` | Yes | `5000` | `5000` (or reverse proxy port) | HTTP listener port |
| `TIMEZONE` | No | `Asia/Kolkata` | `Asia/Kolkata` | Canonical timezone for exam schedules |
| `MONGODB_URI` | Yes | `mongodb://127.0.0.1:27017/...` | `mongodb+srv://...` (Atlas or Replica) | Database connection string |
| `MONGODB_MAX_POOL_SIZE` | No | `50` | `50` | Maximum MongoDB connection pool size |
| `MONGODB_MIN_POOL_SIZE` | No | `5` | `5` | Minimum idle connections maintained |
| `JWT_SECRET` | Yes | *None (dev default)* | Min 64 hex characters (`openssl rand -hex 32`) | Secret for signing auth tokens |
| `JWT_EXPIRES_IN` | No | `7d` | `7d` | Token lifetime |
| `COOKIE_NAME` | No | `auth_token` | `auth_token` | Session cookie identifier |
| `CLIENT_ORIGIN` | Yes | `http://localhost:5173` | `https://portal.educationcommittee.org` | Whitelisted frontend origin(s) |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` (15 min) | `900000` | Window for general API rate limiting |
| `RATE_LIMIT_MAX` | No | `100` | `100` | Max requests per IP per window |
| `BODY_LIMIT` | No | `1mb` | `1mb` | Max request payload size |
| `OMR_SERVICE_URL` | Yes | `http://127.0.0.1:8001` | Private loopback or VPC subnet | Python FastAPI/OpenCV microservice URL |
| `OMR_INTERNAL_KEY` | Yes | *None (dev default)* | Min 32 hex characters | Shared secret header `X-Internal-Service-Key` |
| `OMR_STORAGE_DIR` | Yes | `./storage/omr_private` | Isolated persistent volume | Private directory for OMR scans |

---

## 3. Web Server & Reverse Proxy Architecture

In production, Node.js and the Python microservice should run behind a hardened reverse proxy (such as Nginx or Caddy) providing:
- TLS/SSL termination with HTTP/2 and modern ciphers
- Static asset caching and gzip/brotli compression
- Request buffering and DDoS protection
- Internal private network isolation for Python OMR microservice

### Recommended Nginx Configuration (`/etc/nginx/sites-available/education_committee`)

```nginx
# Upstream clusters
upstream backend_nodes {
    server 127.0.0.1:5000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name portal.educationcommittee.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name portal.educationcommittee.org;

    # SSL Certificates (Certbot / Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/portal.educationcommittee.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.educationcommittee.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Global Max Upload Limit (aligned with OMR scans)
    client_max_body_size 12M;

    # Static Frontend Assets (Vite Dist)
    root /var/www/education-committee/frontend/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # API Proxy to Express Backend
    location /api/ {
        proxy_pass http://backend_nodes;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Block direct access to storage or sensitive paths
    location /storage/ {
        return 404;
    }

    # SPA Fallback for Client-Side Routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 4. Process Management (PM2 & Systemd)

### PM2 Configuration (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: 'edu-backend',
      cwd: './backend',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M',
      listen_timeout: 10000,
      kill_timeout: 5000
    },
    {
      name: 'edu-omr-service',
      cwd: './omr-service',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8001 --workers 2',
      interpreter: 'none',
      env_production: {
        OMR_ENV: 'production'
      },
      max_memory_restart: '800M'
    }
  ]
};
```

---

## 5. Database Maintenance, Pooling & Backup Procedures

### Connection Pooling
MongoDB connection options in `backend/src/config/database.js`:
- `maxPoolSize`: 50 (concurrent worker queries)
- `minPoolSize`: 5 (hot pool maintenance)
- `socketTimeoutMS`: 45000
- `serverSelectionTimeoutMS`: 5000

### Backup Automation
Two production-ready scripts are provided in `scripts/`:
- **Backup**: `powershell -File scripts/backup_database.ps1 -OutputDir ./backups`
- **Restore**: `powershell -File scripts/restore_database.ps1 -ArchivePath ./backups/backup_YYYYMMDD_HHMMSS.gz`

Linux cron job equivalent for daily midnight backups with 30-day retention:
```bash
0 0 * * * mongodump --uri="$MONGODB_URI" --archive="/backups/db_$(date +\%Y\%m\%d).gz" --gzip && find /backups -name "db_*.gz" -mtime +30 -delete
```

---

## 6. Security Hardening & Zero-Leakage Controls

1. **HttpOnly SameSite Cookies**:
   - Session JWT tokens are delivered in `HttpOnly`, `SameSite: 'lax'`, `Path: '/'` cookies.
   - When `NODE_ENV === 'production'`, `Secure: true` is strictly enforced.
2. **CSRF Double-Submit Protection**:
   - Non-GET mutating requests enforce `X-CSRF-Token` matching the cryptographically generated cookie token.
3. **Information Leakage Prevention**:
   - Express centralized error handler (`errorHandler.js`) suppresses internal MongoDB connection strings, query details, and stack traces when `NODE_ENV === 'production'`, responding with a safe generic message (`An unexpected internal error occurred. Please contact system administrator.`).
4. **Brute Force & Rate Limiting**:
   - `/api/v1/auth/login`: Limited to 10 attempts per 15 minutes per IP.
   - `/api/v1/auth/register`: Limited to 20 registrations per 15 minutes per IP.
   - General API: 100 requests per 15 minutes.
5. **Private Storage Isolation**:
   - OMR scans and rectified PNGs are stored outside public web roots in `OMR_STORAGE_DIR`.
   - Access is restricted to authenticated Admin/Committee Head controllers; static directory browsing returns HTTP 404.

---

## 7. Runbooks & Incident Response

### A. Emergency Token Invalidation
If an admin credential is compromised:
1. Run the admin CLI with `--rotate-password`:
   ```bash
   node backend/src/scripts/seedAdmin.js --rotate-password --mobile 9876543210
   ```
2. The user's `tokenVersion` increments, immediately invalidating all active sessions across all devices.

### B. Health Diagnostics
Diagnostic endpoint:
- **General Health**: `GET /api/v1/health`
- **OMR & Storage Health**: `GET /api/v1/admin/omr/health` (Admin/Committee Head)
  - Checks Python microservice loopback latency.
  - Verifies read/write permissions on the private storage volume.
