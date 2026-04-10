import json
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries
from app.db.client import _db

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------

class SubcontractorBody(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: str | None = None
    trades: list[str] = []
    notes: str | None = None


class CreateInviteBody(BaseModel):
    email: str | None = None
    trades_scope: list[str] = []
    allow_competitive_view: bool = False
    send_documents: bool = False


class SubmitBidBody(BaseModel):
    trade: str
    company_name: str
    contact_name: str
    total_material: float
    total_labor: float
    total_bid: float
    notes: str | None = None
    items: list[dict] = []


# ---------------------------------------------------------------------------
# Subcontractor CRUD
# ---------------------------------------------------------------------------

@router.get("/api/subcontractors")
async def list_subcontractors(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        return queries.list_subcontractors(user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to list subcontractors: {e}")


@router.post("/api/subcontractors")
async def create_subcontractor(body: SubcontractorBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        data = {
            "user_id": user_id,
            "company_name": body.company_name,
            "contact_name": body.contact_name,
            "email": body.email,
            "phone": body.phone,
            "trades": json.dumps(body.trades),
            "notes": body.notes,
        }
        return queries.create_subcontractor(data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to create subcontractor: {e}")


@router.put("/api/subcontractors/{sub_id}")
async def update_subcontractor(sub_id: str, body: SubcontractorBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        data = {
            "company_name": body.company_name,
            "contact_name": body.contact_name,
            "email": body.email,
            "phone": body.phone,
            "trades": json.dumps(body.trades),
            "notes": body.notes,
        }
        queries.update_subcontractor(sub_id, data, user_id=user_id)
        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to update subcontractor: {e}")


@router.delete("/api/subcontractors/{sub_id}")
async def delete_subcontractor(sub_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        queries.delete_subcontractor(sub_id, user_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete subcontractor: {e}")


# ---------------------------------------------------------------------------
# Sub invites
# ---------------------------------------------------------------------------

@router.post("/api/projects/{job_id}/sub-invites")
async def create_sub_invite(job_id: str, body: CreateInviteBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        token = str(uuid.uuid4())
        invite_data = {
            "project_id": job_id,
            "shared_by_user_id": user_id,
            "token": token,
            "email": body.email,
            "permission": "viewer",
            "share_type": "link",
            "trades_scope": json.dumps(body.trades_scope),
            "allow_competitive_view": body.allow_competitive_view,
        }
        row = queries.create_sub_invite(invite_data)
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to create invite: {e}")


@router.get("/api/projects/{job_id}/sub-invites")
async def list_sub_invites(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        return queries.list_sub_invites(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to list invites: {e}")


@router.get("/api/sub-invites/{token}")
async def get_sub_invite(token: str):
    try:
        invite = queries.get_sub_invite_by_token(token)
        if not invite:
            raise HTTPException(404, "Invite not found")

        project = queries.get_project_by_id(invite["project_id"])
        if not project:
            raise HTTPException(404, "Project not found")

        material_items = queries.get_material_items(invite["project_id"])
        labor_items = queries.get_labor_items(invite["project_id"])

        from app.routes.estimates import _build_line_items, _compute_cost_summary

        line_items = _build_line_items(material_items, labor_items)

        trades_scope_raw = invite.get("trades_scope", "[]")
        if isinstance(trades_scope_raw, str):
            try:
                trades_scope = json.loads(trades_scope_raw)
            except (json.JSONDecodeError, TypeError):
                trades_scope = []
        else:
            trades_scope = trades_scope_raw

        trade_sections: dict[str, list] = {}
        trade_subtotals: dict[str, dict] = {}
        for item in line_items:
            t = item.get("_trade", "Other")
            trade_sections.setdefault(t, []).append(item)
        for t, items in trade_sections.items():
            trade_subtotals[t] = _compute_cost_summary(items)

        clean_items = [{k: v for k, v in i.items() if k != "_trade"} for i in line_items]
        clean_sections = {}
        for t, items in trade_sections.items():
            clean_sections[t] = [{k: v for k, v in i.items() if k != "_trade"} for i in items]

        return {
            "invite_id": invite.get("id"),
            "project_id": invite["project_id"],
            "project_name": project.get("project_name", ""),
            "project_address": project.get("project_address", ""),
            "facility_type": project.get("facility_type", ""),
            "trades_scope": trades_scope,
            "allow_competitive_view": invite.get("allow_competitive_view", False),
            "send_documents": False,
            "trade_summary": None,
            "overall_summary": None,
            "line_items": clean_items,
            "trade_sections": clean_sections,
            "trade_subtotals": trade_subtotals,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get invite: {e}")


@router.post("/api/sub-invites/{token}/submit")
async def submit_bid(token: str, body: SubmitBidBody):
    try:
        invite = queries.get_sub_invite_by_token(token)
        if not invite:
            raise HTTPException(404, "Invite not found")

        if body.total_bid < 0 or body.total_material < 0 or body.total_labor < 0:
            raise HTTPException(400, "Bid amounts cannot be negative")

        trades_scope_raw = invite.get("trades_scope", "[]")
        if isinstance(trades_scope_raw, str):
            try:
                parsed = json.loads(trades_scope_raw)
                trades_scope = parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                trades_scope = []
        elif isinstance(trades_scope_raw, list):
            trades_scope = trades_scope_raw
        else:
            trades_scope = []

        if trades_scope and body.trade not in trades_scope:
            raise HTTPException(400, f"Trade '{body.trade}' is not in the invite's scope: {trades_scope}")

        bid_data = {
            "project_id": invite["project_id"],
            "invite_id": invite["id"],
            "trade": body.trade,
            "company_name": body.company_name,
            "contact_name": body.contact_name,
            "total_material": body.total_material,
            "total_labor": body.total_labor,
            "total_bid": body.total_bid,
            "notes": body.notes,
            "items": json.dumps(body.items),
        }
        row = queries.submit_bid(bid_data)
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to submit bid: {e}")


@router.get("/api/projects/{job_id}/sub-bids")
async def get_sub_bids(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        bids = queries.get_sub_bids(job_id)
        bids_by_trade: dict[str, list] = {}
        for b in bids:
            trade = b.get("trade", "unknown")
            bids_by_trade.setdefault(trade, []).append(b)
        return {"bids_by_trade": bids_by_trade}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get sub bids: {e}")


@router.get("/api/projects/{job_id}/sub-bids/{trade}")
async def get_sub_bids_by_trade(job_id: str, trade: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.OWNER)

        return queries.get_sub_bids_by_trade(job_id, trade)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get bids: {e}")


@router.get("/api/projects/{job_id}/sub-submissions/{submission_id}/detail")
async def get_sub_bid_detail(job_id: str, submission_id: int, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        rows = _db().table("sub_submissions").select("*").eq("id", submission_id).eq("project_id", job_id).execute()
        if not rows:
            raise HTTPException(404, "Submission not found")
        submission = rows[0]
        # Try dedicated items table first, fall back to JSON column on submission row
        items = _db().table("sub_submission_items").select("*").eq("submission_id", submission_id).execute()
        if not items:
            # Fall back to inline JSON items on the submission row
            items_raw = submission.get("items", "[]")
            if isinstance(items_raw, str):
                try:
                    items = json.loads(items_raw)
                except (ValueError, TypeError):
                    items = []
            elif isinstance(items_raw, list):
                items = items_raw
            else:
                items = []
        return {"submission": submission, "items": items}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get bid detail: {e}")


@router.get("/api/sub-invites/{token}/competitors")
async def get_competitors(token: str):
    try:
        result = queries.get_competitor_bids(token)
        if not result.get("invite"):
            raise HTTPException(404, "Invite not found")
        if not result["invite"].get("allow_competitive_view"):
            raise HTTPException(403, "Competitive view not enabled for this invite")
        return result["bids"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get competitors: {e}")


@router.patch("/api/sub-invites/{token}/claim")
async def claim_invite(token: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        invite = queries.get_sub_invite_by_token(token)
        if not invite:
            raise HTTPException(404, "Invite not found")
        if invite.get("shared_with_user_id") and invite["shared_with_user_id"] != user_id:
            raise HTTPException(403, "This invite has already been claimed by another user")
        queries.claim_invite(token, user_id)
        return {"claimed": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to claim invite: {e}")


# ---------------------------------------------------------------------------
# Document stubs
# ---------------------------------------------------------------------------

@router.get("/api/sub-invites/{token}/documents")
async def sub_invite_documents(token: str):
    raise HTTPException(501, "Document listing not yet implemented")


@router.get("/api/sub-invites/{token}/documents/{doc_index}/pdf")
async def sub_invite_document_pdf(token: str, doc_index: int):
    raise HTTPException(501, "Document PDF serving not yet implemented")


@router.get("/api/sub-invites/{token}/documents/{doc_index}/pages/{page_num}")
async def sub_invite_document_page(token: str, doc_index: int, page_num: int):
    raise HTTPException(501, "Document page serving not yet implemented")
