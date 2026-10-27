from fastapi import FastAPI
from .routes import health, alignment

app = FastAPI(
    title="Education Committee OMR Vision Service",
    description="Dedicated microservice for physical answer sheet processing, alignment, and bubble detection",
    version="1.0.0",
    docs_url=None,  # Security: Disable public interactive documentation
    redoc_url=None
)

app.include_router(health.router)
app.include_router(alignment.router)

if __name__ == "__main__":
    import uvicorn
    from .config import OMR_SERVICE_HOST, OMR_SERVICE_PORT

    uvicorn.run("app.main:app", host=OMR_SERVICE_HOST, port=OMR_SERVICE_PORT, log_level="info")
