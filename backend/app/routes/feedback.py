from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries

router = APIRouter()


class FeedbackBody(BaseModel):
    rating: str
    message: str | None = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v):
        if v not in ("high", "low", "spot_on"):
            raise ValueError("rating must be 'high', 'low', or 'spot_on'")
        return v


@router.post("/api/projects/{job_id}/feedback")
async def submit_feedback(job_id: str, body: FeedbackBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        queries.create_feedback(job_id, user_id, body.rating, body.message)
        return {"saved": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to submit feedback: {e}")


@router.get("/api/projects/{job_id}/feedback")
async def get_feedback(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        fb = queries.get_feedback(job_id, user_id)
        if not fb:
            return None
        return fb
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get feedback: {e}")
