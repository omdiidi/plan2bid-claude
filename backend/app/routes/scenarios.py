import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
from app.db import queries
from app.db.client import _db

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateScenarioBody(BaseModel):
    name: str | None = None
    context: str
    parent_scenario_id: str | None = None


class UpdateScenarioBody(BaseModel):
    name: str | None = None
    context: str | None = None


def _merge_scenario_line_item(item_id: str, mat: dict | None, lab: dict | None) -> dict:
    mat_cost = float(mat.get("extended_cost_expected", 0) or 0) if mat else 0.0
    lab_cost = float(lab.get("cost_expected", 0) or 0) if lab else 0.0

    confidence_order = {"high": 3, "medium": 2, "low": 1}
    mat_conf = (mat.get("confidence") or "medium") if mat else "medium"
    lab_conf = (lab.get("confidence") or "medium") if lab else "medium"
    worst = mat_conf if confidence_order.get(mat_conf, 2) <= confidence_order.get(lab_conf, 2) else lab_conf
    if not mat:
        worst = lab_conf
    if not lab:
        worst = mat_conf

    ref = mat or lab or {}

    def _format_crew(crew: list) -> str:
        if not crew:
            return ""
        parts = []
        for c in crew:
            if isinstance(c, dict):
                parts.append(f"{c.get('count', 1)}x {c.get('role', 'worker')}")
        return ", ".join(parts)

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
        "overall_confidence": worst,
        "confidence_notes": None,
        "source_refs": ref.get("source_refs", []),
    }


@router.post("/api/projects/{job_id}/scenarios")
async def create_scenario(job_id: str, body: CreateScenarioBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        if body.parent_scenario_id:
            parent = queries.get_scenario_detail(body.parent_scenario_id)
            if not parent or parent.get("project_id") != job_id:
                raise HTTPException(400, "Parent scenario does not belong to this project")

        scenario_id = str(uuid.uuid4())  # DB column is UUID, not TEXT
        name = body.name or f"Scenario {datetime.now(timezone.utc).strftime('%b %d %H:%M')}"

        queries.insert_scenario(scenario_id, job_id, user_id, name, body.context)
        if body.parent_scenario_id:
            queries.update_scenario(scenario_id, parent_scenario_id=body.parent_scenario_id)

        _db().table("estimation_jobs").insert({
            "project_id": job_id,
            "user_id": user_id,
            "job_type": "scenario",
            "scenario_id": scenario_id,
            "scenario_context": body.context,
            "status": "pending",
        }).execute()

        return {"scenario_id": scenario_id, "status": "pending"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to create scenario: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/projects/{job_id}/scenarios")
async def list_scenarios(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        return queries.get_scenarios(job_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to list scenarios: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/projects/{job_id}/scenarios/compare")
async def compare_scenarios(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        mat_items = queries.get_material_items(job_id)
        lab_items = queries.get_labor_items(job_id)
        base_mat = sum(float(m.get("extended_cost_expected", 0) or 0) for m in mat_items)
        base_lab = sum(float(l.get("cost_expected", 0) or 0) for l in lab_items)
        base_total = base_mat + base_lab
        base_summary = {"materials_subtotal": base_mat, "labor_subtotal": base_lab, "total": base_total}

        scenarios = queries.get_scenarios(job_id)
        entries = []
        for scn in scenarios:
            sid = scn["id"]
            s_mats = _db().table("scenario_material_items").select("*").eq("scenario_id", sid).execute()
            s_labs = _db().table("scenario_labor_items").select("*").eq("scenario_id", sid).execute()

            s_mat_total = sum(float(m.get("extended_cost_expected", 0) or 0) for m in s_mats)
            s_lab_total = sum(float(l.get("cost_expected", 0) or 0) for l in s_labs)
            s_total = s_mat_total + s_lab_total

            delta_total = s_total - base_total
            delta_pct = (delta_total / base_total * 100) if base_total else 0

            entry = {
                "id": sid,
                "name": scn.get("name", ""),
                "parent_id": scn.get("parent_scenario_id"),
                "summary": scn.get("summary"),
                "reasoning": scn.get("reasoning"),
                "status": scn.get("status", "pending"),
                "created_at": scn.get("created_at", ""),
                "materials_subtotal": s_mat_total,
                "labor_subtotal": s_lab_total,
                "total": s_total,
                "delta_from_base": {
                    "materials": s_mat_total - base_mat,
                    "labor": s_lab_total - base_lab,
                    "total": delta_total,
                    "percent": round(delta_pct, 2),
                },
                "delta_from_parent": None,
            }
            entries.append(entry)

        return {"base": base_summary, "scenarios": entries}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to compare scenarios: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/projects/{job_id}/scenarios/{scenario_id}")
async def get_scenario_detail(job_id: str, scenario_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        scenario = queries.get_scenario_detail(scenario_id)
        if not scenario or scenario.get("project_id") != job_id:
            raise HTTPException(404, "Scenario not found in this project")

        s_mats = _db().table("scenario_material_items").select("*").eq("scenario_id", scenario_id).execute()
        s_labs = _db().table("scenario_labor_items").select("*").eq("scenario_id", scenario_id).execute()

        mat_by_key: dict[tuple, dict] = {}
        for m in s_mats:
            key = (m.get("trade", ""), m.get("item_id", ""))
            mat_by_key[key] = m
        lab_by_key: dict[tuple, dict] = {}
        for l in s_labs:
            key = (l.get("trade", ""), l.get("item_id", ""))
            lab_by_key[key] = l

        all_keys = set(mat_by_key.keys()) | set(lab_by_key.keys())
        line_items = []
        for key in sorted(all_keys):
            item_id = key[1]
            line_items.append(_merge_scenario_line_item(item_id, mat_by_key.get(key), lab_by_key.get(key)))

        mat_total = sum(i.get("material_extended_cost", 0) or 0 for i in line_items)
        lab_total = sum(i.get("labor_cost", 0) or 0 for i in line_items)
        cost_summary = {"materials_subtotal": mat_total, "labor_subtotal": lab_total, "total": mat_total + lab_total}

        s_anomalies = _db().table("scenario_anomaly_flags").select("*").eq("scenario_id", scenario_id).execute()
        priced_in = [a for a in s_anomalies if a.get("anomaly_type") == "priced_in"]
        noted = [a for a in s_anomalies if a.get("anomaly_type") != "priced_in"]

        s_mat_meta = _db().table("scenario_material_metadata").select("*").eq("scenario_id", scenario_id).execute()
        s_lab_meta = _db().table("scenario_labor_metadata").select("*").eq("scenario_id", scenario_id).execute()

        return {
            "scenario": scenario,
            "line_items": line_items,
            "cost_summary": cost_summary,
            "anomaly_report": {"priced_in": priced_in, "noted": noted},
            "material_metadata": s_mat_meta,
            "labor_metadata": s_lab_meta,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get scenario detail: {e}")
        raise HTTPException(500, "Internal server error")


@router.get("/api/projects/{job_id}/scenarios/{scenario_id}/status")
async def get_scenario_status(job_id: str, scenario_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.VIEWER)

        scenario = queries.get_scenario_detail(scenario_id)
        if not scenario or scenario.get("project_id") != job_id:
            raise HTTPException(404, "Scenario not found in this project")

        return {
            "scenario_id": scenario_id,
            "status": scenario.get("status", "pending"),
            "progress": scenario.get("progress", 0),
            "error_message": scenario.get("error_message"),
            "summary": scenario.get("summary"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get scenario status: {e}")
        raise HTTPException(500, "Internal server error")


@router.delete("/api/projects/{job_id}/scenarios/{scenario_id}")
async def delete_scenario(job_id: str, scenario_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        scenario = queries.get_scenario_detail(scenario_id)
        if not scenario or scenario.get("project_id") != job_id:
            raise HTTPException(404, "Scenario not found in this project")

        result = queries.delete_scenario(scenario_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete scenario: {e}")
        raise HTTPException(500, "Internal server error")


@router.patch("/api/projects/{job_id}/scenarios/{scenario_id}")
async def update_scenario(job_id: str, scenario_id: str, body: UpdateScenarioBody, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        scenario = queries.get_scenario_detail(scenario_id)
        if not scenario or scenario.get("project_id") != job_id:
            raise HTTPException(404, "Scenario not found in this project")

        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.context is not None:
            updates["context"] = body.context
        if updates:
            queries.update_scenario(scenario_id, **updates)

        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update scenario: {e}")
        raise HTTPException(500, "Internal server error")
