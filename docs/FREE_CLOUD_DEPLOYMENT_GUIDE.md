# FREE CLOUD HOSTING & DEPLOYMENT GUIDE
## Education Committee Examination Portal (शिक्षा समिति प्रतियोगिता प्रबंधन प्रणाली)

This guide provides step-by-step instructions for deploying the complete platform using **100% Free Cloud Tiers**, while maintaining zero vendor lock-in for future migration to a dedicated Ubuntu VPS with a custom domain.

---

## 1. Target Architecture & Component Topology

```
+-----------------------------------------------------------------------------------------+
|                                    USER INTERNET                                        |
+-----------------------------------------------------------------------------------------+
                    |                                                |
                    v (HTTPS)                                        v (HTTPS / REST)
+----------------------------------------+      +-----------------------------------------+
|           VERCEL (FREE TIER)           |      |            RENDER (FREE TIER)           |
|                                        |      |                                         |
|  - React 18 + Vite (SPA)               | CORS |  - Node.js + Express API Backend        |
|  - vercel.json SPA rewrites            |=====>|  - Port 10000 / $PORT                   |
|  - VITE_API_BASE_URL (Render backend)  |      |  - Central scoring & RBAC governance    |
+----------------------------------------+      +-----------------------------------------+
                                                                     |
                                           +-------------------------+--------------------+
                                           |                                              |
                                           v (Private Loopback/Internal)                  v (TLS)
                        +------------------------------------+          +-------------------------------+
                        |        RENDER (FREE TIER)          |          |      MONGODB ATLAS (FREE M0)  |
                        |                                    |          |                               |
                        |  - Python FastAPI + OpenCV         |          |  - 512 MB Storage             |
                        |  - OMR Fiducial Rectification      |          |  - Automated replica set      |
                        |  - Bubble Fill Measurement         |          |  - TLS encrypted connection   |
                        +------------------------------------+          +-------------------------------+
```

---

## 2. Prerequisites & Accounts Required (All Free)

1. **GitHub Account**: Code hosted in your GitHub repository.
2. **MongoDB Atlas Account**: [cloud.mongodb.com](https://cloud.mongodb.com) (Free Forever M0 Sandbox).
3. **Render Account**: [render.com](https://render.com) (Free tier web services).
4. **Vercel Account**: [vercel.com](https://vercel.com) (Free tier hobby plan).

---

## 3. Step 1: MongoDB Atlas Database Configuration

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com).
2. Create a **Shared M0 Cluster** (Free tier, AWS or Google Cloud provider, choose closest region, e.g. Mumbai / `ap-south-1`).
3. Under **Security > Database Access**:
   - Create a database user (e.g. `edu_admin`).
   - Generate a strong password (save it securely).
   - Set role to `Read and write to any database`.
4. Under **Security > Network Access**:
   - Click **Add IP Address**.
   - Add `0.0.0.0/0` (Allow Access from Anywhere) so Render dynamic IP addresses can connect securely over TLS.
5. Under **Database > Deployment > Connect**:
   - Choose **Connect your application (Drivers: Node.js)**.
   - Copy the connection string format:
     ```
     mongodb+srv://edu_admin:<password>@cluster0.xxxxx.mongodb.net/education_committee?retryWrites=true&w=majority
     ```

---

## 4. Step 2: Render Deployment (Backend & Python OMR Microservice)

You can deploy using either the automated Blueprint or manual web services.

### Option A: Automated Render Blueprint (Recommended)
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New + > Blueprint Instance**.
3. Select your connected GitHub repository.
4. Render automatically parses `render.yaml` and provisions both services:
   - `education-committee-backend` (Node.js)
   - `education-committee-omr-service` (Python)
5. In the configuration prompt, supply:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `CLIENT_ORIGIN`: Your temporary or final Vercel URL (e.g. `https://shiksha-samiti.vercel.app`).
6. Click **Apply**. Render will generate high-entropy secrets for `JWT_SECRET` and `OMR_INTERNAL_KEY` automatically.

### Option B: Manual Web Service Creation

#### Service 1: Python OMR Microservice
- **Name**: `education-committee-omr-service`
- **Root Directory**: `omr-service`
- **Runtime**: `Python`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- **Health Check Path**: `/healthz`
- **Plan**: `Free`
- **Environment Variables**:
  - `PYTHON_VERSION`: `3.10.14`
  - `OMR_INTERNAL_KEY`: `<Generate 32-char hex secret via openssl rand -hex 16>`

#### Service 2: Node.js Backend API
- **Name**: `education-committee-backend`
- **Root Directory**: `backend`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/v1/health`
- **Plan**: `Free`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `TIMEZONE`: `Asia/Kolkata`
  - `MONGODB_URI`: `<Your MongoDB Atlas connection URI>`
  - `JWT_SECRET`: `<Generate 64-char hex secret via openssl rand -hex 32>`
  - `OMR_INTERNAL_KEY`: `<Must match Python service OMR_INTERNAL_KEY exactly>`
  - `OMR_SERVICE_URL`: `<Public or private Render URL of the Python microservice>`
  - `CLIENT_ORIGIN`: `https://your-app.vercel.app`
  - `COOKIE_SAME_SITE`: `none`
  - `STORAGE_PROVIDER`: `local`

---

## 5. Step 3: Vercel Deployment (React Frontend)

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New... > Project** and import your GitHub repository.
3. In Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click Edit, select `frontend`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**:
   - Add `VITE_API_BASE_URL`: `https://<your-render-backend>.onrender.com/api/v1`
5. Click **Deploy**.
6. When deployment finishes, copy your Vercel URL (e.g. `https://shiksha-samiti.vercel.app`).
7. **Important**: Go back to your Render Dashboard for `education-committee-backend` > **Environment**, and verify `CLIENT_ORIGIN` matches your Vercel URL exactly.

---

## 6. Step 4: Seed the Initial Production Admin Account

Once the backend is live on Render:
1. In the Render Dashboard, navigate to `education-committee-backend`.
2. Click the **Shell** tab (opens a web terminal in your container).
3. Run the interactive seed command:
   ```bash
   npm run seed:admin
   ```
4. Enter your Committee Head mobile number and secure password when prompted.
5. The account is created directly in MongoDB Atlas with `committee_head` privileges.

---

## 7. Step 5: Private File Storage on Cloud Free Tier

### Free Tier Storage Behavior (Render Ephemeral Disks)
Render free tier containers use ephemeral filesystems. If the container sleeps after 15 minutes of inactivity or restarts, files written to `./storage/omr_private` are reset.

### Production Solution: S3-Compatible Cloud Storage (Free)
The portal includes a pluggable storage abstraction (`backend/src/services/storage.service.js`).
You can use **Cloudflare R2** (10 GB free forever, zero egress fees) or **Supabase Storage** (1 GB free) to persist private OMR scans permanently:

Configure in Render backend environment:
```env
STORAGE_PROVIDER=s3
S3_BUCKET=shiksha-omr-private
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<your-r2-access-key>
S3_SECRET_ACCESS_KEY=<your-r2-secret-key>
```
All OMR uploads and PDFs are securely stored in the private bucket, while access remains strictly gated through authenticated admin endpoints.

---

## 8. Step 6: Seamless Future VPS Migration (Ubuntu + Nginx + PM2)

When ready to upgrade to a dedicated Ubuntu VPS (e.g. DigitalOcean, Hetzner, AWS EC2, Linode) with a custom domain (`portal.educationcommittee.org`):

### 1. Zero Code Changes Required
The architecture is designed with clean boundaries. Migration requires **no changes to application code**:
1. Clone the repository on the VPS.
2. In `backend/.env`:
   - Set `CLIENT_ORIGIN=https://portal.educationcommittee.org`
   - Set `COOKIE_SAME_SITE=lax` (same-origin cookie)
   - Set `STORAGE_PROVIDER=local` (uses the server's local high-speed NVMe SSD)
3. In `frontend/.env`:
   - Set `VITE_API_BASE_URL=/api/v1` (relative proxy path via Nginx)
   - Run `npm run build`
4. Follow the Nginx configuration and PM2 ecosystem file provided in [docs/PHASE_8_PRODUCTION_READINESS.md](PHASE_8_PRODUCTION_READINESS.md).
5. Obtain a free SSL certificate via Certbot:
   ```bash
   sudo certbot --nginx -d portal.educationcommittee.org
   ```

---

## 9. Free Hosting Limitations & Workarounds

| Consideration | Render / Vercel Free Tier | Mitigation / Workaround |
| :--- | :--- | :--- |
| **Render Cold Starts** | Free containers spin down after 15 minutes of inactivity. First request takes ~30–50 seconds to boot. | Use a free uptime monitor (e.g., UptimeRobot or Cron-job.org) to ping `GET /api/v1/health` every 10 minutes to keep instances warm during active exam periods. |
| **Cross-Domain Cookies** | Frontend (`.vercel.app`) and Backend (`.onrender.com`) are cross-site. Some browsers (Safari ITP) restrict third-party cookies. | 1. Configured `COOKIE_SAME_SITE=none` with `Secure=true`.<br>2. Backend returns session token in login response body, supporting `Authorization: Bearer <token>` fallback. |
| **Ephemeral Disk** | Render restarts wipe local `./storage`. | Configured `storage.service.js` abstraction supporting S3/Cloudflare R2, or upgrade to Render persistent disk / VPS. |
| **Execution Timeouts** | Vercel serverless has a 10s default timeout (does not affect SPA client, which runs purely in browser). Render free has a 100s HTTP timeout. | All intensive OMR processing runs asynchronously or in lightweight sub-second OpenCV operations. |
