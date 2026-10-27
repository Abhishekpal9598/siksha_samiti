from typing import Dict, Any, List, Optional

# Configurable Classification Thresholds
FILLED_THRESHOLD = 0.45   # Minimum fillScore to consider a bubble marked
BLANK_THRESHOLD = 0.25    # Maximum fillScore for an untouched blank bubble (accommodates letter glyph ink B/D)
MARGIN_THRESHOLD = 0.18   # Minimum fill difference between primary and runner-up
CONFIDENCE_THRESHOLD = 0.70  # Minimum confidence to accept detection without review

def classify_question_response(
    question_num: int,
    options_metrics: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Classifies a question's response into one of:
    - SINGLE_MARKED
    - BLANK
    - MULTIPLE_MARKED
    - UNCERTAIN
    
    Computes a detection confidence score (0.0 to 1.0).
    Never guesses or forces an answer when ambiguous.
    """
    sorted_opts = sorted(
        options_metrics.items(),
        key=lambda kv: kv[1]["fillScore"],
        reverse=True
    )

    top_opt, top_metrics = sorted_opts[0]
    second_opt, second_metrics = sorted_opts[1]

    s1 = top_metrics["fillScore"]
    s2 = second_metrics["fillScore"]

    # 1. BLANK: All options below blank threshold
    if s1 <= BLANK_THRESHOLD:
        confidence = max(0.80, min(1.0, 1.0 - (s1 / max(0.01, BLANK_THRESHOLD)) * 0.20))
        return {
            "questionNumber": question_num,
            "classification": "BLANK",
            "detectedOption": None,
            "confidence": round(confidence, 3),
            "markedOptions": [],
            "needsReview": False,
            "reviewReason": None,
            "options": options_metrics
        }

    # 2. MULTIPLE_MARKED: Two or more options clearly filled
    if s1 >= FILLED_THRESHOLD and s2 >= FILLED_THRESHOLD:
        marked = [k for k, m in options_metrics.items() if m["fillScore"] >= FILLED_THRESHOLD]
        confidence = max(0.70, min(1.0, 0.60 + min(s1, s2) * 0.40))
        return {
            "questionNumber": question_num,
            "classification": "MULTIPLE_MARKED",
            "detectedOption": None,
            "confidence": round(confidence, 3),
            "markedOptions": marked,
            "needsReview": True,
            "reviewReason": f"Multiple marked options: {', '.join(marked)}",
            "options": options_metrics
        }

    # 3. SINGLE_MARKED: Top option clearly filled and runner-up untouched
    if s1 >= FILLED_THRESHOLD and s2 <= BLANK_THRESHOLD:
        margin = s1 - s2
        confidence = min(1.0, 0.80 + (margin * 0.25))
        return {
            "questionNumber": question_num,
            "classification": "SINGLE_MARKED",
            "detectedOption": top_opt,
            "confidence": round(confidence, 3),
            "markedOptions": [top_opt],
            "needsReview": False,
            "reviewReason": None,
            "options": options_metrics
        }

    # 4. UNCERTAIN: Ambiguous fill, light pencil, partial erase, or narrow margin
    # If s1 is in the boundary zone (BLANK_THRESHOLD < s1 < FILLED_THRESHOLD) or runner-up is too close
    confidence = max(0.20, min(0.68, (s1 - s2) + 0.10))
    marked_candidates = [k for k, m in options_metrics.items() if m["fillScore"] >= (BLANK_THRESHOLD + 0.05)]

    reason_parts = []
    if s1 < FILLED_THRESHOLD:
        reason_parts.append(f"Light or partial mark on option {top_opt} (fill={s1:.2f})")
    if s2 > BLANK_THRESHOLD:
        reason_parts.append(f"Runner-up option {second_opt} has residual mark (fill={s2:.2f})")
    if s1 >= FILLED_THRESHOLD and (s1 - s2) < MARGIN_THRESHOLD:
        reason_parts.append(f"Narrow margin between {top_opt} and {second_opt} ({s1 - s2:.2f} < {MARGIN_THRESHOLD})")

    review_reason = "; ".join(reason_parts) if reason_parts else "Ambiguous mark detection"

    return {
        "questionNumber": question_num,
        "classification": "UNCERTAIN",
        "detectedOption": None,
        "confidence": round(confidence, 3),
        "markedOptions": marked_candidates,
        "needsReview": True,
        "reviewReason": review_reason,
        "options": options_metrics
    }
