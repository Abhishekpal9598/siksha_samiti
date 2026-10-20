# Product Requirements Document (PRD)
## Education Committee Competition Management System

- **Document version:** 1.0
- **Status:** Baseline for implementation
- **Product owner:** Education Committee Head (Admin)
- **Primary audience:** 50–200 students per competition
- **Language:** Hindi/Hinglish-first interface; English technical identifiers
- **Platforms:** Responsive web app for mobile, tablet, and desktop

## 1. Product vision
Build a reliable, mobile-friendly website for managing village-level education competitions. Students can register, sit an online MCQ exam or submit a paper OMR sheet, and view published results. Authorized committee admins manage competitions, questions, answer keys, OMR verification, results, and merit lists.

## 2. Goals
1. Make student registration simple on mobile devices.
2. Give each student a unique registration/roll number per competition.
3. Support both online MCQ and paper OMR workflows.
4. Use one shared scoring and ranking engine for both modes.
5. Keep answer keys, personal data, and unpublished results private.
6. Make OMR uncertainty visible and require human review when confidence is insufficient.
7. Provide a clear audit trail for result changes and publication.

## 3. Non-goals for MVP
- Payments, fee collection, SMS/WhatsApp integrations.
- Native Android/iOS applications.
- AI-based handwritten answer interpretation.
- Reading arbitrary answer-key photos automatically.
- Facial recognition or biometric verification.
- Multiple organizations/tenants in the first release.
- Offline-first exam delivery. Online exam requires connectivity; server-side autosave reduces data-loss risk.

## 4. User roles
### Student
- Register and log in.
- View available competitions and registration status.
- View own roll number and exam instructions.
- Take an online MCQ exam when eligible, or upload an OMR image when the competition allows it.
- View own result only after publication.
- Download/print own result if enabled.

### Admin / Committee Head
- Log in through a protected admin account.
- Create and configure competitions.
- Manage registrations and students.
- Create questions and set the answer key.
- Review online submissions and OMR submissions.
- Correct OMR detections through an audited review process.
- Generate, preview, and publish the merit list.
- Export allowed reports and view audit logs.

## 5. Core user journeys
### Registration
1. Student opens the public website.
2. Student selects an open competition.
3. Student fills required fields and submits.
4. Server validates data and prevents duplicate registration for the same competition.
5. Server assigns a unique roll number within that competition.
6. Student sees confirmation and can revisit the registration in their account.

### Online MCQ
1. Student logs in and opens an eligible competition.
2. Server confirms registration, schedule, and attempt eligibility.
3. Server sends questions/options but never correct answers.
4. Student answers; the client periodically saves answers through the API.
5. Student submits, or the server closes the attempt when time expires.
6. Server calculates score using the approved answer key and stores an immutable submission record.
7. Result remains hidden until admin publishes results.

### Paper OMR
1. Student is registered and has a roll number.
2. Admin provides the official fixed-layout OMR template and instructions.
3. Authorized user uploads a clear image and links it to a competition and student/roll number.
4. OMR service normalizes the image, checks template alignment, and detects marked bubbles.
5. Submission is marked `needs_review` if image quality, alignment, or any answer is uncertain.
6. Admin reviews the detected answers and confirms/corrects them.
7. The common scoring engine calculates marks.
8. Admin previews and publishes results.

### Result publication
1. Admin checks completeness and unresolved OMR reviews.
2. Admin generates a preview of scores and ranking.
3. Admin confirms ranking rules and publishes.
4. Students can view their own result; public merit list exposes only approved fields such as roll number, name (if consented/approved), score, and rank.

## 6. Functional requirements
### FR-01 Registration
- Required fields: full name, mobile number, school/college, class/grade, competition.
- Optional fields should be explicitly marked optional.
- Validate phone format and required values on client and server.
- Store normalized phone number; never rely on frontend validation alone.
- Enforce one registration per student identity per competition. MVP identity key: normalized mobile + competition, with admin override workflow for shared family phone numbers.
- Generate a non-sequential, unique registration ID and a readable roll number scoped to competition.
- Avoid collecting unnecessary sensitive data.

### FR-02 Authentication
- Student and admin sessions use secure authentication.
- Passwords are hashed with bcrypt or an equivalent approved password hash.
- Admin authorization is enforced server-side for every admin API.
- No default production admin password or secret is hardcoded.
- Rate-limit login attempts and provide safe error messages.

### FR-03 Competition management
- Competition fields: title, description, status, registration open/close, exam start/end, duration, mode (`online`, `omr`, `both`), total marks, negative marking settings, result status.
- Status lifecycle: `draft` → `published` → `registration_closed` → `exam_closed` → `results_published` (admin actions may close earlier).
- Validate that duration, dates, marks, and question configuration are consistent.
- Published competitions with submissions cannot have their scoring rules silently changed; changes require an audited administrative action and re-evaluation policy.

### FR-04 Question bank and answer key
- MCQ question has prompt, exactly four options (A–D), correct option, marks, optional explanation, and order.
- Question content delivered to students excludes correct option and internal scoring metadata.
- Answer key is editable only by authorized admins before finalization; after attempts begin, changes are audited and flagged.
- Random question/option order is a future enhancement unless implemented and tested explicitly.

### FR-05 Online exam
- Server controls eligibility and exam timing.
- Answers are stored server-side during an attempt.
- Submission is idempotent: repeated submit requests must not create duplicate results.
- Client timer is informational; server timestamps are authoritative.
- On timeout, server closes the attempt using the last saved answers.
- Prevent a student from accessing another student's attempt.
- If network drops, previously saved answers remain available when reconnecting.

### FR-06 OMR processing
- MVP supports one documented, fixed OMR template with alignment markers and fixed A/B/C/D bubble coordinates.
- Accept JPEG/PNG only; enforce size limits (initial target 8 MB), decode images safely, and store files outside the public web root.
- Validate dimensions and template alignment before detection.
- OpenCV service returns per-question detection, confidence/quality indicators, and processing status; it does not publish results.
- Blank/multiple/unclear bubbles are represented explicitly, not guessed.
- Admin review is required for any uncertain answer and before OMR results are finalized.
- Keep original image, processed preview (if generated), detected answers, corrections, reviewer, and timestamps.
- Answer-key photo OCR is out of MVP scope; admin enters the key in the UI.

### FR-07 Scoring and ranking
- One common scoring function handles online and verified OMR answers.
- Per question: correct earns configured marks; incorrect applies configured negative marks; unanswered earns zero unless competition rules specify otherwise.
- Store correct, incorrect, unanswered, positive marks, penalty, and final score separately.
- Validate that score calculation matches the competition configuration.
- Rank by final score descending. Tie-break order must be configured before publication. Default: score descending, then more correct answers, then fewer incorrect answers; if still tied, assign the same rank (competition ranking: 1, 2, 2, 4).
- Online and OMR participants can appear in the same merit list if they belong to the same competition and use the same scoring rules.
- Only verified submissions are eligible for final ranking.

### FR-08 Results and reports
- Results are private until published.
- Student can query own result using authenticated account; public lookup by roll number must use a safe, hard-to-guess reference or additional verification to prevent enumeration.
- Admin can preview merit list and export CSV/printable report.
- Public merit list must not expose mobile numbers, addresses, passwords, answer-level data, or original OMR images.
- Record who published and when.

### FR-09 Audit and administration
- Audit events for login failures, answer-key changes, OMR corrections, score overrides, result publication, and role changes.
- Any manual score override requires reason, admin identity, timestamp, previous value, and new value.
- Admin can filter students/submissions by competition, status, and roll number.

## 7. Non-functional requirements
- **Capacity:** 50–200 students per competition; design for a short burst of concurrent users.
- **Responsive:** usable at 360 px mobile width and larger.
- **Performance:** common pages should feel responsive on typical mobile internet; paginate long tables.
- **Availability:** use managed hosting and database backups before live competitions.
- **Security:** HTTPS in production, secure cookies or appropriately protected tokens, server-side authorization, rate limits, file validation, and least privilege.
- **Privacy:** collect minimum personal data, limit access, and define retention/deletion policy with the committee.
- **Accessibility:** labels for inputs, keyboard focus, readable contrast, clear validation messages.
- **Maintainability:** modular code, `.env.example`, setup guide, tests, and API documentation.

## 8. Acceptance criteria for MVP
- A student can register once for a competition and receive a unique roll number.
- Admin can create a competition and add MCQ questions.
- An eligible student can complete and submit an online exam.
- Correct answers are never included in the student exam API response.
- Backend calculates score consistently with configured marks and penalties.
- Admin can upload a supported OMR image and see detected answers.
- Uncertain OMR answers are flagged and cannot silently become final.
- Admin can verify OMR answers, preview results, and publish a merit list.
- Students cannot view other students' private results.
- Unauthorized users cannot call admin APIs.
- Tests cover registration duplicates, scoring, ranking/ties, exam timing, permissions, and OMR review status.

## 9. MVP release plan
1. Foundation: repo, UI shell, API health, environment config.
2. Identity: student registration/login and admin access.
3. Competition and questions.
4. Online exam and autosave.
5. Common scoring and unpublished results.
6. OMR upload, detection, and manual verification.
7. Merit list, export, audit log.
8. Security review, load tests, backups, deployment rehearsal.

## 10. Open decisions to confirm before live launch
- Official committee name/logo and language preferences.
- Whether student names may appear on public merit lists.
- Final OMR sheet layout and printing requirements.
- Exact marking and tie-break policy.
- Who may upload OMR sheets (student, admin, or both).
- Data retention period and parent/guardian consent requirements for minors.


## 11. Locked decisions for implementation (v1.1 — 2026-10-19)
These decisions override any ambiguous wording elsewhere in this document.

- **Result mode: Head publishes, then students see their own result.** Before publication, no student endpoint or public merit-list endpoint may disclose scores, rank, pass/fail, or result existence/status beyond a generic “results not published yet” response. After publication, a logged-in student may see only their own result. The public merit list, if enabled for the competition, contains only the approved minimal fields listed in FR-08.
- **Test mode: both Online MCQ and OMR are supported by the same competition.** `mode: "both"` means the competition supports either route; it does not mean a student must complete both or receive two scores. Each registration must have one selected/assigned `examMode` (`online` or `omr`). Lock this choice when the student starts an online attempt or an OMR sheet is first accepted. Changing it afterward requires an audited Admin action and invalidation of any previous in-progress/accepted submission under a documented policy.
- **One final result per registration.** Online submissions are scored by the server. OMR detections remain provisional until an Admin reviews and verifies them. Only the selected route may feed the registration's final result.
- **Publication gate:** the Committee Head must preview the ranking, resolve or explicitly audit-exclude unresolved submissions, and confirm publication. Publication records publisher, timestamp, and result version; republishing/re-evaluation is audited.
- **Answer privacy:** correct answers and internal scoring fields are never returned to student/browser APIs, including after publication unless a separate post-exam answer-review feature is explicitly specified later.
