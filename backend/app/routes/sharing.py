import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries

logger = logging.getLogger(__name__)

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

        if body.permission not in ("viewer", "editor"):
            raise HTTPException(400, "Invalid permission. Must be 'viewer' or 'editor'.")

        target_user = queries.get_user_by_email(body.email)

        if target_user and target_user.get("id") == user_id:
            raise HTTPException(400, "Cannot share with yourself")

        share_data: dict = {
            "project_id": job_id,
            "invited_by": user_id,
            "shared_with_email": body.email,
            "permission": body.permission,
            "share_type": "email",
            "share_token": str(uuid.uuid4()),
        }

        if target_user:
            existing = queries.get_project_share(job_id, target_user["id"])
            if existing:
                raise HTTPException(400, "Already shared with this user")
            share_data["shared_with_user_id"] = target_user["id"]
            share_data["accepted_at"] = "now()"

        row = queries.create_share(share_data)
        row["token"] = row.get("share_token")
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to share by email: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/projects/{job_id}/shares/link")
async def share_by_link(job_id: str, body: LinkShareBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        if body.permission not in ("viewer", "editor"):
            raise HTTPException(400, "Invalid permission. Must be 'viewer' or 'editor'.")

        token = str(uuid.uuid4())
        share_data = {
            "project_id": job_id,
            "invited_by": user_id,
            "permission": body.permission,
            "share_type": "link",
            "share_token": token,
        }
        row = queries.create_share(share_data)
        row["token"] = row.get("share_token") or token
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to create share link: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/shares/accept/{token}")
async def accept_share(token: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        share = queries.get_share_by_token(token)
        if not share:
            raise HTTPException(404, "Share not found")

        if share.get("purpose") == "bid_request":
            raise HTTPException(400, "Bid invite tokens cannot be used to accept project shares")

        project = queries.get_project_by_id(share["project_id"])
        if not project:
            raise HTTPException(404, "Project not found")

        # Link shares are reusable — multiple users can accept.
        # The existing_share check below (line 117) prevents duplicate access per user.

        share_email = share.get("shared_with_email") or share.get("email")
        if share.get("share_type") == "email" and share_email:
            # If the invited email has a registered user, they must be the one accepting
            target_user = queries.get_user_by_email(share_email)
            if target_user and target_user.get("id") != user_id:
                raise HTTPException(403, "This share was sent to a different email address")
            # Note: if target email hasn't signed up yet, we allow any authenticated user
            # to accept. This is a known limitation of token-based sharing.

        if project.get("user_id") == user_id:
            raise HTTPException(400, "You already own this project")

        existing = queries.get_project_share(share["project_id"], user_id)
        if existing:
            raise HTTPException(400, "You already have access to this project")

        from app.db.client import _db
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()

        if share.get("share_type") == "link":
            # Link shares are reusable — create a NEW share row per accepting user
            # Use upsert to handle concurrent duplicate accepts gracefully
            try:
                _db().table("project_shares").upsert({
                    "project_id": share["project_id"],
                    "invited_by": share.get("shared_by_user_id") or share.get("invited_by"),
                    "shared_with_user_id": user_id,
                    "permission": share.get("permission", "viewer"),
                    "share_type": "link",
                    "accepted_at": now,
                }, on_conflict="project_id,shared_with_user_id").execute()
            except Exception as upsert_err:
                logger.exception(f"Failed to create share access: {upsert_err}")
                raise HTTPException(500, "Internal server error")
        else:
            # Email shares — update the existing row (one-to-one)
            _db().table("project_shares").update({
                "shared_with_user_id": user_id,
                "accepted_at": now,
            }).eq("id", share["id"]).execute()

        return {
            "status": "accepted",
            "project_id": share["project_id"],
            "permission": share.get("permission", "viewer"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to accept share: {e}")
        raise HTTPException(500, "Internal server error")


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
        logger.exception(f"Failed to list shares: {e}")
        raise HTTPException(500, "Internal server error")


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
        queries.update_share_permission(share_id, permission, project_id=job_id)
        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update share: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/projects/{job_id}/shares/{share_id}")
async def delete_share(job_id: str, share_id: int, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        queries.delete_share(share_id, project_id=job_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete share: {e}")
        raise HTTPException(500, "Internal server error")
