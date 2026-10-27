from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from ..security import verify_internal_key
from ..bubbles.pipeline import detect_bubbles_on_aligned_image

router = APIRouter(prefix="", tags=["Bubble Detection"])

class BubbleDetectionRequest(BaseModel):
    aligned_image_path: str = Field(..., description="Absolute filesystem path to aligned rectified OMR scan")
    total_questions: int = Field(50, ge=1, le=100, description="Total questions to evaluate (1 to 100)")

class BubbleDetectionResponse(BaseModel):
    success: bool
    totalQuestions: Optional[int] = None
    layoutType: Optional[str] = None
    answers: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

@router.post(
    "/detect-bubbles",
    response_model=BubbleDetectionResponse,
    dependencies=[Depends(verify_internal_key)],
    summary="Detect OMR Bubbles, Measure Fill Ratios & Classify Responses"
)
def detect_bubbles(payload: BubbleDetectionRequest):
    """
    Private Microservice Route (Protected by X-Internal-Service-Key).
    Extracts bubble values, calculates fill metrics, classifies responses (SINGLE_MARKED, BLANK,
    MULTIPLE_MARKED, UNCERTAIN), and flags ambiguous answers for human review.
    """
    result = detect_bubbles_on_aligned_image(
        aligned_image_path=payload.aligned_image_path,
        total_questions=payload.total_questions
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result
        )
    return result
