import os
from enum import Enum
from fastapi import Request, HTTPException
from app.db.client import verify_jwt


class ProjectPermission(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


_PERM_LEVEL = {"viewer": 1, "editor": 2, "owner": 3}
DEV_UUID = "00000000-0000-0000-0000-000000000001"
_DEV_MODE = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")


def get_user_id(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization header")
    token = auth_header[7:]
    user_id = verify_jwt(token)
    if not user_id:
        raise HTTPException(401, "Invalid or expired token")
    return user_id


def get_optional_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return DEV_UUID if _DEV_MODE else None
    token = auth_header[7:]
    uid = verify_jwt(token)
    if uid:
        return uid
    return DEV_UUID if _DEV_MODE else None


def get_project_permission(project: dict, user_id: str | None) -> ProjectPermission | None:
    project_uid = project.get("user_id")
    if _DEV_MODE and project_uid == DEV_UUID:
        return ProjectPermission.OWNER
    if not user_id:
        return None
    if project_uid == user_id:
        return ProjectPermission.OWNER
    from app.db import queries
    share = queries.get_project_share(project["id"], user_id)
    if share:
        return ProjectPermission(share["permission"])
    return None


def require_permission(project: dict, user_id: str, minimum: ProjectPermission) -> ProjectPermission:
    perm = get_project_permission(project, user_id)
    if not perm or _PERM_LEVEL[perm.value] < _PERM_LEVEL[minimum.value]:
        raise HTTPException(403, f"Requires {minimum.value} access")
    return perm


async def require_admin(user_id: str):
    from app.db import queries
    is_admin = queries.check_user_is_admin(user_id)
    if not is_admin:
        raise HTTPException(403, "Admin access required")
