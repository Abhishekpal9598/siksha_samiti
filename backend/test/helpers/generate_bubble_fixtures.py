import sys
import os
import cv2
import numpy as np

# Add project root to python path to import omr-service modules
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
omr_service_dir = os.path.join(project_root, "omr-service")
if omr_service_dir not in sys.path:
    sys.path.insert(0, omr_service_dir)

from app.bubbles.detector import (
    get_bubble_canonical_center,
    CANONICAL_WIDTH,
    CANONICAL_HEIGHT,
    OPTIONS
)

def create_canonical_omr_canvas(total_q=50):
    canvas = np.full((CANONICAL_HEIGHT, CANONICAL_WIDTH), 255, dtype=np.uint8)
    
    # 4 fiducials
    cv2.rectangle(canvas, (104, 104), (212, 212), 0, -1)
    cv2.rectangle(canvas, (2268, 104), (2376, 212), 0, -1)
    cv2.rectangle(canvas, (104, 3295), (212, 3403), 0, -1)
    cv2.rectangle(canvas, (2268, 3295), (2376, 3403), 0, -1)

    # Draw all question bubbles (unfilled circle outline with option letter)
    for q in range(1, total_q + 1):
        for opt_idx, opt_letter in enumerate(OPTIONS):
            cx, cy = get_bubble_canonical_center(q, opt_idx, total_q)
            pt = (int(round(cx)), int(round(cy)))
            # Outline
            cv2.circle(canvas, pt, 22, 60, 2)
            # Option letter inside
            cv2.putText(canvas, opt_letter, (pt[0] - 7, pt[1] + 7), cv2.FONT_HERSHEY_SIMPLEX, 0.65, 120, 1)

    return canvas

def fill_bubble(canvas, q, opt_idx, total_q=50, darkness=25, radius=18):
    cx, cy = get_bubble_canonical_center(q, opt_idx, total_q)
    pt = (int(round(cx)), int(round(cy)))
    cv2.circle(canvas, pt, radius, int(darkness), -1)

def generate_fixtures(output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    # 1. Sheet with known single marked answers (Q1=A, Q2=B, Q3=C, Q4=D, Q5=A, rest blank)
    clean_sheet = create_canonical_omr_canvas(50)
    fill_bubble(clean_sheet, 1, 0) # Q1: A
    fill_bubble(clean_sheet, 2, 1) # Q2: B
    fill_bubble(clean_sheet, 3, 2) # Q3: C
    fill_bubble(clean_sheet, 4, 3) # Q4: D
    fill_bubble(clean_sheet, 5, 0) # Q5: A
    cv2.imwrite(os.path.join(output_dir, "bubble_clean_sheet.png"), clean_sheet)

    # 2. Sheet with multiple marked bubbles on Q1 (A and B filled)
    multi_sheet = create_canonical_omr_canvas(50)
    fill_bubble(multi_sheet, 1, 0) # Q1: A
    fill_bubble(multi_sheet, 1, 1) # Q1: B
    cv2.imwrite(os.path.join(output_dir, "bubble_multi_sheet.png"), multi_sheet)

    # 3. Sheet with uncertain answers (Q1: light mark, Q2: partially erased mark)
    uncertain_sheet = create_canonical_omr_canvas(50)
    # Q1: Light pencil mark (darkness ~150, smaller radius ~10, giving fill ratio ~0.25 - 0.35)
    cx1, cy1 = get_bubble_canonical_center(1, 0, 50)
    cv2.circle(uncertain_sheet, (int(round(cx1)), int(round(cy1))), 10, 130, -1)

    # Q2: Erased mark with graphite smudge (fill ratio ~0.25)
    cx2, cy2 = get_bubble_canonical_center(2, 1, 50)
    cv2.circle(uncertain_sheet, (int(round(cx2)), int(round(cy2))), 11, 140, -1)
    cv2.imwrite(os.path.join(output_dir, "bubble_uncertain_sheet.png"), uncertain_sheet)

    # 4. Sheet with shifted bubble marks (+2 px shift)
    shifted_sheet = create_canonical_omr_canvas(50)
    cx_s, cy_s = get_bubble_canonical_center(1, 2, 50) # Q1: C shifted by +2px
    cv2.circle(shifted_sheet, (int(round(cx_s + 2)), int(round(cy_s + 2))), 18, 25, -1)
    cv2.imwrite(os.path.join(output_dir, "bubble_shifted_sheet.png"), shifted_sheet)

    # 5. Sheet with 100 questions (fourColumn layout)
    sheet_100 = create_canonical_omr_canvas(100)
    fill_bubble(sheet_100, 1, 0, total_q=100) # Q1: A
    fill_bubble(sheet_100, 55, 2, total_q=100) # Q55: C
    fill_bubble(sheet_100, 100, 3, total_q=100) # Q100: D
    cv2.imwrite(os.path.join(output_dir, "bubble_100q_sheet.png"), sheet_100)

    print(f"Generated Phase 6.5 bubble fixtures in {output_dir}")

if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join("storage", "omr_test_fixtures")
    generate_fixtures(out_dir)
