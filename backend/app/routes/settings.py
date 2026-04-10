from fastapi import APIRouter, HTTPException, Request

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries

router = APIRouter()


@router.get("/api/settings")
async def get_settings(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        row = queries.get_user_settings(user_id)
        if not row:
            return {"onboarding_complete": False, "settings": {}}
        return {
            "onboarding_complete": row.get("onboarding_complete", False),
            "settings": row.get("settings") or {},
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get settings: {e}")


@router.put("/api/settings")
async def update_settings(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        body = await request.json()
        onboarding = body.pop("onboarding_complete", None)
        queries.save_user_settings(user_id, body, onboarding_complete=onboarding)
        return {"saved": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to save settings: {e}")


@router.get("/api/projects/{job_id}/overrides")
async def get_overrides(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        row = queries.get_project_overrides(job_id, user_id)
        if not row:
            return {"material": {}, "labor": {}}
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get overrides: {e}")


@router.put("/api/projects/{job_id}/overrides")
async def save_overrides(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        queries.save_project_overrides(job_id, user_id, body)
        return {"saved": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to save overrides: {e}")
