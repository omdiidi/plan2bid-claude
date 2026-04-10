import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, ProjectPermission, get_user_id, require_permission
from app.db import queries

router = APIRouter()


class EmailShareBody(BaseModel):
    email: str
    permission: str = "viewer"


class LinkShareBody(BaseModel):
    permission: str = "viewer"


@router.post("/api/projects/{job_id}/shares/email")
async def share_by_email(job_id: str, body: EmailShareBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        target_user = queries.get_user_by_email(body.email)

        if target_user and target_user.get("id") == user_id:
            raise HTTPException(400, "Cannot share with yourself")

        share_data: dict = {
            "project_id": job_id,
            "shared_by_user_id": user_id,
            "email": body.email,
            "permission": body.permission,
            "share_type": "email",
            "token": str(uuid.uuid4()),
        }

        if target_user:
            existing = queries.get_project_share(job_id, target_user["id"])
            if existing:
                raise HTTPException(400, "Already shared with this user")
            share_data["shared_with_user_id"] = target_user["id"]
            share_data["accepted_at"] = "now()"

        row = queries.create_share(share_data)
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to share by email: {e}")


@router.post("/api/projects/{job_id}/shares/link")
async def share_by_link(job_id: str, body: LinkShareBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        token = str(uuid.uuid4())
        share_data = {
            "project_id": job_id,
            "shared_by_user_id": user_id,
            "permission": body.permission,
            "share_type": "link",
            "token": token,
        }
        row = queries.create_share(share_data)
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to create share link: {e}")


@router.post("/api/shares/accept/{token}")
async def accept_share(token: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        share = queries.get_share_by_token(token)
        if not share:
            raise HTTPException(404, "Share not found")

        project = queries.get_project_by_id(share["project_id"])
        if not project:
            raise HTTPException(404, "Project not found")

        if project.get("user_id") == user_id:
            raise HTTPException(400, "You already own this project")

        existing = queries.get_project_share(share["project_id"], user_id)
        if existing:
            raise HTTPException(400, "You already have access to this project")

        from app.db.client import _db

        _db().table("project_shares").update({
            "shared_with_user_id": user_id,
            "accepted_at": "now()",
        }).eq("id", share["id"]).execute()

        return {"accepted": True, "project_id": share["project_id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to accept share: {e}")


@router.get("/api/projects/{job_id}/shares")
async def list_shares(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        shares = queries.get_shares_for_project(job_id)
        return shares
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to list shares: {e}")


@router.patch("/api/projects/{job_id}/shares/{share_id}")
async def update_share(job_id: str, share_id: int, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        body = await request.json()
        permission = body.get("permission")
        if permission not in ("viewer", "editor"):
            raise HTTPException(400, "Invalid permission")
        queries.update_share_permission(share_id, permission)
        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to update share: {e}")


@router.delete("/api/projects/{job_id}/shares/{share_id}")
async def delete_share(job_id: str, share_id: int, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        queries.delete_share(share_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete share: {e}")
