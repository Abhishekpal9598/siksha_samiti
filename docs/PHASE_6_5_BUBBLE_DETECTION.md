# Phase 6.5: OMR Bubble Detection and Answer Extraction Specification

## 1. Executive Summary

Phase 6.5 implements computer vision-based answer bubble detection, radiometric fill measurement, and deterministic multi-class response classification on physical OMR answer sheets. Operating directly upon the rectified canonical 300 DPI canvas ($2480 \times 3508$ pixels) produced by Phase 6.4, this pipeline extracts student responses across two-column ($\le 50$ questions) and four-column ($51$–$100$ questions) examination sheets with high geometric and photometric accuracy.

Strict data integrity and architectural boundaries are enforced:
* **Immutable Machine Detections**: All automated extractions are persisted in `submission.rawDetections`.
* **Non-Overwriting Guarantee**: Machine detection or reprocessing **never** modifies or overwrites manual reviewer inputs stored in `submission.confirmedAnswers`.
* **Zero Premature Scoring**: Phase 6.5 does not calculate marks, does not apply negative marking, and does not compute merit ranks. Scoring remains strictly decoupled in the Phase 5 central scoring engine.
* **Security & Isolation**: Scans and detections are inaccessible to students and protected behind role-based access control (`admin` / `committee_head`).

---

## 2. Geometric & Photometric Detection Model

### 2.1 Canonical Coordinate System

Bubble center coordinates $(x_{px}, y_{px})$ are mathematically derived from `OMR_LAYOUT_SPEC` (defined in `backend/src/services/omrPdfGenerator.service.js`) and scaled to the canonical 300 DPI dimensions:

$$\text{Scale}_x = \frac{2480 \text{ px}}{595.28 \text{ pt}} \approx 4.166107 \text{ px/pt}$$
$$\text{Scale}_y = \frac{3508 \text{ px}}{841.89 \text{ pt}} \approx 4.166815 \text{ px/pt}$$

For question $q \in [1, N]$ and option index $o \in \{0, 1, 2, 3\}$ corresponding to $\{\text{A, B, C, D}\}$:

$$\text{col}_{\text{idx}} = \left\lfloor \frac{q - 1}{25} \right\rfloor, \quad \text{row}_{\text{idx}} = (q - 1) \pmod{25}$$
$$x_{\text{pt}} = \text{colOffset}[\text{col}_{\text{idx}}] + 26 + (o \times 16)$$
$$y_{\text{pt}} = 220 + (\text{row}_{\text{idx}} \times 19)$$
$$x_{\text{px}} = x_{\text{pt}} \times \text{Scale}_x, \quad y_{\text{px}} = y_{\text{pt}} \times \text{Scale}_y$$

#### Layout Mapping
* **Two-Column Layout ($\le 50$ Questions)**:
  * Column 0 (Q1–Q25): $x_{\text{offset}} = 90 \text{ pt}$
  * Column 1 (Q26–Q50): $x_{\text{offset}} = 350 \text{ pt}$
* **Four-Column Layout ($51$–$100$ Questions)**:
  * Column 0 (Q1–Q25): $x_{\text{offset}} = 65 \text{ pt}$
  * Column 1 (Q26–Q50): $x_{\text{offset}} = 195 \text{ pt}$
  * Column 2 (Q51–Q75): $x_{\text{offset}} = 325 \text{ pt}$
  * Column 3 (Q76–Q100): $x_{\text{offset}} = 455 \text{ pt}$

---

### 2.2 Annular Extraction & Border Isolation

To prevent outer circular strokes ($R \approx 22.9 \text{ px}$) or printed option letter glyphs from creating false positive filled detections:
1. **Inner Core Mask ($R_{\text{inner}} = 15.5 \text{ px}$)**: Strictly isolates the interior candidate region, discarding the outer boundary ring.
2. **Background Annulus ($R \in [28, 36] \text{ px}$)**: Samples untouched paper immediately surrounding the bubble to determine local baseline luminance ($\mu_{\text{bg}}$), dynamically neutralizing lighting gradients, scanner shadows, and paper tint variations.

```
       [ Background Ring: R = 28..36 px ]
    ┌────────────────────────────────────────┐
    │       ( Bubble Stroke: R = 22.9 px )   │
    │     ┌────────────────────────────┐     │
    │     │  [ Inner Core: R = 15.5 px]│     │
    │     │      Candidate Mark Area   │     │
    │     └────────────────────────────┘     │
    └────────────────────────────────────────┘
```

---

### 2.3 Radiometric Measurement Formula

For each bubble, the adaptive darkness threshold is computed as:
$$T_{\text{dark}} = \max(50.0, \, \mu_{\text{bg}} - 55.0)$$

Two normalized metrics are extracted:
1. **Pixel Darkness Fill Ratio**:
   $$\text{fillRatio} = \frac{\sum_{p \in \text{Core}} \mathbb{I}(I_p \le T_{\text{dark}})}{|\text{Core}|}$$
2. **Relative Luminance Density**:
   $$\text{density} = \text{clip}\left(\frac{\mu_{\text{bg}} - \mu_{\text{core}}}{\max(1.0, \, \mu_{\text{bg}} - 30.0)}, 0.0, 1.0\right)$$

The **Combined Fill Score** is evaluated:
$$S_{\text{fill}} = 0.70 \times \text{fillRatio} + 0.30 \times \text{density}$$

---

## 3. Answer Classification Matrix & Thresholds

Every question response is categorized into one of four mutually exclusive classifications based on the sorted fill scores $s_1 \ge s_2 \ge s_3 \ge s_4$:

| Classification | Condition | Detected Option | Flagged for Review? |
| :--- | :--- | :--- | :--- |
| **`SINGLE_MARKED`** | $s_1 \ge 0.45 \land s_2 \le 0.25$ | Top option ($\text{opt}_1$) | No (`needsReview: false`) |
| **`BLANK`** | $s_1 \le 0.25$ | `null` | No (`needsReview: false`) |
| **`MULTIPLE_MARKED`** | $s_1 \ge 0.45 \land s_2 \ge 0.45$ | `null` | **Yes** (`needsReview: true`) |
| **`UNCERTAIN`** | $0.25 < s_1 < 0.45$ OR $(s_1 \ge 0.45 \land s_1 - s_2 < 0.18)$ | `null` | **Yes** (`needsReview: true`) |

*Note on Threshold Selection*: Blank bubble templates contain printed option letter glyphs (e.g., 'B' and 'D') whose typography occupies $0.19$–$0.23$ fill score. Setting `BLANK_THRESHOLD = 0.25` ensures pristine templates remain recognized as `BLANK` while faint or partially erased pencil marks ($> 0.25$) are reliably flagged for human verification.

### Confidence Scoring
* **Clean Single Mark**:
  $$\text{Confidence} = \min(1.0, \, 0.80 + (s_1 - s_2) \times 0.25) \ge 0.85$$
* **Clean Blank**:
  $$\text{Confidence} = \max\left(0.80, \, 1.0 - \frac{s_1}{0.25} \times 0.20\right) \ge 0.80$$
* **Multiple Marked**:
  $$\text{Confidence} = \min(1.0, \, 0.60 + \min(s_1, s_2) \times 0.40)$$
* **Uncertain**:
  $$\text{Confidence} = \text{clip}((s_1 - s_2) + 0.10, \, 0.20, \, 0.68) < 0.70$$

---

## 4. API Endpoints & Request/Response Contracts

### 4.1 Admin Bubble Detection Endpoint

* **Route**: `POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/detect-bubbles`
* **Authorization**: Admin or Committee Head role required (`authenticate`, `requireAdminOrHead`)
* **Pre-condition**: Submission must possess a valid, aligned OMR scan file (`alignedStoragePath`). Returns HTTP 400 `ALIGNED_IMAGE_REQUIRED` if unaligned.

#### Response Payload Sample (HTTP 200 OK)
```json
{
  "success": true,
  "data": {
    "id": "67b931fae81b37651a9e8f12",
    "competitionId": "67b931fae81b37651a9e8f00",
    "status": "PROCESSING",
    "rawDetections": {
      "detectedAt": "2026-10-27T13:30:12.145Z",
      "totalQuestions": 50,
      "layoutType": "twoColumn",
      "summary": {
        "total": 50,
        "singleMarked": 42,
        "blank": 8,
        "multipleMarked": 0,
        "uncertain": 0,
        "overallConfidence": 0.912,
        "needsReview": false,
        "reviewReasons": []
      },
      "answers": [
        {
          "questionNumber": 1,
          "classification": "SINGLE_MARKED",
          "detectedOption": "A",
          "confidence": 0.965,
          "markedOptions": ["A"],
          "needsReview": false,
          "reviewReason": null,
          "options": {
            "A": { "fillScore": 0.8421, "fillRatio": 0.865, "meanIntensity": 32.4, "bgIntensity": 248.6, "isMarked": true },
            "B": { "fillScore": 0.0812, "fillRatio": 0.041, "meanIntensity": 235.1, "bgIntensity": 249.0, "isMarked": false },
            "C": { "fillScore": 0.0754, "fillRatio": 0.032, "meanIntensity": 238.0, "bgIntensity": 248.8, "isMarked": false },
            "D": { "fillScore": 0.1241, "fillRatio": 0.065, "meanIntensity": 228.4, "bgIntensity": 248.5, "isMarked": false }
          }
        }
      ]
    },
    "confirmedAnswers": null,
    "auditTrail": [
      {
        "action": "OMR_BUBBLE_DETECTION_PROCESSED",
        "timestamp": "2026-10-27T13:30:12.146Z",
        "details": {
          "totalQuestions": 50,
          "singleMarked": 42,
          "blank": 8,
          "multipleMarked": 0,
          "uncertain": 0,
          "overallConfidence": 0.912,
          "needsReview": false,
          "preservedExistingConfirmedAnswers": false
        }
      }
    ]
  }
}
```

---

## 5. Security & Verification Audit Trail

1. **Role-Based Protection**: Student accounts attempting to invoke `/detect-bubbles` or view submission detections receive HTTP 403 Forbidden.
2. **Filesystem Path Concealment**: `storagePath` and `alignedStoragePath` are permanently deleted in Mongoose document serialization (`toJSON`), eliminating server path leakage.
3. **Audit Immutability**: Every execution of the bubble detection pipeline appends an `OMR_BUBBLE_DETECTION_PROCESSED` event detailing user ID, timestamp, counts, confidence metrics, and state preservation.

---

## 6. Verification & Test Evidence

| Test Suite | Tests Run | Result | Duration | Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 6.5 (`phase6_5_bubbles.test.js`)** | 15 | **PASS (15/15)** | 6.7s | Bubble detection, multi-marks, uncertain, four-column, non-overwrite, PDF integration, security |
| **Phase 6.4 (`phase6_4_alignment.test.js`)** | 19 | **PASS (19/19)** | 23.0s | Marker detection, rotation, skew, distortion, blur, luminance, PDF alignment, security |
| **Phase 6.3 (`phase6_3_upload.test.js`)** | 24 | **PASS (24/24)** | 2.5s | File ingestion, magic bytes, SHA-256 deduplication, atomic locking, concurrent race conditions |
| **Phase 6.2 (`phase6_2_omr_pdf.test.js`)** | 13 | **PASS (13/13)** | 1.6s | Generic PDF, personalized PDF with QR, token verification |
| **Phase 6.1 (`phase6_1_foundation.test.js`)** | 9 | **PASS (9/9)** | 3.1s | Microservice health, OpenCV capabilities, storage readiness |
| **Phase 5.1 (`phase5_1_audit.test.js`)** | 17 | **PASS (17/17)** | 1.8s | Scoring engine, approval workflows, merit lists |
| **Frontend UI Tests (`ui.test.js`)** | 18 | **PASS (18/18)** | 0.02s | Hindi/English parity, Phase 2–5 localization |
| **Frontend Production Build (`vite build`)** | 39 modules | **SUCCESS (0 errors)**| 1.35s | Production bundle compiled and minified |
