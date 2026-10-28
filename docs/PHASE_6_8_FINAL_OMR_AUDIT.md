# Phase 6.8 Final OMR Security, Accuracy, Data Integrity and End-to-End Production Readiness Audit Report

**Date**: October 28, 2026  
**Status**: APPROVED & VERIFIED  
**Audited Git Checkpoints**: `checkpoint-phase-6-7` (`a325cc4`) -> `checkpoint-phase-6-8`  
**System Architecture**: React (Vite) + Node.js / Express + MongoDB / Mongoose + Python FastAPI / OpenCV  

---

## 1. Executive Summary

Phase 6.8 is the final audit, defect elimination, and end-to-end production readiness validation phase for the hybrid Examination & OMR Evaluation Portal.

The comprehensive audit covered:
1. **Critical Scoring Data Integrity Audit**: Elimination of raw detection fallbacks in scoring, enforcement of explicit answer confirmation, and stale score invalidation on sheet reopening.
2. **Complete OMR Lifecycle Audit**: 13-stage end-to-end pipeline verification (PDF generation, upload, alignment, bubble extraction, manual review, evaluation, approval, publication, scorecard streaming).
3. **Security & Access Control Audit**: Static route access isolation, authenticated streaming, directory traversal prevention, role-based boundary enforcement (Committee Head vs Standard Admin vs Student).
4. **Concurrency & Race Condition Audit**: Simultaneous file uploads, concurrent reviewer conflicts (optimistic concurrency control), simultaneous evaluation calls, and database index uniqueness.
5. **Computer Vision Accuracy Audit**: Fiducial marker tolerance, perspective rectification, illumination resistance, light pencil/eraser mark ambiguity detection, and bubble fill measurement.
6. **Full Regression Matrix Verification**: Clean test runs across Phases 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, and 6.8, alongside frontend localization tests and production build.

---

## 2. Critical Scoring Data Integrity Audit & Remediation

### 2.1 Investigation of the Raw Detection Fallback
- **Audit Target**: `backend/src/services/scoring.service.js`
- **Finding**: A latent fallback existed where unflagged clean bubbles could fall back to `sub.rawDetections.answers` when `sub.confirmedAnswers.answers` was incomplete.
- **Risk**: Machine detections could potentially influence candidate scores without explicit human verification.
- **Remediation**:
  - The fallback to `rawDetections` was completely eliminated.
  - The scoring engine now asserts that every single question on an OMR submission has an explicit entry in `confirmedAnswers.answers` with `isConfirmed: true`.
  - If any question is missing confirmation, the evaluation transaction is rejected immediately with `HTTP 400 UNCONFIRMED_ANSWER_REMAINS`.
  - Machine detection data (`rawDetections`) remains 100% immutable and is used purely for visual reference in the review portal.

### 2.2 Stale Scoring on Reopened Submissions
- **Audit Target**: `backend/src/controllers/omr.controller.js` (`reopenOmrVerification`)
- **Finding**: Reopening a previously verified OMR sheet for correction allowed prior `Result` records to persist until the next evaluation, risking publication of stale scores.
- **Remediation**:
  - Reopening a submission is strictly prohibited (`HTTP 400 CANNOT_REOPEN_PUBLISHED`) if the competition's `resultStatus === 'PUBLISHED'`. The Committee Head must explicitly unpublish results first.
  - Reopening a verified submission now immediately deletes associated `Result` records (`Result.deleteMany({ competitionId, studentId })`).
  - If competition results were previously `APPROVED`, reopening demotes the competition back to `EVALUATED`, requiring a new review cycle and re-approval.
  - The evaluation service now runs `Result.deleteMany({ competitionId, studentId: { $nin: evaluatedStudentIds } })` to clean up any obsolete results during re-evaluation.

---

## 3. End-to-End OMR Lifecycle Audit (13 Stages)

| Stage | Step Description | Verified Behavior | Test Assertion |
|---|---|---|---|
| 1 | **Template Generation** | Generates standard A4 PDF (210x297mm) with corner fiducial black squares and high-contrast HMAC-signed QR token. | `phase6_2_omr_pdf.test.js` |
| 2 | **Secure Upload** | Ingests PDF/JPEG/PNG with magic byte validation (FF D8 FF, 89 50 4E 47, %PDF), 10MB per-file limit, SHA-256 deduplication. | `phase6_3_upload.test.js` |
| 3 | **Token Verification** | Decodes QR token, verifies SHA-256 HMAC signature using `OMR_TOKEN_SECRET`, matches competition and candidate ID. | `phase6_3_upload.test.js` |
| 4 | **Atomic Mode Lock** | Enforces mutual exclusion: `ONLINE_MCQ` candidates cannot upload OMR scans; `OMR` candidates cannot start online attempts. | `phase6_3_upload.test.js` |
| 5 | **Storage Security** | Scans stored in private directory (`storage/omr/private/`). No static file routing. Streaming requires admin credentials. | `phase6_8_audit.test.js` |
| 6 | **Fiducial Alignment** | OpenCV locates 4 corner markers, validates geometric rectangle proportions, and applies 4-point perspective warp. | `phase6_4_alignment.test.js` |
| 7 | **Quality Gates** | Evaluates Laplacian variance (blur), minimum dimensions (300 DPI), and luminance distribution (exposure). | `phase6_4_alignment.test.js` |
| 8 | **Bubble Detection** | Measures pixel fill ratio against Otsu-thresholded inverted bubbles; classifies `SINGLE_MARKED`, `BLANK`, `MULTIPLE_MARKED`, `UNCERTAIN`. | `phase6_5_bubbles.test.js` |
| 9 | **Admin Review UI** | Admin reviews detections side-by-side with scan image; highlights ambiguous answers; requires descriptive correction reasons. | `phase6_6_verification.test.js` |
| 10 | **Verification Finalization** | All questions must be confirmed before status advances to `VERIFIED`. Locks document against further edits. | `phase6_6_verification.test.js` |
| 11 | **Unified Scoring** | Evaluates verified OMR submissions alongside online attempts using canonical question keys and negative marking rules. | `phase6_7_scoring_integration.test.js` |
| 12 | **Two-Tier Governance** | Results enter `EVALUATED`. Only Committee Head can approve (`APPROVED`) and publish (`PUBLISHED`). | `phase6_7_scoring_integration.test.js` |
| 13 | **Student Scorecard** | Once published, student accesses scorecard with marks breakdown and rank. Private scan paths and answer keys are omitted. | `phase6_8_audit.test.js` |

---

## 4. Security & Access Control Audit

1. **Role Separation**:
   - `STUDENT`: Forbidden from all OMR administration endpoints, health checks, scan downloads, and review actions (`HTTP 403 Forbidden`).
   - `ADMIN`: Authorized to upload scans, run alignment/bubble detection, download private scans, and confirm/correct answers. Strictly blocked from approving results, publishing results, or toggling the public merit list (`HTTP 403 Forbidden`).
   - `COMMITTEE_HEAD`: Exclusive authority to approve results, publish results, unpublish results, and enable the public merit list.
2. **File Isolation & Traversal Protection**:
   - `resolveSafeStoragePath` prevents directory traversal attacks (`../`, `%2e%2e`, null bytes).
   - Zero static middleware serves the `storage/omr/private` directory.
   - Private scans and aligned images are delivered exclusively through streaming endpoints with strict authentication, authorization, and `Cache-Control: private, no-store, no-cache, must-revalidate` headers.
3. **Data Leakage Safeguards**:
   - OmrSubmission JSON schema transform strips `storagePath` and `alignedStoragePath` before serialization.
   - QR code payloads contain zero student PII (contains only competition ID, registration ID, roll number, and HMAC).
   - Student scorecard API omits server paths and hidden answer keys.

---

## 5. Concurrency & Integrity Audit

1. **Simultaneous Mode Locking**:
   - Integration tests utilizing `Promise.all` prove that concurrent online exam start and OMR upload requests resolve deterministically without double-mode activation.
2. **Reviewer Optimistic Concurrency Control**:
   - `updateOmrQuestionAnswer` and `finalizeOmrVerification` enforce atomic conditional updates (`findOneAndUpdate` matching `confirmedAnswers.version: expectedVersion`).
   - Simultaneous updates with the same version reject the losing request with `HTTP 409 CONCURRENT_REVIEW_CONFLICT`.
3. **Evaluation Atomicity**:
   - Simultaneous evaluation requests use atomic bulk upserts and partial unique indexing (`attemptId` and `omrSubmissionId` scoped to competition), preventing duplicate result records.

---

## 6. Computer Vision Accuracy Metrics

Tested on standard Phase 6.2 OMR templates:

| Condition / Variation | Detection Outcome | Confidence | Handling Mechanism |
|---|---|---|---|
| **Clean Single Mark** | Correctly identified option (`A`, `B`, `C`, or `D`) | ≥ 88% | Auto-accepted if reviewer chooses "Confirm remaining clean" |
| **Clean Blank Bubble** | Classified as `BLANK` | ≥ 92% | Zero marks awarded; no negative deduction |
| **Multiple Marks** | Classified as `MULTIPLE_MARKED` | < 50% | Flagged for manual admin review |
| **Light Pencil / Erased Mark** | Classified as `UNCERTAIN` | < 50% | Flagged for manual admin review |
| **Bubble Offset (+2px)** | Correct option recognized | ≥ 85% | Handled by bounding box tolerance margin |
| **Rotated Sheet (up to 15°)** | Corner fiducials detected; rectified | High | Perspective warp transforms canonical dimensions |
| **Blurry Scan (Var < 80)** | Flagged `isBlurry: true` | N/A | Submission marked `NEEDS_REVIEW` |
| **Missing Corner Marker** | Detection failed | N/A | Submission marked `NEEDS_REVIEW` with missing corner label |
| **Excessive Size (> 35 MP)** | Ingestion rejected | N/A | Protects Python service from memory exhaustion |

---

## 7. Full Regression Testing Results

All test suites were executed and verified against active database and microservice instances:

| Test Suite File | Component / Scope | Tests Passed | Status |
|---|---|---|---|
| `backend/test/phase6_8_audit.test.js` | Phase 6.8 Audit & Concurrency | 9 / 9 | **PASS** |
| `backend/test/phase6_7_scoring_integration.test.js` | Phase 6.7 Scoring & Governance | 17 / 17 | **PASS** |
| `backend/test/phase6_6_verification.test.js` | Phase 6.6 Admin Answer Verification | 18 / 18 | **PASS** |
| `backend/test/phase6_5_bubbles.test.js` | Phase 6.5 Bubble Detection & Vision | 14 / 14 | **PASS** |
| `backend/test/phase6_4_alignment.test.js` | Phase 6.4 Fiducial & Alignment | 19 / 19 | **PASS** |
| `backend/test/phase6_3_upload.test.js` | Phase 6.3 Secure Ingestion & Mode Lock | 24 / 24 | **PASS** |
| `backend/test/phase6_2_omr_pdf.test.js` | Phase 6.2 Printable OMR PDF & Tokens | 13 / 13 | **PASS** |
| `backend/test/phase6_1_foundation.test.js` | Phase 6.1 OMR Service Foundation | 9 / 9 | **PASS** |
| `backend/test/phase5_1_audit.test.js` | Phase 5.1 Central Scoring Integrity | 17 / 17 | **PASS** |
| `frontend/test/ui.test.js` | Frontend English/Hindi Localization | 18 / 18 | **PASS** |
| `frontend` Vite Build | Production Asset Compilation | 40 modules | **SUCCESS (0 errors)** |

**Total Backend Automated Tests**: **140 passing / 0 failing**  
**Total Frontend Automated Tests**: **18 passing / 0 failing**  
**Overall Test Suite Status**: **158 / 158 PASS (100% SUCCESS)**  

---

## 8. Production Readiness Decision

### Determination: **PRODUCTION READY**
The examination system and OMR evaluation subsystem satisfy all security boundaries, role governance rules, data integrity constraints, and computer vision reliability criteria.

No further modifications are required. The codebase is locked at checkpoint `checkpoint-phase-6-8`.
