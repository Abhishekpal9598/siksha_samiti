import os

OMR_SERVICE_PORT = int(os.getenv("OMR_SERVICE_PORT", "8001"))
OMR_SERVICE_HOST = os.getenv("OMR_SERVICE_HOST", "127.0.0.1")
OMR_INTERNAL_KEY = os.getenv("OMR_INTERNAL_KEY", "edu_omr_internal_secret_key_2026")
