# Education Committee Competition Management System
### (शिक्षा समिति प्रतियोगिता प्रबंधन प्रणाली)

A secure, mobile-friendly, production-ready web platform for managing village-level and regional educational competitions. The portal supports both **Online MCQ examinations** (with real-time auto-save, anti-cheat detection, and auto-submission) and **Paper OMR sheet evaluations** (with automated OpenCV vision detection and human-in-the-loop verification), powered by a **unified, auditable central scoring engine**.

---

## 🚀 Key Features

- **Dual-Mode Examination System**:
  - **Online MCQ Engine**: Real-time timer sweeper, state recovery on reload, question navigation palette, instant auto-save, and tab-switch cheating prevention.
  - **Automated OMR Vision Pipeline**: OpenCV fiducial marker alignment, perspective correction, bubble fill measurement, and high-accuracy classification.
- **Admin OMR Verification & Human Review**:
  - Side-by-side synchronized view of original scan and rectified image.
  - Question-wise bubble inspection with confidence values.
  - Strict separation between machine raw detections and human-confirmed answers.
- **Central Scoring Engine (Phase 5 Math)**:
  - Supports positive marking, negative marking, and penalty thresholds.
  - Instant tie-breaking algorithm (accuracy ratio, birth date, registration order).
  - Published/Unpublished state control with public merit list toggling.
- **Role-Based Access Governance**:
  - `student`: Profile, competition registration, online test taker, scorecard viewer.
  - `admin`: Competition management, question bank authoring, student registrations, OMR upload & verification.
  - `committee_head`: Sole authority for result publication, unpublishing, and merit list release.
- **Full Hindi & English Localization**: Seamless toggle with complete Devanagari Hindi translations across all student and administrative screens.
- **Enterprise-Grade Security**:
  - Secure HttpOnly session cookies with SameSite controls.
  - CSRF double-submit token protection.
  - Server-side JWT blacklisting and `tokenVersion` session invalidation.
  - Rate limiting against brute-force login and registration flooding.
  - Strict startup pre-flight secret validation (`validateProductionEnv`).
  - Private filesystem isolation for all student OMR submissions.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Responsive CSS Tokens, Lucide Icons |
| **Backend API** | Node.js (LTS), Express, Mongoose, Helmet, Cookie-Parser, Rate-Limit |
| **Database** | MongoDB (v6+ / Atlas), Mongoose connection pooling |
| **OMR Vision Microservice** | Python 3, FastAPI, OpenCV (`cv2`), NumPy, PyMuPDF |
| **PDF Generation** | PDFKit, QRCode |

---

## 📋 System Requirements

- **Node.js**: v18.0.0 or higher
- **MongoDB**: v6.0 or higher (or MongoDB Atlas)
- **Python**: v3.10+ (for internal OMR microservice)
- **Memory**: Minimum 2 GB RAM (4 GB recommended for concurrent image processing)

---

## 🛠️ Quick Start (Local Development)

### 1. Clone & Setup Environment
```bash
git clone <repository-url>
cd "shiksha samiti committee"

# Copy environment variables template
cp .env.example .env
```

### 2. Backend Setup
```bash
cd backend
npm install
# Seed the initial Committee Head / Admin account interactively:
npm run seed:admin
# Start backend in development mode:
npm run dev
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
The frontend portal will be accessible at `http://localhost:5173` (or `http://localhost:5174`).

### 4. Python OMR Service Setup
```bash
cd ../omr-service
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

---

## 🛡️ Production Deployment

For complete real-world production deployment specifications, refer to [docs/PHASE_8_PRODUCTION_READINESS.md](docs/PHASE_8_PRODUCTION_READINESS.md).

### 1. Build the Frontend
```bash
cd frontend
npm run build
```
Compiled production assets are output to `frontend/dist`.

### 2. Configure Environment (`.env`)
Ensure all production secrets are defined before starting:
- Set `NODE_ENV=production`
- Configure strong random `JWT_SECRET` (at least 32 characters)
- Configure strong `OMR_INTERNAL_KEY` (at least 16 characters)
- Set trusted `CLIENT_ORIGIN` (no wildcards)
- Set valid `MONGODB_URI`

The server performs automated pre-flight security validation at startup and refuses to start if insecure dev secrets are detected.

### 3. Seed or Rotate Admin Credentials
```bash
# Seed initial admin:
node backend/src/scripts/seedAdmin.js

# Secure password rotation (invalidates all existing sessions):
node backend/src/scripts/seedAdmin.js --rotate-password --mobile 9876543210
```

### 4. Database Operations
- **Backup**:
  ```powershell
  powershell -File scripts/backup_database.ps1 -OutputDir ./backups
  ```
- **Restore**:
  ```powershell
  powershell -File scripts/restore_database.ps1 -ArchivePath ./backups/backup_TIMESTAMP.gz
  ```

---

## 🧪 Automated Test Suites

```bash
# Backend Regression & Phase Audits:
cd backend
npm test test/phase8_production_smoke.test.js
npm test test/phase7_frontend_support.test.js
npm test test/phase6_8_audit.test.js

# Frontend Localization & Component Suite:
cd ../frontend
npm test
```

---

## 📑 Detailed Documentation

- [01-PRD.md](docs/01-PRD.md) — Product requirements and user journeys.
- [02-TRD.md](docs/02-TRD.md) — Technical requirements and architecture.
- [06-DATABASE.md](docs/06-DATABASE.md) — Database models and indexing.
- [07-SECURITY.md](docs/07-SECURITY.md) — Security policies and authentication.
- [PHASE_8_PRODUCTION_READINESS.md](docs/PHASE_8_PRODUCTION_READINESS.md) — Production readiness report, reverse proxy, PM2 configs, and runbooks.
