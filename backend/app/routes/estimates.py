import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

from app.auth import (
    DEV_UUID,
    ProjectPermission,
    get_optional_user_id,
    get_required_user_id,
    get_user_id,
    require_permission,
)
from app.db import queries
from app.db.client import _db

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CONFIDENCE_ORDER = {"high": 3, "medium": 2, "low": 1}


def _format_crew(crew: list) -> str:
    if not crew:
        return ""
    parts = []
    for c in crew:
        if isinstance(c, dict):
            role = c.get("role", "worker")
            count = c.get("count", 1)
            parts.append(f"{count}x {role}")
    return ", ".join(parts)


def _merge_line_item(item_id: str, mat: dict | None, lab: dict | None) -> dict:
    mat_cost = float(mat.get("extended_cost_expected", 0) or 0) if mat else 0.0
    lab_cost = float(lab.get("cost_expected", 0) or 0) if lab else 0.0

    mat_conf = (mat.get("confidence") or "medium") if mat else "medium"
    lab_conf = (lab.get("confidence") or "medium") if lab else "medium"
    worst_confidence = mat_conf if _CONFIDENCE_ORDER.get(mat_conf, 2) <= _CONFIDENCE_ORDER.get(lab_conf, 2) else lab_conf
    if not mat:
        worst_confidence = lab_conf
    if not lab:
        worst_confidence = mat_conf

    ref = mat or lab or {}
    return {
        "item_id": item_id,
        "description": ref.get("description", ""),
        "quantity": float(ref.get("quantity", 0) or 0),
        "unit": ref.get("unit", ""),
        "has_material": mat is not None,
        "material_unit_cost": float(mat.get("unit_cost_expected", 0) or 0) if mat else None,
        "material_extended_cost": float(mat.get("extended_cost_expected", 0) or 0) if mat else None,
        "material_confidence": mat.get("confidence") if mat else None,
        "material_pricing_method": mat.get("pricing_method") if mat else None,
        "material_pricing_notes": mat.get("pricing_notes") if mat else None,
        "material_sources": mat.get("price_sources", []) if mat else [],
        "material_description": mat.get("material_description") if mat else None,
        "material_model_number": mat.get("model_number") if mat else None,
        "material_manufacturer": mat.get("manufacturer") if mat else None,
        "material_reasoning": mat.get("reasoning") if mat else None,
        "has_labor": lab is not None,
        "labor_crew_summary": _format_crew(lab.get("crew", [])) if lab else None,
        "labor_hours": float(lab.get("total_labor_hours", 0) or 0) if lab else None,
        "labor_hourly_rate": float(lab.get("blended_hourly_rate", 0) or 0) if lab else None,
        "labor_cost": float(lab.get("cost_expected", 0) or 0) if lab else None,
        "labor_confidence": lab.get("confidence") if lab else None,
        "labor_reasoning": lab.get("reasoning_notes", "") if lab else None,
        "labor_site_adjustments": lab.get("site_adjustments", []) if lab else [],
        "economies_of_scale_applied": bool(lab.get("economies_of_scale_applied")) if lab else False,
        "total_cost": mat_cost + lab_cost,
        "overall_confidence": worst_confidence,
        "confidence_notes": None,
        "source_refs": ref.get("source_refs", []),
        "_trade": ref.get("trade", ""),
    }


def _build_line_items(material_items: list[dict], labor_items: list[dict]) -> list[dict]:
    mat_by_key: dict[tuple, dict] = {}
    for m in material_items:
        key = (m.get("trade", ""), m.get("item_id", ""))
        mat_by_key[key] = m

    lab_by_key: dict[tuple, dict] = {}
    for l in labor_items:
        key = (l.get("trade", ""), l.get("item_id", ""))
        lab_by_key[key] = l

    all_keys = set(mat_by_key.keys()) | set(lab_by_key.keys())
    items = []
    for key in sorted(all_keys):
        item_id = key[1]
        mat = mat_by_key.get(key)
        lab = lab_by_key.get(key)
        items.append(_merge_line_item(item_id, mat, lab))
    return items


def _compute_cost_summary(line_items: list[dict]) -> dict:
    mat_total = sum(i.get("material_extended_cost", 0) or 0 for i in line_items)
    lab_total = sum(i.get("labor_cost", 0) or 0 for i in line_items)
    return {
        "materials_subtotal": mat_total,
        "labor_subtotal": lab_total,
        "total": mat_total + lab_total,
    }


def _compute_confidence_distribution(line_items: list[dict]) -> dict:
    total = len(line_items) or 1
    high = sum(1 for i in line_items if i.get("overall_confidence") == "high")
    med = sum(1 for i in line_items if i.get("overall_confidence") == "medium")
    low = sum(1 for i in line_items if i.get("overall_confidence") == "low")
    return {
        "high_count": high,
        "medium_count": med,
        "low_count": low,
        "high_percent": round(high / total * 100, 1),
        "medium_percent": round(med / total * 100, 1),
        "low_percent": round(low / total * 100, 1),
    }


def _build_anomaly_report(anomalies: list[dict]) -> dict:
    priced_in = [a for a in anomalies if a.get("anomaly_type") == "priced_in"]
    noted = [a for a in anomalies if a.get("anomaly_type") != "priced_in"]
    return {"priced_in": priced_in, "noted": noted}


# ---------------------------------------------------------------------------
# POST /api/estimate — Start estimation
# ---------------------------------------------------------------------------

@router.post("/api/estimate")
async def start_estimate(
    request: Request,
    zip_file: UploadFile = File(...),
    project_name: str = Form(""),
    street_address: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    zip_code: str = Form(""),
    facility_type: str = Form("other"),
    project_type: str = Form("new_build"),
    trade: str = Form("electrical"),
    project_description: str = Form(""),
    selected_trades: str = Form("[]"),
):
    try:
        user_id = get_required_user_id(request)

        job_id = f"est_{uuid.uuid4().hex[:12]}"
        project_address = ", ".join(p for p in [street_address, city, state, zip_code] if p)

        try:
            trades_list = json.loads(selected_trades)
        except (json.JSONDecodeError, TypeError):
            trades_list = [trade]

        MAX_UPLOAD_SIZE = 500 * 1024 * 1024
        ALLOWED_EXTENSIONS = {'.zip', '.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.heic'}
        content = await zip_file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(413, "File too large. Maximum size is 500 MB.")
        filename = (zip_file.filename or "").lower()
        ext = os.path.splitext(filename)[1] if filename else ""
        if not ext or ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(400, f"File type not accepted. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
        zip_storage_path = f"{job_id}/documents{ext or '.bin'}"
        _db().storage.from_("project-files").upload(zip_storage_path, content)

        queries.create_project({
            "id": job_id,
            "user_id": user_id,
            "project_name": project_name,
            "project_address": project_address,
            "city": city,
            "state": state,
            "zip_code": zip_code,
            "facility_type": facility_type,
            "project_type": project_type,
            "trade": trade,
            "selected_trades": json.dumps(trades_list),
            "project_description": project_description,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        })

        _db().table("estimation_jobs").insert({
            "project_id": job_id,
            "user_id": user_id,
            "job_type": "estimation",
            "zip_storage_path": zip_storage_path,
            "status": "pending",
        }).execute()

        pending = _db().table("estimation_jobs").select("id").in_("status", ["pending", "running"]).execute()
        queue_position = len(pending)

        return {"job_id": job_id, "queue_position": queue_position}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to start estimation: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# GET /api/estimate/status/{job_id}
# ---------------------------------------------------------------------------

@router.get("/api/estimate/status/{job_id}")
async def get_estimate_status(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")

        require_permission(project, user_id, ProjectPermission.VIEWER)

        logs_rows = (
            _db().table("project_logs")
            .select("*")
            .eq("project_id", job_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        logs = [
            {
                "timestamp": l.get("created_at", ""),
                "level": l.get("level", "info"),
                "message": l.get("message", ""),
            }
            for l in logs_rows
        ]

        status = project.get("status", "queued")

        # Live queue position — count pending jobs created before this one
        queue_position = 0
        if project.get("status") == "queued":
            project_created = project.get("queued_at") or project.get("created_at") or ""
            if project_created:
                job_row = _db().table("estimation_jobs").select("created_at").eq("project_id", job_id).limit(1).execute()
                if job_row:
                    job_created = job_row[0].get("created_at", "")
                    ahead = _db().table("estimation_jobs").select("id,created_at").eq("status", "pending").execute()
                    queue_position = sum(1 for j in ahead if (j.get("created_at") or "") < job_created) + 1

        return {
            "status": status,
            "stage": project.get("stage", "queued"),
            "message": project.get("message", ""),
            "progress": project.get("progress", 0),
            "error": project.get("error_message"),
            "estimate_id": job_id if status == "completed" else None,
            "queue_position": queue_position,
            "queued_at": project.get("queued_at"),
            "warnings": [],
            "logs": logs,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get status: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# GET /api/estimate/{job_id} — Full estimate result
# ---------------------------------------------------------------------------

@router.get("/api/estimate/{job_id}")
async def get_estimate(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")

        is_admin = queries.check_user_is_admin(user_id) if user_id != DEV_UUID else False
        if not is_admin:
            require_permission(project, user_id, ProjectPermission.VIEWER)

        material_items = queries.get_material_items(job_id)
        labor_items = queries.get_labor_items(job_id)
        anomalies = queries.get_anomaly_flags(job_id)
        lab_meta = queries.get_all_labor_metadata(job_id)
        ext_meta = queries.get_all_extraction_metadata(job_id)

        line_items = _build_line_items(material_items, labor_items)

        selected_trades_raw = project.get("selected_trades", "[]")
        if isinstance(selected_trades_raw, str):
            try:
                selected_trades = json.loads(selected_trades_raw)
            except (json.JSONDecodeError, TypeError):
                selected_trades = [project.get("trade", "")]
        else:
            selected_trades = selected_trades_raw

        is_gc = len(selected_trades) > 1 or project.get("trade") == "general_contractor"

        trade_sections = None
        trade_subtotals = None
        if is_gc:
            trade_sections = {}
            trade_subtotals = {}
            for item in line_items:
                t = item.get("_trade", "Other")
                trade_sections.setdefault(t, []).append(item)
            for t, items in trade_sections.items():
                trade_subtotals[t] = _compute_cost_summary(items)

        # Strip internal _trade field from items
        clean_items = [{k: v for k, v in item.items() if k != "_trade"} for item in line_items]

        clean_sections = {} if is_gc else None
        if trade_sections:
            for t, items in trade_sections.items():
                clean_sections[t] = [{k: v for k, v in item.items() if k != "_trade"} for item in items]

        cost_summary = _compute_cost_summary(line_items)
        confidence_dist = _compute_confidence_distribution(line_items)
        anomaly_report = _build_anomaly_report(anomalies)

        total_docs = sum(int(e.get("documents_searched", 0) or 0) for e in ext_meta)
        total_pages = sum(int(e.get("pages_searched", 0) or 0) for e in ext_meta)

        bls_area = ""
        bls_wages: dict = {}
        for lm in lab_meta:
            bls_data = lm.get("bls_wage_data")
            if isinstance(bls_data, dict):
                bls_area = bls_data.get("area_name", bls_area)
                bls_wages.update(bls_data.get("rates", {}))

        parsing_warnings: list[dict] = []
        for em in ext_meta:
            warn_list = em.get("warnings")
            if isinstance(warn_list, list):
                parsing_warnings.extend(warn_list)

        return {
            "project_address": project.get("project_address", ""),
            "facility_type": project.get("facility_type", ""),
            "project_type": project.get("project_type", ""),
            "trade": project.get("trade", ""),
            "is_gc_mode": is_gc,
            "generated_at": project.get("completed_at") or project.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "line_items": clean_items,
            "trade_sections": clean_sections,
            "trade_subtotals": trade_subtotals,
            "cost_summary": cost_summary,
            "confidence_distribution": confidence_dist,
            "anomaly_report": anomaly_report,
            "bls_area_used": bls_area,
            "bls_wage_rates": bls_wages,
            "total_documents_parsed": total_docs,
            "total_pages_parsed": total_pages,
            "warnings": [],
            "dedup_notes": [],
            "parsing_warnings": parsing_warnings,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get estimate: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Line item CRUD
# ---------------------------------------------------------------------------

@router.delete("/api/estimate/{job_id}/material/{item_id}")
async def delete_material_item(job_id: str, item_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        queries.delete_material_item(job_id, item_id)
        queries.recalculate_material_metadata(job_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete material item: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/estimate/{job_id}/material")
async def add_material_item(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        # Map frontend field names to DB column names
        if "unit_cost" in body and "unit_cost_expected" not in body:
            body["unit_cost_expected"] = body.pop("unit_cost")
        # Compute extended cost if not provided
        uc = float(body.get("unit_cost_expected", 0) or 0)
        qty = float(body.get("quantity", 0) or 0)
        body.setdefault("extended_cost_expected", uc * qty)
        safe_body = {k: v for k, v in body.items() if k in MATERIAL_UPDATABLE or k == "item_id"}
        item_id = f"CUSTOM-MAT-{uuid.uuid4().hex[:8]}"
        safe_body["item_id"] = item_id
        safe_body.setdefault("confidence", "medium")
        result = queries.add_material_item(job_id, safe_body)
        queries.recalculate_material_metadata(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to add material item: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/estimate/{job_id}/labor/{item_id}")
async def delete_labor_item(job_id: str, item_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        queries.delete_labor_item(job_id, item_id)
        queries.recalculate_labor_metadata(job_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete labor item: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/estimate/{job_id}/labor")
async def add_labor_item(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        # Map frontend field names to DB column names
        if "hours" in body and "total_labor_hours" not in body:
            body["total_labor_hours"] = body.pop("hours")
        if "hourly_rate" in body and "blended_hourly_rate" not in body:
            body["blended_hourly_rate"] = body.pop("hourly_rate")
        if "total_labor_hours" in body and "blended_hourly_rate" in body:
            hrs = float(body["total_labor_hours"] or 0)
            rate = float(body["blended_hourly_rate"] or 0)
            body.setdefault("cost_expected", hrs * rate)
            body.setdefault("labor_cost", body["cost_expected"])
        safe_body = {k: v for k, v in body.items() if k in LABOR_UPDATABLE or k == "item_id"}
        item_id = f"CUSTOM-LAB-{uuid.uuid4().hex[:8]}"
        safe_body["item_id"] = item_id
        safe_body.setdefault("confidence", "medium")
        result = queries.add_labor_item(job_id, safe_body)
        queries.recalculate_labor_metadata(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to add labor item: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Line item updates
# ---------------------------------------------------------------------------

MATERIAL_UPDATABLE = {"description", "material_description", "quantity", "unit",
                      "unit_cost_expected", "unit_cost_low", "unit_cost_high",
                      "extended_cost_expected", "extended_cost_low", "extended_cost_high",
                      "confidence", "pricing_notes", "reasoning", "model_number", "manufacturer"}

@router.patch("/api/estimate/{job_id}/material/{item_id}")
async def update_material_item(job_id: str, item_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        safe_body = {k: v for k, v in body.items() if k in MATERIAL_UPDATABLE}
        if not safe_body:
            raise HTTPException(400, "No valid fields to update")
        queries.update_material_item(job_id, item_id, safe_body)
        queries.recalculate_material_metadata(job_id)
        return {"updated": True, "item_id": item_id, "fields": list(safe_body.keys())}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update material item: {e}")
        raise HTTPException(500, "Internal server error")


LABOR_UPDATABLE = {"description", "quantity", "unit", "total_labor_hours",
                   "blended_hourly_rate", "labor_cost", "cost_expected", "cost_low", "cost_high",
                   "hours_expected", "hours_low", "hours_high", "confidence", "reasoning_notes"}

@router.patch("/api/estimate/{job_id}/labor/{item_id}")
async def update_labor_item(job_id: str, item_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        safe_body = {k: v for k, v in body.items() if k in LABOR_UPDATABLE}
        if not safe_body:
            raise HTTPException(400, "No valid fields to update")
        queries.update_labor_item(job_id, item_id, safe_body)
        queries.recalculate_labor_metadata(job_id)
        return {"updated": True, "item_id": item_id, "fields": list(safe_body.keys())}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update labor item: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Queue management
# ---------------------------------------------------------------------------

@router.get("/api/queue")
async def get_queue(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        running = _db().table("estimation_jobs").select("id,project_id").eq("status", "running").execute()
        pending = _db().table("estimation_jobs").select("id,project_id").eq("status", "pending").execute()
        return {
            "running": {"job_id": running[0]["id"]} if running else None,
            "queued": [{"job_id": j["id"], "position": i + 1} for i, j in enumerate(pending)],
            "queue_length": len(pending),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get queue: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/queue/{job_id}")
async def cancel_queue_job(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID

        job = _db().table("estimation_jobs").select("user_id").eq("id", job_id).execute()
        if not job:
            raise HTTPException(404, "Job not found")
        if job[0].get("user_id") != user_id and user_id != DEV_UUID:
            raise HTTPException(403, "You can only cancel your own jobs")

        result = _db().table("estimation_jobs").update({"status": "cancelled"}).eq("id", job_id).eq("status", "pending").execute()
        cancelled = len(result) > 0
        return {"cancelled": cancelled}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to cancel job: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Summary endpoints
# ---------------------------------------------------------------------------

@router.get("/api/projects/{job_id}/summary/trade")
async def get_trade_summary(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        cached_row = queries.get_project_summary(job_id)
        if cached_row and cached_row.get("trade_summary"):
            summary = cached_row["trade_summary"]
            if isinstance(summary, str):
                summary = json.loads(summary)
            return {"job_id": job_id, "summary": summary, "cached": True}

        from app.services.anthropic_client import generate_trade_summary

        summary = await generate_trade_summary(job_id)
        queries.save_trade_summary(job_id, summary)
        return {"job_id": job_id, "summary": summary, "cached": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get trade summary: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/projects/{job_id}/summary/overall")
async def get_overall_summary(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        cached_row = queries.get_project_summary(job_id)
        if cached_row and cached_row.get("overall_summary"):
            summary = cached_row["overall_summary"]
            if isinstance(summary, str):
                summary = json.loads(summary)
            return {"job_id": job_id, "summary": summary, "cached": True}

        from app.services.anthropic_client import generate_overall_summary

        summary = await generate_overall_summary(job_id)
        queries.save_overall_summary(job_id, summary)
        return {"job_id": job_id, "summary": summary, "cached": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get overall summary: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Preset matching
# ---------------------------------------------------------------------------

@router.post("/api/projects/{job_id}/match-presets")
async def match_presets(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        body = await request.json()
        from app.services.anthropic_client import match_presets as do_match

        result = await do_match(
            material_presets=body.get("material_presets", []),
            labor_presets=body.get("labor_presets", []),
            material_items=body.get("material_items", []),
            labor_items=body.get("labor_items", []),
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to match presets: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Pre-estimation endpoints
# ---------------------------------------------------------------------------

@router.post("/api/validate-description")
async def validate_description(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID  # soft auth — log who called
        body = await request.json()
        from app.services.anthropic_client import validate_description as do_validate

        result = await do_validate(
            description=body.get("description", ""),
            facility_type=body.get("facility_type", ""),
            trade=body.get("trade", ""),
            project_name=body.get("project_name", ""),
            street_address=body.get("street_address", ""),
            city=body.get("city", ""),
            state=body.get("state", ""),
            zip_code=body.get("zip_code", ""),
            project_type=body.get("project_type", ""),
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to validate description: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/transcribe-voice")
async def transcribe_voice(request: Request, audio: UploadFile = File(...)):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID  # soft auth
        audio_bytes = await audio.read()
        from app.services.whisper import transcribe

        text = await transcribe(audio_bytes, filename=audio.filename or "audio.webm")
        return {"text": text, "duration_seconds": 0}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to transcribe audio: {e}")
        raise HTTPException(500, "Internal server error")


@router.post("/api/polish-text")
async def polish_text(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID  # soft auth
        body = await request.json()
        from app.services.anthropic_client import polish_text as do_polish

        text = await do_polish(body.get("text", ""))
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to polish text: {e}")
        raise HTTPException(500, "Internal server error")


# ---------------------------------------------------------------------------
# Stub endpoints
# ---------------------------------------------------------------------------

@router.get("/api/estimate/{job_id}/export/{format}")
async def export_estimate(job_id: str, format: str):
    raise HTTPException(501, "Export not yet implemented")


@router.get("/api/projects/{job_id}/documents")
async def list_documents(job_id: str):
    raise HTTPException(501, "Document listing not yet implemented")


@router.get("/api/projects/{job_id}/documents/{doc_index}/pdf")
async def get_document_pdf(job_id: str, doc_index: int):
    raise HTTPException(501, "Document PDF serving not yet implemented")


@router.get("/api/projects/{job_id}/documents/{doc_index}/pages/{page_num}")
async def get_document_page(job_id: str, doc_index: int, page_num: int):
    raise HTTPException(501, "Document page serving not yet implemented")


@router.get("/api/projects/{job_id}/search")
async def search_documents(job_id: str):
    raise HTTPException(501, "Document search not yet implemented")


@router.post("/api/chat/{job_id}")
async def chat(job_id: str):
    raise HTTPException(501, "Chat not yet implemented")


@router.get("/api/projects/{project_id}/token-usage")
async def get_project_token_usage(project_id: str):
    raise HTTPException(501, "Token usage not yet implemented")


@router.get("/api/user/token-usage")
async def get_user_token_usage():
    raise HTTPException(501, "Token usage not yet implemented")
