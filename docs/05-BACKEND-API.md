# Backend Schema and API Specification
## Education Committee Competition Management System

## 1. API conventions
- Base path: `/api/v1`
- Content type: JSON, except multipart uploads.
- Authentication: secure session cookie or short-lived bearer access token. Choose one pattern and implement consistently.
- All admin routes require authenticated Admin role.
- All student-owned resources must be checked against the authenticated student ID.
- Dates use ISO 8601 UTC timestamps; competition timezone defaults to `Asia/Kolkata`.
- Never accept score, rank, correct answer, role, or publication state from an untrusted student request.

## 2. Standard error shape
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": [],
    "requestId": "generated-request-id"
  }
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `EXAM_NOT_OPEN`, `ATTEMPT_CLOSED`, `UPLOAD_REJECTED`, `OMR_REVIEW_REQUIRED`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## 3. Authentication API
### `POST /auth/register`
Creates a student account, not a competition registration.
Request:
```json
{
  "fullName": "Example Student",
  "mobile": "normalized-mobile",
  "password": "user-provided-secret",
  "school": "Example School",
  "classGrade": "10"
}
```
Response `201` contains safe user profile and next-step message; never return password/hash.

### `POST /auth/login`
Request: `{ "mobile": "...", "password": "..." }`
Response: safe user profile and session/token according to chosen auth strategy.

### `POST /auth/logout`
Invalidates the session/refresh token according to implementation.

### `GET /auth/me`
Returns current authenticated user's safe profile and role.

## 4. Competition API
### `GET /competitions`
Returns published competitions with public fields only. Supports status/date filters and pagination.

### `GET /competitions/:competitionId`
Returns public competition details, registration status, dates, exam mode and instructions. Never returns answer key or private admin notes.

### `POST /admin/competitions`
Admin-only. Request fields:
```json
{
  "title": "Annual Education Competition",
  "description": "Competition details",
  "mode": "both",
  "registrationOpensAt": "2026-11-01T00:00:00.000Z",
  "registrationClosesAt": "2026-11-15T18:30:00.000Z",
  "examStartsAt": "2026-11-20T04:30:00.000Z",
  "durationMinutes": 60,
  "marksPerQuestion": 1,
  "negativeMarkingPerWrong": 0,
  "timezone": "Asia/Kolkata"
}
```
Validate date order and permitted modes. The example dates are illustrative only.

### `PATCH /admin/competitions/:competitionId`
Admin-only update. Restrict changes that would invalidate existing registrations/attempts; require audit logging for sensitive changes.

### `POST /admin/competitions/:competitionId/publish`
Admin-only. Validate required fields and finalized question/answer-key state before publication.

## 5. Registration API
### `POST /competitions/:competitionId/registrations`
Authenticated student. Server determines student ID and generates roll number. Request contains only allowed registration-specific details. Enforce unique `(competitionId, studentId)` and normalized mobile/identity policy.

Response:
```json
{
  "registrationId": "server-generated-id",
  "rollNumber": "EC-26-AB12",
  "status": "registered"
}
```
Roll number format is illustrative; generate a collision-safe value and enforce a unique index.

### `GET /me/registrations`
Returns only registrations belonging to current student.

## 6. Question and answer-key API
### `POST /admin/competitions/:competitionId/questions`
Admin-only. Request includes prompt, exactly four options, marks, order, and correct option. Validate that question belongs to the competition.

### `GET /competitions/:competitionId/exam/questions`
Eligible student only. Return prompt/options/order and question IDs only. Never include `correctOption`, answer-key fields, internal scoring notes, or hidden explanation before allowed publication.

### `POST /admin/competitions/:competitionId/answer-key/finalize`
Admin-only; validates question count, option keys, marks, and total marks. Records key version, finalizing admin, and timestamp. Any later change is audited and may require re-evaluation.

## 7. Online attempt API
### `POST /competitions/:competitionId/attempts`
Checks registration, competition schedule, mode, and previous attempts. Creates or resumes an eligible attempt idempotently.

### `PATCH /attempts/:attemptId/answers`
Request:
```json
{
  "answers": [
    { "questionId": "question-id", "selectedOption": "B" },
    { "questionId": "another-id", "selectedOption": null }
  ]
}
```
Accept only allowed question IDs and option values. Do not accept score or correct-answer fields. Verify attempt ownership and server deadline.

### `POST /attempts/:attemptId/submit`
Locks the attempt and invokes the common scoring service. Repeated submissions return existing state/result instead of duplicating records. Server uses saved answers and authoritative timestamps.

## 8. OMR API
### `POST /competitions/:competitionId/omr-submissions`
Authenticated and authorized uploader. Multipart fields: `image`, `registrationId` (or approved roll-number resolution flow), optional client note. Server verifies allowed competition mode, file size/type, registration and upload deadline.

Response:
```json
{
  "omrSubmissionId": "server-generated-id",
  "status": "uploaded",
  "message": "OMR image received; processing/review may be required."
}
```

### `GET /admin/omr-submissions?status=needs_review&page=1&limit=25`
Admin-only paginated queue.

### `GET /admin/omr-submissions/:submissionId`
Returns original/processed image references only to authorized reviewers, detected answers, quality warnings, and audit history.

### `PATCH /admin/omr-submissions/:submissionId/review`
Admin-only. Request:
```json
{
  "answers": [
    { "questionNumber": 1, "confirmedOption": "A", "reason": "Verified against original image" },
    { "questionNumber": 2, "confirmedOption": null, "reason": "Blank response" }
  ],
  "reviewNote": "Reviewed original scan"
}
```
Validate all question numbers and options. Record detected value, confirmed value, reviewer, timestamp, and reason. The submission must then be explicitly verified/finalized.

### `POST /admin/omr-submissions/:submissionId/finalize`
Admin-only. Only allowed after required review; then sends confirmed answers to common scoring engine.

## 9. Result API
### `GET /me/results?competitionId=...`
Authenticated student; returns only their own published result.

### `GET /admin/competitions/:competitionId/results/preview`
Admin-only. Shows scores, missing submissions, unverified OMR items, tie-break rules, and ranking preview. Does not publish.

### `POST /admin/competitions/:competitionId/results/publish`
Admin-only. Rejects publication when unresolved submissions remain unless an explicit audited exclusion is recorded. Stores publication timestamp, publisher, and result version.

### `GET /competitions/:competitionId/merit-list`
Public only after publication. Return minimal approved fields: rank, roll number, display name if allowed, score, total marks. Never return phone numbers, emails, answer details, or OMR images.

### `GET /admin/competitions/:competitionId/merit-list.csv`
Admin-only export with appropriate CSV escaping and permitted fields.

## 10. Authorization matrix
| Resource/action | Public | Student | Admin |
|---|---:|---:|---:|
| View published competition details | Yes | Yes | Yes |
| Register self | No | Yes | Admin-assisted only if implemented |
| View own registration | No | Yes | Yes |
| Read correct answer key | No | No | Yes |
| Submit own online attempt | No | Yes | No, unless explicitly supported |
| Upload permitted OMR sheet | No | Yes/authorized uploader | Yes |
| Review/finalize OMR | No | No | Yes |
| View own published result | No | Yes | Yes |
| View unpublished results | No | No | Yes |
| Publish merit list | No | No | Yes |
| Read audit logs | No | No | Yes |

## 11. Business invariants
- A student cannot submit more than one final attempt unless the competition explicitly allows retakes.
- `correctOption` is never included in student-facing exam responses.
- Result and rank are calculated server-side.
- A score can be finalized only from a submitted online attempt or verified OMR answers.
- Results are not visible to students before publication.
- Re-evaluation and manual overrides are auditable.
- API errors must not reveal stack traces, secrets, or other students' data.


## 12. Locked result-publication and dual-test-mode rules (v1.1)
This section is authoritative if any earlier section is ambiguous.

### Test mode selection
- Competition `mode` may be `online`, `omr`, or `both`. For `both`, the student selects one route at registration/eligibility time, or Admin assigns it. Store it as `registrations.examMode: "online" | "omr"`.
- The server checks `examMode` on every attempt/upload request. An online registration cannot upload OMR, and an OMR registration cannot start an online attempt. If mode is `both`, do not create two independent final scores for one registration.
- Lock `examMode` when an attempt starts or the first OMR upload is accepted. Mode changes afterward are Admin-only, require a reason, must invalidate/reject the previous route according to policy, and must create an audit event.

### Student result visibility
- Before Head publication, `GET /me/results?competitionId=...` returns no score data and a minimal state such as `{\"status\":\"not_published\"}` (or HTTP 404 if that is the consistent privacy policy). Do not reveal whether a particular student's result has been calculated, approved, or withheld.
- After publication, `GET /me/results?competitionId=...` returns only the authenticated student's own published result. Query parameters must never allow a student ID or registration ID to override ownership.
- `GET /competitions/:competitionId/merit-list` returns data only after publication and only fields explicitly approved for display. If public merit lists are disabled for a competition, this endpoint returns 404/403. Never expose answer-level responses, contact details, OMR images, unpublished scores, or internal review notes.
- The Committee Head uses the admin preview endpoint before publishing. `POST /admin/competitions/:competitionId/results/publish` is the sole normal publication action and must be idempotent or versioned safely. It records `publishedBy`, `publishedAt`, and `publicationVersion` and writes an audit event. Only Admin can publish/unpublish/re-publish. Unpublishing, if supported, immediately hides student results and is audited.

### Required permission checks
1. Authentication middleware establishes actor ID and role; the API ignores client-supplied `studentId`, `role`, `score`, `rank`, `resultStatus`, and `publishedAt`.
2. Every student registration, attempt, OMR submission, and result query is scoped to the authenticated student's own records.
3. Every `/admin/*` endpoint checks the Admin role server-side; hiding a button in React is not authorization.
4. OMR original/processed image routes require Admin authorization; do not return storage keys as public URLs.
5. Student-safe serializers use explicit allowlists. Never serialize raw Mongoose documents for questions, attempts, OMR, results, or audit events.

### Authorization matrix addendum
| Action | Public | Student | Committee Head/Admin |
|---|---:|---:|---:|
| View public competition details | Published fields only | Yes | Yes |
| Choose one permitted test route | No | Own registration only, before lock | May assign/change with audit |
| Start/save/submit MCQ | No | Own `examMode=online` registration only | No, except explicit supervised workflow |
| Upload OMR | No | Own `examMode=omr` registration only, if student upload is enabled | Yes, for authorized admin-assisted upload |
| View detected OMR answers/images | No | No | Yes |
| Preview all scores/ranks | No | No | Yes |
| View own result before publication | No | No | Yes |
| View own result after publication | No | Yes | Yes |
| View merit list after publication | Approved fields only, if enabled | Approved fields only, if enabled | Yes |
| Publish/re-publish results | No | No | Yes |

### Acceptance tests for permissions
- Student A cannot fetch Student B's result by changing URL/query/body IDs.
- Before publication, a student cannot infer score/rank via `/me/results`, merit-list endpoint, API errors, or cached responses.
- After publication, Student A gets only Student A's result; answer keys and answer-level responses remain hidden.
- For a `both` competition, a registration locked to `online` cannot submit OMR and a registration locked to `omr` cannot start an MCQ attempt.
- Unresolved OMR reviews block publication unless an explicit, reasoned, audited exclusion is recorded.
