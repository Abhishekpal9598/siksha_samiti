# Database Structure — MongoDB / Mongoose
## Education Committee Competition Management System

## 1. Modeling principles
- Use MongoDB ObjectIds for internal references; expose separate registration IDs/roll numbers.
- Store timestamps (`createdAt`, `updatedAt`) on operational records.
- Keep answer keys separate from student-facing question payloads.
- Use indexes to prevent duplicates and support admin filters.
- Do not duplicate private student data into public merit-list documents unless necessary.
- Database schema validation complements, but does not replace, API validation.

## 2. Collections

### `users`
Purpose: authentication identity and profile.
```js
{
  _id: ObjectId,
  fullName: String,          // required
  mobileNormalized: String,  // required; unique per account policy
  passwordHash: String,      // required; never return to client
  role: "student" | "admin", // default student; public registration cannot set admin
  school: String,
  classGrade: String,
  isActive: Boolean,         // default true
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- unique `{ mobileNormalized: 1 }` if one account per mobile is the policy.
- `{ role: 1, isActive: 1 }`.

### `competitions`
```js
{
  _id: ObjectId,
  title: String,
  slug: String,
  description: String,
  status: "draft" | "published" | "registration_closed" | "exam_closed" | "results_published",
  mode: "online" | "omr" | "both",
  timezone: String,                  // default Asia/Kolkata
  registrationOpensAt: Date,
  registrationClosesAt: Date,
  examStartsAt: Date,
  durationMinutes: Number,
  marksPerQuestion: Number,
  negativeMarkingPerWrong: Number,    // non-negative penalty amount
  tieBreakPolicy: ["score", "moreCorrect", "fewerWrong", "sharedRank"],
  resultStatus: "hidden" | "preview" | "published", // only Committee Head can transition to published
  resultsPublicationVersion: Number,
  resultsPublishedAt: Date,
  resultsPublishedBy: ObjectId,
  publicMeritListEnabled: Boolean, // default false unless Committee Head explicitly enables it
  answerKeyVersion: Number,
  answerKeyFinalizedAt: Date,
  answerKeyFinalizedBy: ObjectId,
  createdBy: ObjectId,
  publishedAt: Date,
  publishedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- unique `{ slug: 1 }`.
- `{ status: 1, registrationOpensAt: 1 }`.
- `{ examStartsAt: 1 }`.

### `registrations`
```js
{
  _id: ObjectId,
  publicRegistrationId: String,  // unique, hard to guess
  competitionId: ObjectId,       // ref competitions
  studentId: ObjectId,           // ref users
  rollNumber: String,            // unique within competition
  status: "registered" | "withdrawn" | "disqualified",
  examMode: "online" | "omr" | null, // selected/assigned route; required for mode=both before test starts
  examModeLockedAt: Date | null,    // set when first attempt starts or first OMR upload is accepted
  examModeChangedBy: ObjectId | null, // only for audited Admin override
  registeredAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- unique `{ competitionId: 1, studentId: 1 }`.
- unique `{ competitionId: 1, rollNumber: 1 }`.
- unique `{ publicRegistrationId: 1 }`.
- `{ competitionId: 1, status: 1 }`.

### `questions`
```js
{
  _id: ObjectId,
  competitionId: ObjectId,
  order: Number,
  prompt: String,
  options: [
    { key: "A" | "B" | "C" | "D", text: String }
  ],
  correctOption: "A" | "B" | "C" | "D",
  marks: Number,
  explanation: String,       // optional; hide until allowed
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- unique `{ competitionId: 1, order: 1 }`.
- `{ competitionId: 1, isActive: 1 }`.
Validation:
- exactly four options with unique keys A/B/C/D.
- marks >= 0; correct option must exist.
- student API uses a serializer/DTO that explicitly omits `correctOption` and hidden fields.

### `attempts`
```js
{
  _id: ObjectId,
  competitionId: ObjectId,
  registrationId: ObjectId,
  studentId: ObjectId,
  mode: "online",
  status: "in_progress" | "submitted" | "timed_out" | "evaluated",
  startedAt: Date,
  deadlineAt: Date,
  submittedAt: Date,
  answers: [
    {
      questionId: ObjectId,
      selectedOption: "A" | "B" | "C" | "D" | null,
      savedAt: Date
    }
  ],
  scoringVersion: Number,
  resultId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- `{ competitionId: 1, studentId: 1, status: 1 }`.
- Unique `{ registrationId: 1, mode: 1 }` for single-attempt MVP; if retakes are later allowed, change to attemptNumber-based uniqueness.
- `{ deadlineAt: 1, status: 1 }`.

### `omrSubmissions`
```js
{
  _id: ObjectId,
  competitionId: ObjectId,
  registrationId: ObjectId,
  uploadedBy: ObjectId,
  originalFileKey: String,      // private object-storage key, not public URL
  processedFileKey: String,     // optional private preview
  templateVersion: String,
  status: "uploaded" | "processing" | "needs_review" | "reviewed" | "verified" | "rejected" | "failed",
  detectedAnswers: [
    {
      questionNumber: Number,
      detectedOption: "A" | "B" | "C" | "D" | null,
      state: "detected" | "blank" | "multiple" | "uncertain",
      confidence: Number,       // optional; calibrate using labeled samples
      warning: String
    }
  ],
  confirmedAnswers: [
    {
      questionNumber: Number,
      confirmedOption: "A" | "B" | "C" | "D" | null
    }
  ],
  qualityChecks: [String],
  reviewNote: String,
  reviewedBy: ObjectId,
  reviewedAt: Date,
  verifiedBy: ObjectId,
  verifiedAt: Date,
  resultId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- `{ competitionId: 1, status: 1, createdAt: 1 }`.
- `{ registrationId: 1, createdAt: -1 }`.
- Ensure the policy prevents duplicate final OMR submissions per registration unless replacement/re-upload is explicitly allowed.

### `results`
```js
{
  _id: ObjectId,
  competitionId: ObjectId,
  registrationId: ObjectId,
  studentId: ObjectId,
  sourceMode: "online" | "omr",
  sourceSubmissionId: ObjectId,
  scoringVersion: Number,
  answerKeyVersion: Number,
  correctCount: Number,
  incorrectCount: Number,
  unansweredCount: Number,
  positiveMarks: Number,
  penaltyMarks: Number,
  finalScore: Number,
  totalMarks: Number,
  rank: Number,
  status: "calculated" | "approved" | "published" | "superseded",
  calculatedAt: Date,
  publicationVersion: Number, // matches competition publication version when released
  approvedBy: ObjectId,
  approvedAt: Date,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
Indexes:
- unique `{ registrationId: 1 }` for one final result per registration in MVP.
- `{ competitionId: 1, status: 1, finalScore: -1 }`.
- `{ competitionId: 1, rank: 1 }`.

### `auditEvents`
```js
{
  _id: ObjectId,
  actorId: ObjectId,
  actorRole: "student" | "admin" | "system",
  action: String,
  entityType: String,
  entityId: ObjectId,
  competitionId: ObjectId,
  reason: String,
  before: Object,     // carefully whitelist fields; never include secrets
  after: Object,      // carefully whitelist fields; never include secrets
  requestId: String,
  ipHashOrTruncatedIp: String, // apply privacy policy
  createdAt: Date
}
```
Indexes:
- `{ competitionId: 1, createdAt: -1 }`.
- `{ entityType: 1, entityId: 1, createdAt: -1 }`.
- `{ actorId: 1, createdAt: -1 }`.

## 3. Relationship summary
- One `user` may have many `registrations`.
- One `competition` has many `registrations` and `questions`.
- Each registration has exactly one active exam route (`examMode`) when test eligibility is finalized. In a `both` competition, the route is either `online` or `omr`, not both.
- Lock `examMode` at first attempt start or first accepted OMR upload; only an audited Admin override may change it.
- Each registration has at most one final result; only a submission matching the locked `examMode` can feed that result. Any retake/replacement policy must be explicitly implemented and audited.
- One competition has one current published merit list generated from approved results.
- `auditEvents` record important changes across entities.

## 4. Score calculation
For each question:
- Correct: add question marks.
- Incorrect: subtract configured negative penalty.
- Unanswered/blank: add zero.
- Multiple-marked/uncertain OMR answer: cannot be finalized until reviewed.
- Clamp or reject impossible configurations at competition setup; do not silently invent score behavior.

Example: 10 questions × 1 mark, 7 correct, 2 wrong, 1 unanswered, penalty 0.25 per wrong:
- positive marks = 7
- penalty marks = 0.50
- final score = 6.50 / 10

Total marks are the sum of question marks, not necessarily question count × default marks if per-question marks are enabled.

## 5. Ranking and tie handling
Default ranking:
1. final score descending
2. correct count descending
3. incorrect count ascending
4. if still equal, shared rank

Competition ranking example: scores 90, 85, 85, 70 yield ranks 1, 2, 2, 4. Rank calculation should run against approved, eligible results only. Freeze ranking rules before publication.

## 6. Important implementation notes
- A unique index can fail if legacy duplicate data already exists; handle duplicate-key errors gracefully.
- MongoDB transaction availability depends on deployment topology; test transactions on the selected environment.
- Do not store uploaded images as public URLs. Store private keys/references and authorize each access.
- Avoid storing duplicate full answer keys in student-readable documents.
- Add schema migration/seed scripts for the initial admin and sample test competition.
- Define retention and deletion rules before collecting real student data.


## 7. Locked decision details (v1.1 — 2026-10-19)

### Result publication lifecycle
- Before publication: `competitions.resultStatus` is `hidden` or `preview`; result documents may be calculated/approved internally, but student APIs must not return them.
- Committee Head publishes only after reviewing the ranking preview and resolving OMR review blockers or recording an audited exclusion. On publication, set `resultStatus="published"`, `status="results_published"` as appropriate, `resultsPublishedAt`, `resultsPublishedBy`, and increment `resultsPublicationVersion`. Update eligible result records to `status="published"` and set their `publicationVersion`.
- Student queries are always filtered by both authenticated `studentId` and `status="published"`; never trust an ID supplied by the client to establish ownership.
- If results are withdrawn/re-published after a correction, record the before/after state, reason, actor, timestamp, and new publication version in `auditEvents`. Do not silently overwrite a published score.

### Dual mode without duplicate results
- `competitions.mode="both"` enables both workflows for the competition, not two scored attempts for every student.
- `registrations.examMode` is set to `online` or `omr` before the student begins. When the competition mode is only `online` or only `omr`, the registration route must match it.
- At the first online attempt start, set `examModeLockedAt`; at first accepted OMR upload, set `examModeLockedAt`. These operations should be atomic/transaction-safe to prevent a race where both routes are accepted.
- Add validation that a registration cannot have a valid online attempt and accepted OMR submission simultaneously. Admin overrides must document how prior submissions are invalidated and preserve the audit trail.

### Suggested indexes and validation
- Keep unique `{ registrationId: 1 }` on `results` for the one-final-result MVP.
- Add `{ competitionId: 1, resultStatus: 1 }` for publication-state queries if the collection schema supports the relevant competition fields.
- Validate `examMode` against competition `mode`; `examMode` may be null only before route selection/assignment.
- `publicMeritListEnabled` defaults to `false`; public merit list visibility is a separate explicit setting, while a logged-in student can see their own result after Head publication.
