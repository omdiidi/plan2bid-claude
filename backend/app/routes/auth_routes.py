from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, get_optional_user_id, get_user_id
from app.db import queries

router = APIRouter()


class ValidateTokenBody(BaseModel):
    token: str


class ClaimTokenBody(BaseModel):
    token: str


@router.post("/api/auth/validate-signup-token")
async def validate_signup_token(body: ValidateTokenBody):
    try:
        row = queries.get_signup_token(body.token)
        if not row:
            return {"valid": False, "reason": "Token not found"}
        if row.get("revoked"):
            return {"valid": False, "reason": "Token has been revoked"}
        if row.get("claimed"):
            return {"valid": False, "reason": "Token has already been used"}
        expires_at = row.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                exp = expires_at
            if exp < datetime.now(timezone.utc):
                return {"valid": False, "reason": "Token has expired"}
        return {"valid": True}
    except Exception as e:
        raise HTTPException(500, f"Failed to validate token: {e}")


@router.post("/api/auth/claim-signup-token")
async def claim_signup_token(body: ClaimTokenBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        row = queries.get_signup_token(body.token)
        if not row:
            raise HTTPException(404, "Token not found")
        if row.get("revoked"):
            raise HTTPException(400, "Token has been revoked")
        if row.get("claimed"):
            raise HTTPException(400, "Token has already been used")

        queries.claim_signup_token(body.token, user_id)
        return {"claimed": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to claim token: {e}")
