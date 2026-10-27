import os
import cv2
import numpy as np
from typing import Dict, Any, List

from .detector import (
    get_bubble_canonical_center,
    measure_bubble_fill,
    OPTIONS,
    CANONICAL_WIDTH,
    CANONICAL_HEIGHT
)
from .classifier import classify_question_response, CONFIDENCE_THRESHOLD

def detect_bubbles_on_aligned_image(
    aligned_image_path: str,
    total_questions: int = 50
) -> Dict[str, Any]:
    """
    Executes Phase 6.5 Bubble Detection and Answer Classification
    on an already aligned/rectified OMR canvas (2480 x 3508).
    
    Extracts each bubble, computes fill ratio, classifies as
    SINGLE_MARKED, BLANK, MULTIPLE_MARKED, or UNCERTAIN, and compiles
    document-level summary and confidence metrics.
    """
    if not os.path.exists(aligned_image_path):
        return {
            "success": False,
            "error": "ALIGNED_FILE_NOT_FOUND",
            "message": f"Physical aligned image not found at {aligned_image_path}"
        }

    gray = cv2.imread(aligned_image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return {
            "success": False,
            "error": "IMAGE_DECODE_FAILED",
            "message": "OpenCV failed to decode aligned image"
        }

    H, W = gray.shape[:2]
    # Check dimensions
    if abs(W - CANONICAL_WIDTH) > 50 or abs(H - CANONICAL_HEIGHT) > 50:
        # Resize to canonical dimensions if minor mismatch
        gray = cv2.resize(gray, (CANONICAL_WIDTH, CANONICAL_HEIGHT), interpolation=cv2.INTER_LINEAR)

    # Bound question count (1 to 100)
    total_q = max(1, min(100, int(total_questions)))
    layout_type = "fourColumn" if total_q > 50 else "twoColumn"

    answers: List[Dict[str, Any]] = []
    single_marked = 0
    blank_count = 0
    multiple_count = 0
    uncertain_count = 0
    total_conf = 0.0
    review_reasons: List[str] = []

    for q in range(1, total_q + 1):
        options_metrics: Dict[str, Dict[str, Any]] = {}

        for opt_idx, opt_letter in enumerate(OPTIONS):
            cx, cy = get_bubble_canonical_center(q, opt_idx, total_q)
            metrics = measure_bubble_fill(gray, cx, cy)
            options_metrics[opt_letter] = metrics

        q_res = classify_question_response(q, options_metrics)
        answers.append(q_res)

        total_conf += q_res["confidence"]

        cls = q_res["classification"]
        if cls == "SINGLE_MARKED":
            single_marked += 1
        elif cls == "BLANK":
            blank_count += 1
        elif cls == "MULTIPLE_MARKED":
            multiple_count += 1
            review_reasons.append(f"Q{q}: Multiple bubbles filled ({', '.join(q_res['markedOptions'])})")
        elif cls == "UNCERTAIN":
            uncertain_count += 1
            review_reasons.append(f"Q{q}: {q_res['reviewReason']}")

    overall_confidence = total_conf / float(total_q) if total_q > 0 else 0.0

    needs_review = (multiple_count > 0) or (uncertain_count > 0) or (overall_confidence < CONFIDENCE_THRESHOLD)

    return {
        "success": True,
        "totalQuestions": total_q,
        "layoutType": layout_type,
        "answers": answers,
        "summary": {
            "total": total_q,
            "singleMarked": single_marked,
            "blank": blank_count,
            "multipleMarked": multiple_count,
            "uncertain": uncertain_count,
            "overallConfidence": round(overall_confidence, 3),
            "needsReview": needs_review,
            "reviewReasons": review_reasons
        }
    }
