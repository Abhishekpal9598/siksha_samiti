import cv2
import numpy as np
import PIL
from fastapi import APIRouter, Depends
from ..security import verify_internal_key

router = APIRouter(prefix="", tags=["Health"])

@router.get("/health", dependencies=[Depends(verify_internal_key)])
def health_check():
    """
    Health check endpoint reporting OpenCV, NumPy and Pillow versions and capabilities.
    Requires X-Internal-Service-Key authentication.
    """
    return {
        "status": "HEALTHY",
        "service": "Education Committee OMR Vision Microservice",
        "version": "1.0.0",
        "libraries": {
            "opencv": cv2.__version__,
            "numpy": np.__version__,
            "pillow": PIL.__version__
        },
        "capabilities": [
            "LAPLACIAN_BLUR_DETECTION",
            "QUADRANT_ILLUMINATION_ANALYSIS",
            "HOMOGRAPHY_PERSPECTIVE_RECTIFICATION",
            "ADAPTIVE_BASELINE_CALIBRATION",
            "BUBBLE_FILL_DENSITY_CLASSIFICATION"
        ]
    }
