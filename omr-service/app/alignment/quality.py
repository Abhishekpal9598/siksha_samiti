import cv2
import numpy as np

# Configurable Quality Gate Thresholds
MIN_WIDTH = 800
MIN_HEIGHT = 1100
MIN_DPI = 100
MAX_PIXELS = 35_000_000  # Max 35 Megapixels (Prevents memory exhaustion)
MIN_BLUR_SCORE = 40.0    # Laplacian variance threshold
MIN_BRIGHTNESS = 60.0    # Minimum average luminance (scale 0-255)
MAX_BRIGHTNESS = 253.5   # Maximum average luminance (scale 0-255)
MIN_CONTRAST = 18.0      # Standard deviation of luminance

def compute_quality_metrics(image: np.ndarray) -> dict:
    """
    Computes measurable physical image quality metrics:
    - Dimensions, resolution, pixel count and estimated DPI
    - Laplacian variance blur/sharpness score
    - Mean luminance (brightness)
    - Standard deviation of luminance (contrast)
    """
    if image is None or not isinstance(image, np.ndarray):
        raise ValueError("Invalid image array provided for quality assessment")

    height, width = image.shape[:2]
    total_pixels = height * width

    if total_pixels > MAX_PIXELS:
        return {
            "width": width,
            "height": height,
            "totalPixels": total_pixels,
            "passedQualityGates": False,
            "failureReasons": [f"Image dimensions ({width}x{height}) exceed maximum allowed pixel limit"]
        }

    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # 1. Blur / Sharpness calculation using Laplacian variance
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(laplacian.var())

    # 2. Brightness & Contrast
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    # 3. Resolution & DPI Estimate (A4 is 8.27 x 11.69 inches)
    estimated_dpi = int(round(max(width / 8.27, height / 11.69)))

    # Quality Gate Evaluations
    failure_reasons = []
    is_blurry = blur_score < MIN_BLUR_SCORE
    is_low_res = width < MIN_WIDTH or height < MIN_HEIGHT or estimated_dpi < MIN_DPI
    is_underexposed = brightness < MIN_BRIGHTNESS
    is_overexposed = brightness > MAX_BRIGHTNESS
    is_low_contrast = contrast < MIN_CONTRAST

    if is_blurry:
        failure_reasons.append(f"Image is too blurry (Laplacian variance {blur_score:.1f} < {MIN_BLUR_SCORE})")
    if is_low_res:
        failure_reasons.append(f"Image resolution too low ({width}x{height}, ~{estimated_dpi} DPI)")
    if is_underexposed:
        failure_reasons.append(f"Image is severely underexposed/too dark (brightness {brightness:.1f} < {MIN_BRIGHTNESS})")
    if is_overexposed:
        failure_reasons.append(f"Image is severely overexposed/washed out (brightness {brightness:.1f} > {MAX_BRIGHTNESS})")
    if is_low_contrast:
        failure_reasons.append(f"Image has insufficient contrast (std {contrast:.1f} < {MIN_CONTRAST})")

    passed = len(failure_reasons) == 0

    return {
        "width": width,
        "height": height,
        "totalPixels": total_pixels,
        "estimatedDpi": estimated_dpi,
        "blurScore": round(blur_score, 2),
        "isBlurry": is_blurry,
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "isUnderexposed": is_underexposed,
        "isOverexposed": is_overexposed,
        "isLowContrast": is_low_contrast,
        "passedQualityGates": passed,
        "failureReasons": failure_reasons
    }
