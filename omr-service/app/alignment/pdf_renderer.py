import cv2
import numpy as np
import pypdfium2 as pdfium

def render_pdf_page_to_bgr(pdf_path_or_bytes, page_index: int = 0, dpi: int = 300) -> np.ndarray:
    """
    Renders an OMR PDF page to an OpenCV BGR numpy array at specified DPI (default 300 DPI).
    Standard A4 rendered at 300 DPI results in ~2480 x 3508 pixels.
    """
    try:
        pdf = pdfium.PdfDocument(pdf_path_or_bytes)
        if len(pdf) <= page_index:
            raise ValueError(f"PDF has {len(pdf)} pages, requested page index {page_index} is out of range")
        
        page = pdf[page_index]
        scale = dpi / 72.0
        pil_image = page.render(scale=scale).to_pil()
        
        rgb_array = np.array(pil_image)
        if len(rgb_array.shape) == 2:
            return cv2.cvtColor(rgb_array, cv2.COLOR_GRAY2BGR)
        elif rgb_array.shape[2] == 4:
            # RGBA to BGR
            return cv2.cvtColor(rgb_array, cv2.COLOR_RGBA2BGR)
        else:
            # RGB to BGR
            return cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
    except Exception as err:
        raise ValueError(f"PDF rendering error: {str(err)}")
