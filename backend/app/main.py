import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Re-load settings after dotenv
import app.config
app.config.settings = app.config._load_settings()
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Plan2Bid backend...")
    from app.config import validate_settings
    config_warnings = validate_settings(settings)
    for w in config_warnings:
        logger.warning(f"CONFIG: {w}")
    yield
    try:
        from app.db.client import _db
        _db()._client.close()
        logger.info("Database client closed.")
    except Exception:
        pass
    logger.info("Shutting down...")


app = FastAPI(title="Plan2Bid", version="1.0.0", lifespan=lifespan)

_allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routes import (
    admin,
    auth_routes,
    estimates,
    feedback,
    projects,
    scenarios,
    settings as settings_routes,
    sharing,
    subcontractors,
)

app.include_router(estimates.router)
app.include_router(projects.router)
app.include_router(sharing.router)
app.include_router(scenarios.router)
app.include_router(admin.router)
app.include_router(auth_routes.router)
app.include_router(settings_routes.router)
app.include_router(subcontractors.router)
app.include_router(feedback.router)


@app.get("/api/health")
async def health():
    try:
        from app.db.client import _db

        _db().table("projects").select("id").limit(1).execute()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "degraded", "database": str(e)}
