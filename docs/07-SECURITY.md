# Security, Privacy, and Operational Policy
## Education Committee Competition Management System

## 1. Security objectives
Protect student personal information, exam integrity, answer keys, submissions, OMR images, results, and admin operations. Security must be enforced in the backend, not only in the UI.

## 2. Authentication and permissions
- Public sign-up always creates a student role; the client cannot select `admin`.
- Create the first admin through a one-time command or secure deployment procedure.
- Hash passwords with bcrypt (or another reviewed password hashing algorithm); never store plaintext passwords.
- Use secure session cookies or short-lived access tokens consistently.
- In production, require HTTPS and set secure cookie flags where cookies are used.
- Verify authorization on every protected route.
- Students can access only their own profile, registrations, attempts, uploads, and published results.
- Admin role changes require an existing authorized admin and an audit event.
- Rate-limit authentication and sensitive lookup endpoints.

## 3. Exam integrity
- Correct answers are stored server-side and excluded from student-facing APIs.
- Server time determines exam eligibility and deadline.
- Score is calculated only by backend code.
- Repeated submit requests are idempotent.
- After submission, answer changes are rejected unless an explicit audited admin correction process exists.
- Answer-key changes after exam start require an audit event and documented re-evaluation decision.
- Result publication requires authorized admin confirmation.
- Log answer-key finalization, OMR corrections, score overrides, and publication.

## 4. Upload security
- Accept only approved raster formats for MVP (JPEG/PNG); do not trust file extension or client MIME type alone.
- Set a maximum file size (initial target 8 MB) and reasonable pixel/dimension limits.
- Decode and validate image content server-side.
- Generate random internal file names; do not use user-provided path names.
- Store uploads outside public web root or in private object storage.
- Never execute uploaded content.
- Authorize every image preview/download request.
- Use malware scanning if available in the hosting environment.
- Limit upload rate and handle decompression/image-bomb risks.
- Delete rejected/expired uploads according to a documented retention policy.

## 5. Privacy and data minimization
- Collect only data necessary to administer the competition.
- Do not expose mobile numbers, email addresses, passwords, detailed answers, or OMR images on public merit lists.
- Decide whether student names can be published; obtain appropriate notice/consent and follow applicable requirements, especially for minors.
- Do not collect identity documents or sensitive data unless legally necessary and explicitly approved.
- Restrict access to personal data by role.
- Define how long registrations, results, audit events, and OMR images are retained.
- Provide a process for correcting inaccurate profile information.
- Use privacy-aware logging; never log passwords, tokens, or full uploaded images.

## 6. Secrets and configuration
- Commit `.env.example` with placeholder values only.
- Add `.env`, private keys, uploads, logs, `node_modules`, Python virtual environments, and caches to `.gitignore`.
- Use different credentials for development and production.
- Rotate secrets if they are exposed.
- Restrict database user permissions and network access.
- Do not embed secrets in React environment variables; frontend build-time variables are public.

## 7. Database and service protection
- Use database authentication and least-privilege access.
- Restrict MongoDB network access to required application hosts.
- Validate all IDs and request payloads.
- Never pass arbitrary request objects directly to Mongo query operators.
- Set request body limits and API rate limits.
- Keep OMR service private and authenticate backend-to-OMR requests.
- Use timeouts and bounded retries for OMR service calls.
- Avoid exposing stack traces, connection strings, or environment details in API errors.

## 8. Audit and result correction
Audit at least:
- Admin login failures and role changes.
- Competition schedule/scoring changes.
- Answer-key finalization and changes.
- OMR detection review and manual corrections.
- Result overrides, exclusions, publication, and republishing.
Each event should include actor, action, entity, timestamp, reason where relevant, and safe before/after values.

## 9. Backup and incident readiness
- Enable managed database backups before real competition use.
- Test restoring a backup, not only creating one.
- Keep an export of published results under committee-controlled access.
- Document who to contact if admin credentials or student data are exposed.
- Have a plan to pause registration/exam submissions during a serious incident.
- Test deployment rollback before a live event.

## 10. Pre-launch security checklist
- [ ] No secrets in Git history or frontend bundle.
- [ ] Admin creation is not publicly accessible.
- [ ] Student cannot access another student's resources by changing IDs.
- [ ] Correct answers are absent from exam responses.
- [ ] Unpublished results are inaccessible to students/public.
- [ ] Upload size/type/content checks are active.
- [ ] OMR images require authorization.
- [ ] Rate limiting and safe errors are enabled.
- [ ] Database backup and restore tested.
- [ ] Audit events exist for sensitive admin actions.
- [ ] Privacy notice and data-retention policy approved by committee.
