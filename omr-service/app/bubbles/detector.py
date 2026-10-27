import cv2
import numpy as np
from typing import Dict, Tuple, List, Any

# Canonical Canvas Dimensions (300 DPI A4)
CANONICAL_WIDTH = 2480
CANONICAL_HEIGHT = 3508

# PDF coordinates from OMR_LAYOUT_SPEC:
PAGE_WIDTH_PT = 595.28
PAGE_HEIGHT_PT = 841.89

SCALE_X = CANONICAL_WIDTH / PAGE_WIDTH_PT    # ~4.166107
SCALE_Y = CANONICAL_HEIGHT / PAGE_HEIGHT_PT   # ~4.166815

# Bubble radius in points from OMR_LAYOUT_SPEC is 5.5 pt
BUBBLE_RADIUS_PT = 5.5
BUBBLE_RADIUS_PX = BUBBLE_RADIUS_PT * SCALE_X  # ~22.91 px

# Inner core sampling radius: excludes outer black border stroke
INNER_RADIUS_PX = 15.5

# Background ring sampling: annulus around bubble on clean paper
BG_INNER_PX = 28.0
BG_OUTER_PX = 36.0

# Layout offsets from OMR_LAYOUT_SPEC
GRID_START_Y_PT = 220
ROW_HEIGHT_PT = 19
OPTION_SPACING_PT = 16
QUESTIONS_PER_COL = 25
OPTIONS = ['A', 'B', 'C', 'D']

COLUMNS_TWO = [
    {"startQ": 1, "endQ": 25, "xOffset": 90},
    {"startQ": 26, "endQ": 50, "xOffset": 350}
]

COLUMNS_FOUR = [
    {"startQ": 1, "endQ": 25, "xOffset": 65},
    {"startQ": 26, "endQ": 50, "xOffset": 195},
    {"startQ": 51, "endQ": 75, "xOffset": 325},
    {"startQ": 76, "endQ": 100, "xOffset": 455}
]

def get_bubble_canonical_center(question_num: int, option_idx: int, total_questions: int) -> Tuple[float, float]:
    """
    Computes exact canonical pixel center (X, Y) for question and option (0=A, 1=B, 2=C, 3=D)
    strictly derived from OMR_LAYOUT_SPEC.
    """
    is_four_col = total_questions > 50
    col_layout = COLUMNS_FOUR if is_four_col else COLUMNS_TWO

    col_idx = (question_num - 1) // QUESTIONS_PER_COL
    if col_idx >= len(col_layout):
        col_idx = len(col_layout) - 1
    col = col_layout[col_idx]

    row_idx = (question_num - 1) % QUESTIONS_PER_COL

    # In points
    x_pt = col["xOffset"] + 26 + (option_idx * OPTION_SPACING_PT)
    y_pt = GRID_START_Y_PT + (row_idx * ROW_HEIGHT_PT)

    # In canonical pixels
    x_px = x_pt * SCALE_X
    y_px = y_pt * SCALE_Y

    return x_px, y_px

def measure_bubble_fill(
    gray_image: np.ndarray,
    center_x: float,
    center_y: float
) -> Dict[str, Any]:
    """
    Extracts the inner core of a bubble and evaluates its fill ratio,
    luminance density, and darkness relative to surrounding paper background.
    """
    H, W = gray_image.shape[:2]
    cx = int(round(center_x))
    cy = int(round(center_y))

    # Bounding window around bubble
    pad = int(round(BG_OUTER_PX + 4))
    x1, x2 = max(0, cx - pad), min(W, cx + pad)
    y1, y2 = max(0, cy - pad), min(H, cy + pad)

    if x2 - x1 < pad or y2 - y1 < pad:
        return {
            "fillScore": 0.0,
            "fillRatio": 0.0,
            "meanIntensity": 255.0,
            "bgIntensity": 255.0,
            "isMarked": False
        }

    roi = gray_image[y1:y2, x1:x2]
    roi_cx = cx - x1
    roi_cy = cy - y1

    # 1. Inner Core Mask
    inner_mask = np.zeros(roi.shape, dtype=np.uint8)
    cv2.circle(inner_mask, (roi_cx, roi_cy), int(round(INNER_RADIUS_PX)), 255, -1)

    # 2. Background Ring Mask (annulus)
    bg_mask = np.zeros(roi.shape, dtype=np.uint8)
    cv2.circle(bg_mask, (roi_cx, roi_cy), int(round(BG_OUTER_PX)), 255, -1)
    cv2.circle(bg_mask, (roi_cx, roi_cy), int(round(BG_INNER_PX)), 0, -1)

    inner_pixels = np.count_nonzero(inner_mask == 255)
    bg_pixels = np.count_nonzero(bg_mask == 255)

    if inner_pixels == 0:
        return {"fillScore": 0.0, "fillRatio": 0.0, "meanIntensity": 255.0, "bgIntensity": 255.0, "isMarked": False}

    mean_inner = cv2.mean(roi, mask=inner_mask)[0]
    mean_bg = cv2.mean(roi, mask=bg_mask)[0] if bg_pixels > 0 else 250.0

    # Darkness threshold relative to local paper background
    # A pixel with intensity significantly darker than surrounding paper is marked
    dark_threshold = max(50.0, mean_bg - 55.0)

    # Count dark pixels inside inner core
    dark_count = np.count_nonzero((roi <= dark_threshold) & (inner_mask == 255))
    fill_ratio = dark_count / float(inner_pixels)

    # Relative luminance density (0.0=white, 1.0=black)
    density = max(0.0, min(1.0, (mean_bg - mean_inner) / max(1.0, mean_bg - 30.0)))

    # Combined Fill Score (0.0 to 1.0)
    fill_score = (0.70 * fill_ratio) + (0.30 * density)

    return {
        "fillScore": round(float(fill_score), 4),
        "fillRatio": round(float(fill_ratio), 4),
        "meanIntensity": round(float(mean_inner), 2),
        "bgIntensity": round(float(mean_bg), 2),
        "isMarked": bool(fill_score >= 0.45)
    }
