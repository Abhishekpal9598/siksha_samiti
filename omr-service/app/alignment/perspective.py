import cv2
import numpy as np
from typing import Dict, Tuple

# Canonical Target Canvas Specifications (300 DPI Standard A4)
CANONICAL_WIDTH = 2480
CANONICAL_HEIGHT = 3508

# Derived from OMR_LAYOUT_SPEC:
# Page: 595.28 x 841.89 pt
# Scale: 2480 / 595.28 = 4.166106689
# TL Center: (38.0, 38.0) pt
# TR Center: (557.28, 38.0) pt
# BL Center: (38.0, 803.89) pt
# BR Center: (557.28, 803.89) pt
SCALE_X = CANONICAL_WIDTH / 595.28
SCALE_Y = CANONICAL_HEIGHT / 841.89

CANONICAL_TARGET_CENTERS = {
    "topLeft": (38.0 * SCALE_X, 38.0 * SCALE_Y),          # ~ (158.31, 158.31)
    "topRight": (557.28 * SCALE_X, 38.0 * SCALE_Y),       # ~ (2321.69, 158.31)
    "bottomRight": (557.28 * SCALE_X, 803.89 * SCALE_Y),  # ~ (2321.69, 3349.09)
    "bottomLeft": (38.0 * SCALE_X, 803.89 * SCALE_Y)      # ~ (158.31, 3349.09)
}

def warp_perspective_to_canonical(
    image: np.ndarray,
    detected_markers: Dict[str, Tuple[float, float]]
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Computes four-point perspective homography transform and warps the input image
    into canonical 300 DPI A4 dimensions (2480 x 3508).
    
    Returns:
        (aligned_image, transform_matrix)
    """
    if image is None:
        raise ValueError("Cannot warp null or empty image")

    required = ["topLeft", "topRight", "bottomRight", "bottomLeft"]
    for r in required:
        if r not in detected_markers:
            raise ValueError(f"Missing detected marker coordinate: {r}")

    # Source quad vertices from detected marker centers
    src_pts = np.float32([
        detected_markers["topLeft"],
        detected_markers["topRight"],
        detected_markers["bottomRight"],
        detected_markers["bottomLeft"]
    ])

    # Destination quad vertices in canonical coordinate space
    dst_pts = np.float32([
        CANONICAL_TARGET_CENTERS["topLeft"],
        CANONICAL_TARGET_CENTERS["topRight"],
        CANONICAL_TARGET_CENTERS["bottomRight"],
        CANONICAL_TARGET_CENTERS["bottomLeft"]
    ])

    # Compute transformation matrix
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)

    # Matrix integrity verification
    det = np.linalg.det(M)
    if abs(det) < 1e-9:
        raise ValueError("Singular perspective matrix detected; transformation is invalid")

    cond = np.linalg.cond(M)
    if cond > 1e7:
        raise ValueError(f"Ill-conditioned perspective matrix (cond={cond:.1e}); severe distortion")

    # Warp image to exact canonical dimensions
    aligned = cv2.warpPerspective(
        image,
        M,
        (CANONICAL_WIDTH, CANONICAL_HEIGHT),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255)
    )

    return aligned, M
