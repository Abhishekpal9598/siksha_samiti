import sys
import os
import cv2
import numpy as np

def generate_fixtures(output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    # Base Canonical A4 canvas (300 DPI: 2480 x 3508)
    W, H = 2480, 3508

    def create_base_sheet():
        sheet = np.full((H, W, 3), 255, dtype=np.uint8)
        # Top title & lines
        cv2.putText(sheet, "EDUCATION COMMITTEE - EXAMINATION SHEET", (350, 400), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 4)
        cv2.line(sheet, (150, 450), (2330, 450), (0, 0, 0), 4)
        # 4 fiducial markers (26 pt ~ 108 px at 300 DPI)
        # TL: (104, 104) to (212, 212)
        cv2.rectangle(sheet, (104, 104), (212, 212), (0, 0, 0), -1)
        # TR: (2268, 104) to (2376, 212)
        cv2.rectangle(sheet, (2268, 104), (2376, 212), (0, 0, 0), -1)
        # BL: (104, 3295) to (212, 3403)
        cv2.rectangle(sheet, (104, 3295), (212, 3403), (0, 0, 0), -1)
        # BR: (2268, 3295) to (2376, 3403)
        cv2.rectangle(sheet, (2268, 3295), (2376, 3403), (0, 0, 0), -1)
        # Draw some bubbles in the grid area
        for q in range(1, 26):
            y = 600 + q * 75
            for opt_idx in range(4):
                x = 300 + opt_idx * 60
                cv2.circle(sheet, (x, y), 22, (0, 0, 0), 2)
        return sheet

    # 1. Correctly Scanned Sheet
    base = create_base_sheet()
    cv2.imwrite(os.path.join(output_dir, "correct_sheet.png"), base)

    # 2. Rotated Sheet (6 degrees)
    M_rot = cv2.getRotationMatrix2D((W // 2, H // 2), 6.0, 0.96)
    rotated = cv2.warpAffine(base, M_rot, (W, H), borderValue=(255, 255, 255))
    cv2.imwrite(os.path.join(output_dir, "rotated_sheet.png"), rotated)

    # 3. Perspective Distorted Sheet (simulating camera angle)
    src_pts = np.float32([[0, 0], [W, 0], [0, H], [W, H]])
    dst_pts = np.float32([[120, 90], [W - 80, 50], [50, H - 70], [W - 100, H - 40]])
    M_dist = cv2.getPerspectiveTransform(src_pts, dst_pts)
    distorted = cv2.warpPerspective(base, M_dist, (W, H), borderValue=(255, 255, 255))
    cv2.imwrite(os.path.join(output_dir, "distorted_sheet.png"), distorted)

    # 4. Missing Marker Sheet (BR marker removed)
    missing = create_base_sheet()
    cv2.rectangle(missing, (2260, 3290), (2385, 3410), (255, 255, 255), -1)
    cv2.imwrite(os.path.join(output_dir, "missing_marker_sheet.png"), missing)

    # 5. Damaged/Ambiguous Marker Sheet (TL marker torn / truncated to 20% area)
    damaged = create_base_sheet()
    cv2.rectangle(damaged, (104, 104), (190, 190), (255, 255, 255), -1)
    cv2.imwrite(os.path.join(output_dir, "damaged_marker_sheet.png"), damaged)

    # 6. Blurry Image
    blurry = cv2.GaussianBlur(base, (75, 75), 0)
    cv2.imwrite(os.path.join(output_dir, "blurry_sheet.png"), blurry)

    # 7. Low-Resolution Image (300 x 420)
    lowres = cv2.resize(base, (400, 560), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(output_dir, "lowres_sheet.png"), lowres)

    # 8. Very Dark Image
    dark = cv2.convertScaleAbs(base, alpha=0.15, beta=10)
    cv2.imwrite(os.path.join(output_dir, "dark_sheet.png"), dark)

    # 9. Overexposed Image
    overexposed = cv2.convertScaleAbs(base, alpha=1.0, beta=245)
    cv2.imwrite(os.path.join(output_dir, "overexposed_sheet.png"), overexposed)

    # 10. Excessive Dimension Image (> 35 Megapixels, e.g. 6200 x 6000 = 37.2 MP)
    # Just write a 6200 x 6000 jpeg with low memory cost
    huge = np.full((6000, 6200, 3), 255, dtype=np.uint8)
    cv2.imwrite(os.path.join(output_dir, "huge_sheet.png"), huge)

    print(f"Successfully generated all test fixtures in {output_dir}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "storage/test_fixtures"
    generate_fixtures(out)
