from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from ..security import verify_internal_key
from ..alignment.pipeline import process_omr_alignment

router = APIRouter(prefix="", tags=["Alignment"])

class AlignmentRequest(BaseModel):
    input_path: str = Field(..., description="Absolute filesystem path to uploaded private OMR scan")
    output_path: str = Field(..., description="Absolute filesystem path to write aligned rectified PNG")

class AlignmentResponse(BaseModel):
    success: bool
    status: str
    rejectionReason: Optional[str] = None
    error: Optional[str] = None
    qualityMetrics: Optional[dict] = None
    alignment: Optional[dict] = None
    outputPath: Optional[str] = None

@router.post(
    "/align",
    response_model=AlignmentResponse,
    dependencies=[Depends(verify_internal_key)],
    summary="Process OMR Image Alignment, Marker Detection & Perspective Rectification"
)
def align_omr_image(payload: AlignmentRequest):
    """
    Private Microservice Route (Protected by X-Internal-Service-Key).
    Analyzes, detects markers, corrects perspective, assesses quality, and writes rectified canvas.
    """
    result = process_omr_alignment(payload.input_path, payload.output_path)
    return result
