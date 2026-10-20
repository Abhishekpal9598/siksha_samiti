# Implementation Plan and Definition of Done
## Education Committee Competition Management System

## 1. Delivery strategy
Build a small working slice at a time. After each phase, run tests and confirm the app remains runnable. Do not ask the coding agent to implement all modules in one unreviewed pass.

## 2. Repository structure target
```text
education-committee/
├── docs/
│   ├── 01-PRD.md
│   ├── 02-TRD.md
│   ├── 03-APP-FLOW.md
│   ├── 04-UI-UX.md
│   ├── 05-BACKEND-API.md
│   ├── 06-DATABASE.md
│   ├── 07-SECURITY.md
│   └── 08-IMPLEMENTATION-PLAN.md
├── client/
├── server/
├── omr-service/
├── tests/
├── .env.example
├── .gitignore
└── README.md
```

## 3. Phase plan
### Phase 0 — Documentation and repository
Tasks:
- Save all eight documents under `docs/`.
- Read and reconcile requirements.
- Create root README, `.gitignore`, and `.env.example`.
- Initialize Git repository and first commit.

Exit criteria:
- All documents exist and link to each other consistently.
- No credentials or real student data are present.
- Agent reports files created and questions/assumptions.

### Phase 1 — Foundation
Tasks:
- Create React + Vite frontend.
- Create Express API with health/readiness endpoint.
- Add shared error format, request ID, Helmet, CORS configuration, environment validation.
- Add lint/format/test commands.

Exit criteria:
- Frontend starts locally.
- API health endpoint returns success.
- Invalid/missing production config fails safely.
- No fake login or hardcoded result logic.

### Phase 2 — MongoDB and identity
Tasks:
- Add Mongoose models for users, competitions, registrations.
- Add secure student authentication and admin seeding command.
- Add authorization middleware.
- Add registration form and student dashboard.

Exit criteria:
- Duplicate account/registration tests pass.
- Student cannot set own role to admin.
- Admin routes reject unauthenticated/non-admin requests.
- Roll numbers are unique within a competition.

### Phase 3 — Competition and question bank
Tasks:
- Admin creates/edits/publishes competitions.
- Add question editor and answer-key finalization.
- Add student-safe competition/question serializers.
- Add question count/marks validation.

Exit criteria:
- Public API never returns correct answers.
- Invalid schedule or incomplete question configuration cannot be published.
- Answer-key finalization is audited.

### Phase 4 — Online MCQ
Tasks:
- Start/resume attempt.
- Render exam and timer.
- Autosave answers.
- Submit/timeout handling and idempotency.
- Common scoring service.

Exit criteria:
- Server deadline is enforced.
- Repeated submit does not duplicate results.
- Scoring unit tests cover correct, wrong, unanswered, negative marks, and invalid option IDs.
- Network interruption does not erase server-saved answers.

### Phase 5 — Result and ranking
Tasks:
- Store calculated result records.
- Add admin preview and publication.
- Add student own-result page that stays locked until the Committee Head publishes results.
- Add merit-list page and CSV/print export; public merit-list visibility is off by default and enabled explicitly by Admin.
- Add publication version, publisher/timestamp, and audited re-publication/correction flow.
- Add tie-break policy and audit events.

Exit criteria:
- Unpublished results are hidden.
- Student can view only own result, and only after publication.
- Before publication, API responses do not leak score/rank/result status.
- Head-only publication gate is enforced server-side and audited.
- Tie rules are deterministic and tested.
- Public merit list exposes only approved fields.

### Phase 6 — OMR
Tasks:
- Finalize and document a single printed OMR template.
- Build private image upload and validation.
- Build Python OpenCV image normalization and bubble detection.
- Add confidence/quality warnings and manual review screen.
- Send verified answers to common scoring service.
- Enforce one selected route per registration: online MCQ OR OMR. For `mode="both"`, both routes are available across participants, but a registration cannot produce two final results. Lock the route on first attempt start/upload.

Exit criteria:
- Clean sample sheets are detected within a measured, documented accuracy target.
- Skewed/unclear/multiple-marked samples are flagged rather than guessed.
- Manual corrections record reviewer, time, and reason.
- OMR result cannot be finalized before verification.
- Original images remain private.

### Phase 7 — Hardening and deployment
Tasks:
- Add API/frontend/OMR tests.
- Test 200 simulated students with realistic bursts.
- Verify HTTPS, environment variables, database access rules, backup/restore.
- Test mobile UX and accessibility.
- Run deployment rehearsal and rollback test.
- Write operations checklist for competition day.

Exit criteria:
- Critical tests pass.
- No unresolved high-severity security issues.
- Backup restore is demonstrated.
- Admin knows how to pause an exam, review OMR, publish results, and recover from common errors.

## 4. Suggested development order inside the AI coding tool
For each phase, use this loop:
1. Ask the agent to read `docs/01-PRD.md` through `docs/08-IMPLEMENTATION-PLAN.md`.
2. Ask it to implement only the next phase.
3. Ask it to list files changed and explain why.
4. Ask it to run relevant tests and report actual command output.
5. Review diffs; reject unrelated changes.
6. Fix failures before starting the next phase.
7. Commit the working phase to Git.

## 5. Master implementation prompt for Antigravity
```text
You are the senior engineer for this repository.

Before coding, read all Markdown files in /docs. Treat them as the product and technical source of truth. If two documents conflict, stop and report the exact conflict rather than guessing.

Implement ONLY the phase I specify. Inspect existing files first and do not overwrite unrelated work. Use React + Vite, Node.js + Express, MongoDB/Mongoose, and Python + OpenCV as specified.

Requirements:
- Keep frontend, API, and OMR service responsibilities separate.
- Validate input on both client and server.
- Enforce authorization in the API.
- Never expose answer keys or unpublished results.
- The Committee Head is the only role that can publish results; students see only their own result after publication.
- A `both` competition offers Online MCQ and OMR as alternative routes; one registration can feed only one final result.
- Never trust client-calculated scores.
- OMR detections are provisional until required admin verification.
- Do not hardcode secrets or fake successful database operations.
- Update tests and README/setup instructions when behavior changes.
- Run relevant tests and report actual results; never claim tests passed if they were not run.
- Summarize files created/changed, commands run, test results, known limitations, and the exact next manual step.
- Keep explanations in simple Hinglish.

Start with Phase 1 only unless I explicitly authorize another phase.
```

## 6. Git setup commands
Run from the repository root after checking that Git is installed:
```powershell
git init
git add .
git status
git commit -m "docs: add project blueprint"
```
If Git asks for identity, configure your own Git name/email. Before `git add .`, confirm `.env` and private uploads are ignored.

## 7. Manual QA checklist
### Registration
- [ ] Valid registration succeeds.
- [ ] Duplicate registration is blocked.
- [ ] Invalid mobile/name fields show errors.
- [ ] Roll number is unique and stable.

### Online exam
- [ ] Exam cannot start early or after close.
- [ ] Correct answers are not sent to browser.
- [ ] Autosave status is visible.
- [ ] Timeout and repeated submission work safely.
- [ ] Backend calculates marks correctly.

### OMR
- [ ] Valid JPEG/PNG is accepted.
- [ ] Oversized/unsupported files are rejected.
- [ ] Wrong template/skew/blur are flagged.
- [ ] Blank and multiple bubbles are not guessed.
- [ ] Admin corrections are audited.
- [ ] Only verified submissions can enter final scoring.

### Results
- [ ] Unpublished result is hidden.
- [ ] Student sees only own result.
- [ ] Ranking/tie logic matches documented rules.
- [ ] Merit list contains only approved public fields.
- [ ] Re-publication creates an audit record.

### Operations
- [ ] 200-student load test run.
- [ ] Database backup/restore tested.
- [ ] Secrets are not in Git or frontend build.
- [ ] Mobile UI tested at 360 px.
- [ ] Deployment and rollback instructions tested.

## 8. Release rule
Do not use the system for a real competition until authentication, exam timing, score calculation, result privacy, OMR verification, backups, and deployment have all been tested. OMR accuracy must be measured on representative printed and photographed sheets; do not assume perfect accuracy.


## 9. Locked implementation decisions (v1.1 — 2026-10-19)

### Required build order
1. Implement `registrations.examMode` and route-locking rules before building either exam UI.
2. Implement online MCQ as one route and OMR upload/review as the second route; both must call the same server-side scoring service.
3. Implement Admin result preview and publication before exposing student result UI. Student result page must show a neutral “Results have not been published yet” state until the server authorizes the published result.
4. Implement publication metadata and audit records (`publishedBy`, `publishedAt`, `publicationVersion`) and a safe re-publication process.
5. Add automated authorization tests before deployment.

### Antigravity prompt for the next implementation pass
```text
Read docs/01-PRD.md, docs/05-BACKEND-API.md, docs/06-DATABASE.md, docs/07-SECURITY.md, and docs/08-IMPLEMENTATION-PLAN.md first. Follow the locked decisions exactly:
- Competition mode supports online, OMR, or both. When mode is both, each registration uses one route only: online OR OMR, never both for a final result. Store and lock registrations.examMode at first attempt start or first accepted OMR upload.
- Online MCQ and verified OMR answers use the same server-side scoring and ranking service. OMR detections are provisional and require Admin verification when uncertain and before final scoring.
- Only the Committee Head/Admin can publish results. Before publication, student endpoints return no scores/ranks or unpublished-result metadata. After publication, a student can fetch only their own published result. Public merit list is separate and disabled unless explicitly enabled by Admin.
- Never send correctOption, answer key, other students' answers, private OMR files, contact details, or unpublished scores to student clients. Enforce all permissions on the server, not just in React.
Implement only the requested phase. Add tests for both route lockout directions, pre-publication secrecy, student ownership, Admin-only publication, and OMR review gates. Run tests and report actual outputs; do not claim success without evidence. Explain the steps in simple Hinglish.
```

### Additional release-blocking tests
- [ ] Head-only result publication works; student cannot publish results by direct API call.
- [ ] Student result API is empty/neutral before publication and returns only that student's result after publication.
- [ ] Public merit list is hidden until published and only available when `publicMeritListEnabled=true`.
- [ ] A `both` competition allows both modes across participants but prevents dual-route submission for the same registration.
- [ ] Route-lock race test proves concurrent MCQ start and OMR upload cannot both succeed for one registration.
- [ ] Re-publication after score correction increments version and writes a reasoned audit event.
