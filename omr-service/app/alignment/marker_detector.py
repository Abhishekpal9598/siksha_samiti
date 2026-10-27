import cv2
import numpy as np
import math
from typing import Dict, List, Optional, Tuple, Any

class MarkerDetectionResult:
    def __init__(
        self,
        success: bool,
        markers: Optional[Dict[str, Tuple[float, float]]] = None,
        marker_details: Optional[Dict[str, Any]] = None,
        confidence: float = 0.0,
        skew_angle: float = 0.0,
        error: Optional[str] = None,
        missing_markers: Optional[List[str]] = None
    ):
        self.success = success
        self.markers = markers or {}
        self.marker_details = marker_details or {}
        self.confidence = confidence
        self.skew_angle = skew_angle
        self.error = error
        self.missing_markers = missing_markers or []

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "confidence": round(self.confidence, 3),
            "skewAngleDegrees": round(self.skew_angle, 2),
            "error": self.error,
            "missingMarkers": self.missing_markers,
            "markers": {
                k: {"x": round(v[0], 2), "y": round(v[1], 2), "found": True}
                for k, v in self.markers.items()
            } if self.markers else {}
        }

def detect_fiducial_markers(image: np.ndarray) -> MarkerDetectionResult:
    """
    Detects the 4 solid black corner fiducial markers defined by LAYOUT_A4_V1.
    Performs multi-stage contour inspection, solidity scoring, quadrant search,
    and quadrilateral geometry validation.
    """
    if image is None or not isinstance(image, np.ndarray):
        return MarkerDetectionResult(success=False, error="INVALID_IMAGE_ARRAY")

    height, width = image.shape[:2]
    total_area = height * width

    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Blur slightly to eliminate scan noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # 1. Multi-threshold search (Otsu & Adaptive) for robust detection under shadows
    threshold_methods = [
        cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1],
        cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    ]

    all_candidates = []

    for thresh in threshold_methods:
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for c in contours:
            area = cv2.contourArea(c)
            # Fiducial square is ~0.13% of page area. Allow 0.015% to 1.8%
            if area < total_area * 0.00015 or area > total_area * 0.02:
                continue

            x, y, w, h = cv2.boundingRect(c)
            if w <= 4 or h <= 4:
                continue

            aspect = float(w) / float(h)
            if aspect < 0.60 or aspect > 1.65:
                continue

            rect_area = w * h
            solidity = area / float(rect_area) if rect_area > 0 else 0
            if solidity < 0.65:
                continue

            # Compute center of mass
            M = cv2.moments(c)
            if M["m00"] > 0:
                cx = M["m10"] / M["m00"]
                cy = M["m01"] / M["m00"]
            else:
                cx = x + w / 2.0
                cy = y + h / 2.0

            # Verify that candidate is solid black inside (not a white box with black border)
            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.drawContours(mask, [c], -1, 255, -1)
            mean_val = cv2.mean(gray, mask=mask)[0]
            # Marker must be dark
            if mean_val > 150:
                continue

            # Fiducial candidate quality score
            aspect_diff = abs(1.0 - aspect)
            score = solidity * 100.0 - (aspect_diff * 40.0) - (mean_val / 4.0)

            all_candidates.append({
                "cx": cx,
                "cy": cy,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "area": area,
                "solidity": solidity,
                "score": score
            })

    if not all_candidates:
        return MarkerDetectionResult(
            success=False,
            error="NO_CANDIDATES_FOUND",
            missing_markers=["topLeft", "topRight", "bottomLeft", "bottomRight"]
        )

    # 2. Assign best candidate per quadrant
    # Corners are typically in the outer 40% margins
    quadrants = {
        "topLeft": {"candidates": [], "target_x": 0, "target_y": 0},
        "topRight": {"candidates": [], "target_x": width, "target_y": 0},
        "bottomLeft": {"candidates": [], "target_x": 0, "target_y": height},
        "bottomRight": {"candidates": [], "target_x": width, "target_y": height}
    }

    margin_x = width * 0.42
    margin_y = height * 0.42

    for cand in all_candidates:
        cx, cy = cand["cx"], cand["cy"]

        if cx < margin_x and cy < margin_y:
            quadrants["topLeft"]["candidates"].append(cand)
        elif cx > width - margin_x and cy < margin_y:
            quadrants["topRight"]["candidates"].append(cand)
        elif cx < margin_x and cy > height - margin_y:
            quadrants["bottomLeft"]["candidates"].append(cand)
        elif cx > width - margin_x and cy > height - margin_y:
            quadrants["bottomRight"]["candidates"].append(cand)

    detected_markers = {}
    missing = []

    for name, quad in quadrants.items():
        cands = quad["candidates"]
        if not cands:
            missing.append(name)
            continue

        # Sort candidates by distance to target page corner and candidate score
        def corner_rank(c):
            dist_sq = (c["cx"] - quad["target_x"])**2 + (c["cy"] - quad["target_y"])**2
            return dist_sq - (c["score"] * 100.0)

        best = sorted(cands, key=corner_rank)[0]
        detected_markers[name] = (best["cx"], best["cy"])

    if missing:
        return MarkerDetectionResult(
            success=False,
            error=f"MISSING_MARKERS: {', '.join(missing)}",
            missing_markers=missing
        )

    # 3. Geometric Quadrilateral Consistency Verification
    tl = detected_markers["topLeft"]
    tr = detected_markers["topRight"]
    bl = detected_markers["bottomLeft"]
    br = detected_markers["bottomRight"]

    # Invariant 1: Proper spatial ordering
    if not (tl[0] < tr[0] and bl[0] < br[0] and tl[1] < bl[1] and tr[1] < br[1]):
        return MarkerDetectionResult(
            success=False,
            error="INVALID_MARKER_ORDERING",
            missing_markers=[]
        )

    # Invariant 2: Widths and heights must be non-zero and plausible
    top_w = math.hypot(tr[0] - tl[0], tr[1] - tl[1])
    bot_w = math.hypot(br[0] - bl[0], br[1] - bl[1])
    left_h = math.hypot(bl[0] - tl[0], bl[1] - tl[1])
    right_h = math.hypot(br[0] - tr[0], br[1] - tr[1])

    if min(top_w, bot_w, left_h, right_h) < 100:
        return MarkerDetectionResult(
            success=False,
            error="MARKERS_TOO_CLOSE",
            missing_markers=[]
        )

    # Aspect ratio check (Standard A4 is 1.414: height / width)
    avg_w = (top_w + bot_w) / 2.0
    avg_h = (left_h + right_h) / 2.0
    aspect_ratio = avg_h / avg_w if avg_w > 0 else 0

    if aspect_ratio < 1.05 or aspect_ratio > 1.85:
        return MarkerDetectionResult(
            success=False,
            error=f"INVALID_ASPECT_RATIO: {aspect_ratio:.2f} (expected ~1.41)",
            missing_markers=[]
        )

    # Invariant 3: Skew Angle estimate
    dx = tr[0] - tl[0]
    dy = tr[1] - tl[1]
    skew_angle = math.degrees(math.atan2(dy, dx))

    # Reject extreme trapezoidal distortions (e.g. top width vs bottom width ratio > 1.4)
    w_ratio = max(top_w, bot_w) / min(top_w, bot_w)
    h_ratio = max(left_h, right_h) / min(left_h, right_h)

    if w_ratio > 1.35 or h_ratio > 1.35:
        return MarkerDetectionResult(
            success=False,
            error=f"EXCESSIVE_KEYSTONE_DISTORTION: width ratio {w_ratio:.2f}, height ratio {h_ratio:.2f}",
            missing_markers=[]
        )

    # Confidence score (0.0 to 1.0)
    confidence = max(0.5, min(1.0, 1.0 - (abs(aspect_ratio - 1.414) * 0.3) - ((w_ratio - 1.0) * 0.2)))

    return MarkerDetectionResult(
        success=True,
        markers=detected_markers,
        confidence=confidence,
        skew_angle=skew_angle
    )
