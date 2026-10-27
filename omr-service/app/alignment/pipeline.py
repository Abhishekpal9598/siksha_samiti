import os
import cv2
import numpy as np
from typing import Dict, Any

from .pdf_renderer import render_pdf_page_to_bgr
from .marker_detector import detect_fiducial_markers
from .perspective import warp_perspective_to_canonical
from .quality import compute_quality_metrics

def process_omr_alignment(input_path: str, output_path: str) -> Dict[str, Any]:
    """
    Executes the end-to-end Phase 6.4 Alignment Pipeline:
    1. Loads JPEG, PNG or renders PDF page 1 at 300 DPI.
    2. Performs comprehensive image quality validation (blur, brightness, contrast, DPI).
    3. Detects four corner fiducial markers and verifies quad geometry.
    4. Calculates perspective homography and rectifies to canonical 2480x3508 A4 space.
    5. Persists the rectified image privately to output_path.
    6. Returns structured processing metadata without mutating original input.
    """
    if not os.path.exists(input_path):
        return {
            "success": False,
            "status": "FAILED",
            "error": "INPUT_FILE_NOT_FOUND",
            "message": f"Input file does not exist at {input_path}"
        }

    # 1. Load Image or Render PDF
    ext = os.path.splitext(input_path)[1].lower()
    image = None

    try:
        if ext == '.pdf':
            image = render_pdf_page_to_bgr(input_path, page_index=0, dpi=300)
        else:
            image = cv2.imread(input_path, cv2.IMREAD_COLOR)
    except Exception as err:
        return {
            "success": False,
            "status": "FAILED",
            "error": "FILE_CORRUPTED_OR_UNREADABLE",
            "message": str(err)
        }

    if image is None:
        return {
            "success": False,
            "status": "FAILED",
            "error": "IMAGE_DECODE_FAILED",
            "message": "OpenCV or PDF renderer was unable to decode image pixels"
        }

    # 2. Measurable Physical Quality Assessment
    quality_metrics = compute_quality_metrics(image)
    if not quality_metrics.get("passedQualityGates", False):
        # Check if rejected due to excessive dimensions (memory protection)
        if any("exceed maximum allowed pixel limit" in r for r in quality_metrics.get("failureReasons", [])):
            return {
                "success": False,
                "status": "FAILED",
                "error": "EXCESSIVE_PIXEL_COUNT",
                "rejectionReason": "Image dimensions exceed maximum allowed pixel limit (35 MP)",
                "qualityMetrics": quality_metrics
            }

    # 3. Fiducial Marker Detection
    marker_result = detect_fiducial_markers(image)
    if not marker_result.success:
        return {
            "success": False,
            "status": "NEEDS_REVIEW",
            "error": marker_result.error,
            "missingMarkers": marker_result.missing_markers,
            "qualityMetrics": quality_metrics,
            "alignment": {
                "success": False,
                "error": marker_result.error,
                "confidence": 0.0
            }
        }

    # 4. Perspective Correction & Homography Warping
    try:
        aligned_image, M = warp_perspective_to_canonical(image, marker_result.markers)
    except Exception as warp_err:
        return {
            "success": False,
            "status": "NEEDS_REVIEW",
            "error": f"WARP_PERSPECTIVE_FAILED: {str(warp_err)}",
            "qualityMetrics": quality_metrics,
            "alignment": {
                "success": False,
                "error": str(warp_err)
            }
        }

    # 5. Determine Overall Pipeline Status
    # If physical quality checks failed (e.g. blurry, very dark), mark NEEDS_REVIEW
    if not quality_metrics["passedQualityGates"]:
        status = "NEEDS_REVIEW"
        reason = "; ".join(quality_metrics["failureReasons"])
    else:
        status = "PROCESSING"
        reason = None

    # 6. Save Aligned Image to Private Storage
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    success_save = cv2.imwrite(output_path, aligned_image, [cv2.IMWRITE_PNG_COMPRESSION, 4])
    if not success_save:
        return {
            "success": False,
            "status": "FAILED",
            "error": "WRITE_FAILED",
            "message": f"Failed to write aligned image to {output_path}"
        }

    return {
        "success": True,
        "status": status,
        "rejectionReason": reason,
        "qualityMetrics": quality_metrics,
        "alignment": {
            "success": True,
            "skewAngleDegrees": marker_result.skew_angle,
            "confidence": marker_result.confidence,
            "canonicalDimensions": {"width": 2480, "height": 3508},
            "detectedMarkers": marker_result.to_dict()["markers"],
            "transformMatrix": M.tolist()
        },
        "outputPath": output_path
    }
