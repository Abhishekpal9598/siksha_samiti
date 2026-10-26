# Phase 6.2 OMR Sheet Physical Layout & Coordinate Specification

**Layout Version:** `LAYOUT_A4_V1`  
**Paper Format:** Standard ISO A4 Portrait ($210 \times 297$ mm)  
**PDF Coordinates:** 72 points per inch ($595.28 \times 841.89$ pt)  
**OpenCV Canonical Canvas (300 DPI):** $2480 \times 3508$ pixels ($1 \text{ pt} \approx 4.166 \text{ px}$)  

---

## 1. Corner Fiducial Alignment Markers

Four solid black squares are printed exactly 25 pt (~8.8 mm) from the page borders to guide OpenCV perspective transform and homography rectification.

| Marker Position | PDF Coordinates $(X, Y)$ pt | Size $(W \times H)$ pt | Canonical 300 DPI $(X, Y)$ px |
|---|---|---|---|
| **Top-Left (TL)** | $(25.00, 25.00)$ | $26 \times 26$ pt | $(104, 104)$ px |
| **Top-Right (TR)** | $(544.28, 25.00)$ | $26 \times 26$ pt | $(2268, 104)$ px |
| **Bottom-Left (BL)** | $(25.00, 790.89)$ | $26 \times 26$ pt | $(104, 3295)$ px |
| **Bottom-Right (BR)** | $(544.28, 790.89)$ | $26 \times 26$ pt | $(2268, 3295)$ px |

### OpenCV Homography Contract:
- `cv2.findContours` locates 4 external solid contours with aspect ratio $0.85 \le W/H \le 1.15$.
- `cv2.getPerspectiveTransform` maps detected quad vertices to canonical coordinates $(0, 0)$, $(2480, 0)$, $(0, 3508)$, $(2480, 3508)$.

---

## 2. Header & Identification Zone ($Y: 48 \dots 205$ pt)

### 2.1 Title Block ($Y: 48 \dots 78$ pt)
- Competition Title (12 pt Bold, Centered).
- Subtitle: Category, Duration, Total Marks, and Layout Identifier (`LAYOUT_A4_V1`).
- Solid black horizontal dividing line at $Y = 78$ pt from $X = 60$ to $X = 535$ pt.

### 2.2 Generic Sheet: Roll Number Grid ($X: 60 \dots 290$, $Y: 85 \dots 203$ pt)
- 6 digit columns ($D_1 \dots D_6$).
- Top input boxes: 6 rectangular digit writing boxes ($16 \times 14$ pt) at $Y = 100$ pt.
- Bubble matrix: 10 rows (digits $0 \dots 9$) spaced vertically by 7.5 pt.
- Bubble diameter: 6.4 pt (radius 3.2 pt).

### 2.3 Personalized Sheet: Secure QR Code ($X: 410 \dots 535$, $Y: 85 \dots 203$ pt)
- Embedded QR Code Box: $125 \times 118$ pt.
- QR Code Image: $80 \times 80$ pt, placed at $(432, 102)$ pt.
- **Payload Schema (Zero PII):**
  ```json
  {
    "v": 1,
    "cid": "<competitionId>",
    "rid": "<registrationId>",
    "tok": "<registration.omrSheetToken>",
    "sig": "<HMAC-SHA256 signature>"
  }
  ```
- **Cryptographic Security:**
  - Signature computed as `HMAC-SHA256(secret, cid + ":" + rid + ":" + tok).substring(0, 16)`.
  - Rejection invariant: Tampered, guessed, or expired signatures are rejected immediately.

---

## 3. Question Answer Bubble Grid ($Y: 220 \dots 700$ pt)

### 3.1 Bubble Specifications
- **Circle Radius:** $R = 5.5$ pt (~$1.94$ mm, diameter $11$ pt / $3.88$ mm).
- **Stroke Width:** $0.8$ pt solid black (`#000000`).
- **Option Spacing:** Horizontal distance between option centers $= 16$ pt.
- **Row Pitch:** Vertical distance between question rows $= 19$ pt.
- **Options per Question:** 4 options labeled `A`, `B`, `C`, `D`.

### 3.2 Two-Column Layout ($\le 50$ Questions)
Used for standard tests up to 50 questions:
- **Column 1 (Q1 to Q25):** Left anchor $X = 90$ pt.
  - Option A Center: $X = 116$ pt
  - Option B Center: $X = 132$ pt
  - Option C Center: $X = 148$ pt
  - Option D Center: $X = 164$ pt
- **Column 2 (Q26 to Q50):** Left anchor $X = 350$ pt.
  - Option A Center: $X = 376$ pt
  - Option B Center: $X = 392$ pt
  - Option C Center: $X = 408$ pt
  - Option D Center: $X = 424$ pt

### 3.3 Four-Column Layout ($51 \dots 100$ Questions)
Used for comprehensive exams up to 100 questions:
- **Column 1 (Q1 to Q25):** Anchor $X = 65$ pt.
- **Column 2 (Q26 to Q50):** Anchor $X = 195$ pt.
- **Column 3 (Q51 to Q75):** Anchor $X = 325$ pt.
- **Column 4 (Q76 to Q100):** Anchor $X = 455$ pt.

---

## 4. Footer & Signature Verification Zone ($Y: 735 \dots 790$ pt)

- **Candidate Signature Box:** $(60, 735)$ pt, dimensions $210 \times 38$ pt.
- **Invigilator Signature Box:** $(325, 735)$ pt, dimensions $210 \times 38$ pt.
- **Anti-Counterfeiting Watermark:** Centered footer at $Y = 779$ pt:
  `Official Examination OMR Answer Sheet • Education Committee Portal • LAYOUT_A4_V1 • Do not fold, tear or soil`

---

## 5. Machine Vision Readability Assurance

1. **Printer Margins:** All critical visual data (fiducials, QR code, bubble grid) is bounded within a minimum 25 pt (8.8 mm) border, fully avoiding printer edge clipping on common laser/inkjet hardware.
2. **High-Contrast Monochrome:** All printable elements use pure black (`#000000`) on white, providing maximum contrast for binarization and thresholding algorithms in OpenCV.
3. **Reproducible Vector Output:** PDF generation uses native vector paths via `pdfkit`, producing crisp lines regardless of user printer DPI settings.
