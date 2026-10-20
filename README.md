# Education Committee Competition Management System (शिक्षा समिति प्रतियोगिता प्रबंधन प्रणाली)

A secure, mobile-friendly web application for managing village-level educational competitions, supporting both Online MCQ examinations and paper OMR sheet evaluations through a unified scoring engine.

## 📚 Project Documentation
Complete technical and product specifications are located in the `docs/` folder:
- [01-PRD.md](docs/01-PRD.md) — Product scope, user roles, functional & non-functional requirements.
- [02-TRD.md](docs/02-TRD.md) — System architecture, tech stack, and service boundaries.
- [03-APP-FLOW.md](docs/03-APP-FLOW.md) — Navigation flows, online exam & OMR lifecycles.
- [04-UI-UX.md](docs/04-UI-UX.md) — UI/UX design tokens, responsive breakpoints, accessibility.
- [05-BACKEND-API.md](docs/05-BACKEND-API.md) — REST API endpoints, DTO contracts, authorization matrix.
- [06-DATABASE.md](docs/06-DATABASE.md) — MongoDB schemas, indexing strategies, and scoring math.
- [07-SECURITY.md](docs/07-SECURITY.md) — Security policies, exam integrity, privacy controls.
- [08-IMPLEMENTATION-PLAN.md](docs/08-IMPLEMENTATION-PLAN.md) — Phased implementation plan, QA gates, release criteria.

## 🛠 Planned Tech Stack
- **Frontend:** React (Vite), React Router, TailwindCSS / CSS tokens
- **Backend API:** Node.js (LTS), Express, Mongoose
- **Database:** MongoDB
- **OMR Service:** Python 3, OpenCV, NumPy
- **Security:** bcrypt, HttpOnly cookies/JWT, rate limiting, role-based authorization

## 📌 Phase Status
- **Phase 0:** Documentation Copy & Git Initialization (Completed)
- **Phase 1:** Foundation (Pending authorization)
