import logging
import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, get_optional_user_id, get_user_id, require_admin
from app.db import queries
from app.db.client import _db

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateTokenBody(BaseModel):
    label: str | None = None
    expires_at: str | None = None


@router.get("/api/admin/projects")
async def admin_list_projects(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)
        return queries.list_all_projects()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to list projects: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/admin/users")
async def admin_list_users(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)
        return queries.list_all_users()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to list users: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/admin/users/{target_user_id}")
async def admin_delete_user(target_user_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)

        from app.config import settings

        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{target_user_id}",
                headers={
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                },
            )
            if resp.status_code >= 400:
                logger.error(f"Supabase admin delete user failed: {resp.status_code} {resp.text}")
                raise HTTPException(resp.status_code, "Failed to delete user")

        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete user: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/admin/feedback")
async def admin_list_feedback(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)
        return queries.list_all_feedback()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to list feedback: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/admin/tokens")
async def admin_list_tokens(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)
        return queries.list_signup_tokens()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to list tokens: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/admin/tokens")
async def admin_create_token(body: CreateTokenBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)

        token_value = secrets.token_urlsafe(32)
        row = queries.create_signup_token(
            token=token_value,
            created_by=user_id,
            label=body.label,
            expires_at=body.expires_at,
        )
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to create token: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/admin/tokens/{token_id}")
async def admin_revoke_token(token_id: str, request: Request):  # UUID in DB, not int
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        await require_admin(user_id)
        queries.revoke_signup_token(token_id)
        return {"revoked": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to revoke token: {e}")
        raise HTTPException(500, "Internal server error")
