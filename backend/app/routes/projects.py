from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries
from app.db.client import _db

router = APIRouter()


class BulkDeleteBody(BaseModel):
    project_ids: list[str]


@router.get("/api/projects")
async def list_projects(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID

        owned = queries.list_projects(user_id)
        for p in owned:
            p["role"] = "owner"

        shared = []
        if user_id != DEV_UUID:
            shared = queries.list_shared_projects(user_id)
            for p in shared:
                share = queries.get_project_share(p["id"], user_id)
                p["role"] = share["permission"] if share else "viewer"

        all_projects = owned + shared
        all_projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return all_projects
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to list projects: {e}")


@router.get("/api/projects/{job_id}")
async def get_project(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)
        return project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get project: {e}")


@router.delete("/api/projects/{job_id}")
async def delete_project(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        if project.get("status") in ("queued", "running"):
            _db().table("estimation_jobs").update({"status": "cancelled"}).eq("project_id", job_id).eq("status", "pending").execute()

        queries.delete_project(job_id, user_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete project: {e}")


@router.post("/api/projects/bulk-delete")
async def bulk_delete_projects(body: BulkDeleteBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        count = queries.delete_projects_bulk(body.project_ids, user_id)
        return {"deleted": count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to bulk delete: {e}")


@router.patch("/api/projects/{job_id}/name")
async def rename_project(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        new_name = (body.get("project_name") or "").strip()
        if not new_name:
            raise HTTPException(400, "Project name cannot be empty")
        queries.update_project(job_id, project_name=new_name)
        return {"project_name": new_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to rename project: {e}")
