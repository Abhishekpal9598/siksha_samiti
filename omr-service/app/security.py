from fastapi import Header, HTTPException, status
from .config import OMR_INTERNAL_KEY

def verify_internal_key(x_internal_service_key: str = Header(None, alias="X-Internal-Service-Key")):
    """
    Enforce microservice isolation.
    Only requests with a valid X-Internal-Service-Key header matching OMR_INTERNAL_KEY are accepted.
    """
    if not x_internal_service_key or x_internal_service_key != OMR_INTERNAL_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Invalid or missing internal service key."
            }
        )
    return True
