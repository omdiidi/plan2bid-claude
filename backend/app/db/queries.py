import json
from app.db.client import _db

BATCH_SIZE = 100


def _parse_json_fields(row: dict, fields: list[str]) -> dict:
    for f in fields:
        val = row.get(f)
        if isinstance(val, str):
            try:
                row[f] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
    return row


def _first_or_none(response) -> dict | None:
    if response and len(response) > 0:
        return response[0]
    return None


def _batch_insert(table_name: str, rows: list[dict]):
    if not rows:
        return
    db = _db()
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        db.table(table_name).insert(chunk).execute()


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

def get_project_by_id(job_id: str) -> dict | None:
    rows = _db().table("projects").select("*").eq("id", job_id).execute()
    return _first_or_none(rows)


def list_projects(user_id: str) -> list[dict]:
    return _db().table("projects").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()


def list_shared_projects(user_id: str) -> list[dict]:
    shares = (
        _db()
        .table("project_shares")
        .select("project_id")
        .eq("shared_with_user_id", user_id)
        .execute()
    )
    if not shares:
        return []
    project_ids = [s["project_id"] for s in shares]
    return _db().table("projects").select("*").in_("id", project_ids).order("created_at", desc=True).execute()


def create_project(data: dict) -> dict:
    rows = _db().table("projects").insert(data).execute()
    return rows[0]


def update_project(job_id: str, **kwargs) -> None:
    _db().table("projects").update(kwargs).eq("id", job_id).execute()


def delete_project(job_id: str, user_id: str) -> bool:
    _db().table("projects").delete().eq("id", job_id).eq("user_id", user_id).execute()
    return True


def delete_projects_bulk(project_ids: list[str], user_id: str) -> int:
    count = 0
    for pid in project_ids:
        _db().table("projects").delete().eq("id", pid).eq("user_id", user_id).execute()
        count += 1
    return count


def get_projects_by_status(statuses: list[str]) -> list[dict]:
    return _db().table("projects").select("*").in_("status", statuses).order("created_at").execute()


# ---------------------------------------------------------------------------
# Estimation data reads
# ---------------------------------------------------------------------------

def get_material_items(job_id: str) -> list[dict]:
    rows = _db().table("material_items").select("*").eq("project_id", job_id).execute()
    return [_parse_json_fields(r, ["price_sources", "source_refs"]) for r in rows]


def get_labor_items(job_id: str) -> list[dict]:
    rows = _db().table("labor_items").select("*").eq("project_id", job_id).execute()
    return [_parse_json_fields(r, ["crew", "site_adjustments", "source_refs"]) for r in rows]


def get_anomaly_flags(job_id: str) -> list[dict]:
    rows = _db().table("anomaly_flags").select("*").eq("project_id", job_id).execute()
    return [_parse_json_fields(r, ["affected_items"]) for r in rows]


def get_all_material_metadata(job_id: str) -> list[dict]:
    return _db().table("material_metadata").select("*").eq("project_id", job_id).execute()


def get_all_labor_metadata(job_id: str) -> list[dict]:
    rows = _db().table("labor_metadata").select("*").eq("project_id", job_id).execute()
    return [_parse_json_fields(r, ["bls_wage_data"]) for r in rows]


def get_all_extraction_metadata(job_id: str) -> list[dict]:
    return _db().table("extraction_metadata").select("*").eq("project_id", job_id).execute()


def get_extraction_items(job_id: str) -> list[dict]:
    rows = _db().table("extraction_items").select("*").eq("project_id", job_id).execute()
    return [_parse_json_fields(r, ["source_refs"]) for r in rows]


# ---------------------------------------------------------------------------
# Estimation data writes
# ---------------------------------------------------------------------------

def insert_extraction_items(rows: list[dict]):
    _batch_insert("extraction_items", rows)


def insert_material_items(rows: list[dict]):
    _batch_insert("material_items", rows)


def insert_labor_items(rows: list[dict]):
    _batch_insert("labor_items", rows)


def insert_anomaly_flags(job_id: str, rows: list[dict]):
    for r in rows:
        r["project_id"] = job_id
    _batch_insert("anomaly_flags", rows)


def delete_extraction_items(job_id: str, trade: str):
    _db().table("extraction_items").delete().eq("project_id", job_id).eq("trade", trade).execute()


def delete_material_items(job_id: str, trade: str):
    _db().table("material_items").delete().eq("project_id", job_id).eq("trade", trade).execute()


def delete_labor_items(job_id: str, trade: str):
    _db().table("labor_items").delete().eq("project_id", job_id).eq("trade", trade).execute()


def delete_anomaly_flags(job_id: str, trade: str):
    _db().table("anomaly_flags").delete().eq("project_id", job_id).eq("trade", trade).execute()


def upsert_extraction_metadata(job_id: str, trade: str, data: dict):
    payload = {**data, "project_id": job_id, "trade": trade}
    _db().table("extraction_metadata").upsert(payload, on_conflict="project_id,trade").execute()


def upsert_material_metadata(job_id: str, trade: str, data: dict):
    payload = {**data, "project_id": job_id, "trade": trade}
    _db().table("material_metadata").upsert(payload, on_conflict="project_id,trade").execute()


def upsert_labor_metadata(job_id: str, trade: str, data: dict):
    payload = {**data, "project_id": job_id, "trade": trade}
    _db().table("labor_metadata").upsert(payload, on_conflict="project_id,trade").execute()


def upsert_site_intelligence(job_id: str, data: dict):
    payload = {**data, "project_id": job_id}
    _db().table("site_intelligence").upsert(payload, on_conflict="project_id").execute()


def upsert_project_brief(job_id: str, brief_data: dict):
    payload = {**brief_data, "project_id": job_id}
    _db().table("project_briefs").upsert(payload, on_conflict="project_id").execute()


def upsert_pipeline_summary(job_id: str, data: dict):
    payload = {**data, "project_id": job_id}
    _db().table("pipeline_summaries").upsert(payload, on_conflict="project_id").execute()


# ---------------------------------------------------------------------------
# Line item CRUD
# ---------------------------------------------------------------------------

def add_material_item(job_id: str, data: dict) -> dict:
    payload = {**data, "project_id": job_id}
    rows = _db().table("material_items").insert(payload).execute()
    return rows[0]


def delete_material_item(job_id: str, item_id: str) -> bool:
    _db().table("material_items").delete().eq("item_id", item_id).eq("project_id", job_id).execute()
    return True


def add_labor_item(job_id: str, data: dict) -> dict:
    payload = {**data, "project_id": job_id}
    rows = _db().table("labor_items").insert(payload).execute()
    return rows[0]


def delete_labor_item(job_id: str, item_id: str) -> bool:
    _db().table("labor_items").delete().eq("item_id", item_id).eq("project_id", job_id).execute()
    return True


def update_material_item(job_id: str, item_id: str, data: dict) -> None:
    _db().table("material_items").update(data).eq("item_id", item_id).eq("project_id", job_id).execute()


def update_labor_item(job_id: str, item_id: str, data: dict) -> None:
    _db().table("labor_items").update(data).eq("item_id", item_id).eq("project_id", job_id).execute()


def recalculate_material_metadata(job_id: str):
    items = get_material_items(job_id)
    by_trade: dict[str, list[dict]] = {}
    for item in items:
        trade = item.get("trade", "Unknown")
        by_trade.setdefault(trade, []).append(item)

    for trade, trade_items in by_trade.items():
        total = sum(float(it.get("extended_cost_expected", 0) or 0) for it in trade_items)
        upsert_material_metadata(job_id, trade, {
            "total_material_cost": total,
            "total_cost_expected": total,
            "total_cost_low": sum(float(it.get("extended_cost_low", 0) or 0) for it in trade_items),
            "total_cost_high": sum(float(it.get("extended_cost_high", 0) or 0) for it in trade_items),
        })


def recalculate_labor_metadata(job_id: str):
    items = get_labor_items(job_id)
    by_trade: dict[str, list[dict]] = {}
    for item in items:
        trade = item.get("trade", "Unknown")
        by_trade.setdefault(trade, []).append(item)

    for trade, trade_items in by_trade.items():
        total = sum(float(it.get("cost_expected", 0) or 0) for it in trade_items)
        hours = sum(float(it.get("total_labor_hours", 0) or 0) for it in trade_items)
        upsert_labor_metadata(job_id, trade, {
            "total_labor_cost": total,
            "total_cost_expected": total,
            "total_labor_hours": hours,
            "total_cost_low": sum(float(it.get("cost_low", 0) or 0) for it in trade_items),
            "total_cost_high": sum(float(it.get("cost_high", 0) or 0) for it in trade_items),
        })


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def get_user_settings(user_id: str) -> dict | None:
    rows = _db().table("user_settings").select("*").eq("user_id", user_id).execute()
    return _first_or_none(rows)


def save_user_settings(user_id: str, settings_data: dict, onboarding_complete: bool | None = None):
    payload = {**settings_data, "user_id": user_id}
    if onboarding_complete is not None:
        payload["onboarding_complete"] = onboarding_complete
    _db().table("user_settings").upsert(payload, on_conflict="user_id").execute()


def get_project_overrides(job_id: str, user_id: str) -> dict | None:
    rows = (
        _db()
        .table("project_overrides")
        .select("*")
        .eq("project_id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    return _first_or_none(rows)


def save_project_overrides(job_id: str, user_id: str, overrides: dict):
    payload = {**overrides, "project_id": job_id, "user_id": user_id}
    _db().table("project_overrides").upsert(payload, on_conflict="project_id,user_id").execute()


# ---------------------------------------------------------------------------
# Sharing
# ---------------------------------------------------------------------------

def create_share(data: dict) -> dict:
    rows = _db().table("project_shares").insert(data).execute()
    return rows[0]


def get_shares_for_project(job_id: str) -> list[dict]:
    return _db().table("project_shares").select("*").eq("project_id", job_id).execute()


def get_share_by_token(token: str) -> dict | None:
    rows = _db().table("project_shares").select("*").eq("token", token).execute()
    return _first_or_none(rows)


def get_project_share(job_id: str, user_id: str) -> dict | None:
    rows = (
        _db()
        .table("project_shares")
        .select("*")
        .eq("project_id", job_id)
        .eq("shared_with_user_id", user_id)
        .execute()
    )
    return _first_or_none(rows)


def update_share_permission(share_id: int, permission: str):
    _db().table("project_shares").update({"permission": permission}).eq("id", share_id).execute()


def delete_share(share_id: int):
    _db().table("project_shares").delete().eq("id", share_id).execute()


def get_user_by_email(email: str) -> dict | None:
    result = _db().rpc("get_user_by_email", {"email_input": email})
    if isinstance(result, list):
        return _first_or_none(result)
    return result if result else None


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

def insert_scenario(scenario_id: str, job_id: str, user_id: str, name: str, context: str):
    _db().table("scenarios").insert({
        "id": scenario_id,
        "project_id": job_id,
        "user_id": user_id,
        "name": name,
        "context": context,
    }).execute()


def update_scenario(scenario_id: str, **kwargs):
    _db().table("scenarios").update(kwargs).eq("id", scenario_id).execute()


def get_scenarios(job_id: str) -> list[dict]:
    return _db().table("scenarios").select("*").eq("project_id", job_id).order("created_at", desc=True).execute()


def get_scenario_detail(scenario_id: str) -> dict | None:
    rows = _db().table("scenarios").select("*").eq("id", scenario_id).execute()
    return _first_or_none(rows)


def delete_scenario(scenario_id: str) -> dict:
    _db().table("scenario_material_items").delete().eq("scenario_id", scenario_id).execute()
    _db().table("scenario_labor_items").delete().eq("scenario_id", scenario_id).execute()
    _db().table("scenario_anomaly_flags").delete().eq("scenario_id", scenario_id).execute()
    _db().table("scenario_material_metadata").delete().eq("scenario_id", scenario_id).execute()
    _db().table("scenario_labor_metadata").delete().eq("scenario_id", scenario_id).execute()
    _db().table("scenarios").delete().eq("id", scenario_id).execute()
    return {"deleted": True, "children_deleted": True}


def insert_scenario_material_items(rows: list[dict]):
    _batch_insert("scenario_material_items", rows)


def insert_scenario_labor_items(rows: list[dict]):
    _batch_insert("scenario_labor_items", rows)


def insert_scenario_anomaly_flags(rows: list[dict]):
    _batch_insert("scenario_anomaly_flags", rows)


def upsert_scenario_material_metadata(scenario_id: str, trade: str, data: dict):
    payload = {**data, "scenario_id": scenario_id, "trade": trade}
    _db().table("scenario_material_metadata").upsert(payload, on_conflict="scenario_id,trade").execute()


def upsert_scenario_labor_metadata(scenario_id: str, trade: str, data: dict):
    payload = {**data, "scenario_id": scenario_id, "trade": trade}
    _db().table("scenario_labor_metadata").upsert(payload, on_conflict="scenario_id,trade").execute()


def delete_scenario_material_items(scenario_id: str, trade: str):
    _db().table("scenario_material_items").delete().eq("scenario_id", scenario_id).eq("trade", trade).execute()


def delete_scenario_labor_items(scenario_id: str, trade: str):
    _db().table("scenario_labor_items").delete().eq("scenario_id", scenario_id).eq("trade", trade).execute()


def delete_scenario_anomaly_flags(scenario_id: str, trade: str):
    _db().table("scenario_anomaly_flags").delete().eq("scenario_id", scenario_id).eq("trade", trade).execute()


# ---------------------------------------------------------------------------
# Subcontractors
# ---------------------------------------------------------------------------

def list_subcontractors(user_id: str) -> list[dict]:
    return _db().table("subcontractors").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()


def create_subcontractor(data: dict) -> dict:
    rows = _db().table("subcontractors").insert(data).execute()
    return rows[0]


def update_subcontractor(sub_id: str, data: dict):
    _db().table("subcontractors").update(data).eq("id", sub_id).execute()


def delete_subcontractor(sub_id: str, user_id: str) -> bool:
    _db().table("subcontractors").delete().eq("id", sub_id).eq("user_id", user_id).execute()
    return True


# ---------------------------------------------------------------------------
# Sub invites
# ---------------------------------------------------------------------------

def create_sub_invite(data: dict) -> dict:
    payload = {**data, "purpose": "bid_request"}
    rows = _db().table("project_shares").insert(payload).execute()
    return rows[0]


def list_sub_invites(job_id: str) -> list[dict]:
    return (
        _db()
        .table("project_shares")
        .select("*")
        .eq("project_id", job_id)
        .eq("purpose", "bid_request")
        .execute()
    )


def get_sub_invite_by_token(token: str) -> dict | None:
    rows = (
        _db()
        .table("project_shares")
        .select("*")
        .eq("token", token)
        .eq("purpose", "bid_request")
        .execute()
    )
    return _first_or_none(rows)


def submit_bid(data: dict) -> dict:
    rows = _db().table("sub_submissions").insert(data).execute()
    return rows[0]


def get_sub_bids(job_id: str) -> list[dict]:
    return _db().table("sub_submissions").select("*").eq("project_id", job_id).execute()


def get_sub_bids_by_trade(job_id: str, trade: str) -> list[dict]:
    return (
        _db()
        .table("sub_submissions")
        .select("*")
        .eq("project_id", job_id)
        .eq("trade", trade)
        .execute()
    )


def get_competitor_bids(token: str) -> dict:
    invite = get_sub_invite_by_token(token)
    if not invite:
        return {"invite": None, "bids": []}
    bids = get_sub_bids_by_trade(invite["project_id"], invite.get("trade", ""))
    return {"invite": invite, "bids": bids}


def claim_invite(token: str, user_id: str):
    _db().table("project_shares").update({"shared_with_user_id": user_id}).eq("token", token).execute()


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

def list_all_projects() -> list[dict]:
    return _db().table("projects").select("*").order("created_at", desc=True).execute()


def list_all_users() -> list[dict]:
    profiles = _db().table("profiles").select("*").execute()
    roles = _db().table("user_roles").select("*").execute()
    roles_by_user = {}
    for r in roles:
        uid = r.get("user_id")
        roles_by_user.setdefault(uid, []).append(r.get("role"))
    for p in profiles:
        p["roles"] = roles_by_user.get(p.get("id"), [])
    return profiles


def list_all_feedback() -> list[dict]:
    return _db().table("project_feedback").select("*").order("created_at", desc=True).execute()


def list_signup_tokens() -> list[dict]:
    return _db().table("signup_tokens").select("*").order("created_at", desc=True).execute()


def create_signup_token(token: str, created_by: str, label: str | None = None, expires_at: str | None = None) -> dict:
    payload: dict = {"token": token, "created_by": created_by}
    if label:
        payload["label"] = label
    if expires_at:
        payload["expires_at"] = expires_at
    rows = _db().table("signup_tokens").insert(payload).execute()
    return rows[0]


def get_signup_token(token: str) -> dict | None:
    rows = _db().table("signup_tokens").select("*").eq("token", token).execute()
    return _first_or_none(rows)


def claim_signup_token(token: str, user_id: str) -> bool:
    _db().table("signup_tokens").update({"claimed_by": user_id, "claimed": True}).eq("token", token).execute()
    return True


def revoke_signup_token(token_id: int) -> bool:
    _db().table("signup_tokens").update({"revoked": True}).eq("id", token_id).execute()
    return True


def check_user_is_admin(user_id: str) -> bool:
    rows = (
        _db()
        .table("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .eq("role", "admin")
        .execute()
    )
    return len(rows) > 0


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

def create_feedback(job_id: str, user_id: str, rating: str, message: str | None = None):
    payload: dict = {"project_id": job_id, "user_id": user_id, "rating": rating}
    if message is not None:
        payload["message"] = message
    _db().table("project_feedback").upsert(payload, on_conflict="project_id,user_id").execute()


def get_feedback(job_id: str, user_id: str) -> dict | None:
    rows = (
        _db()
        .table("project_feedback")
        .select("*")
        .eq("project_id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    return _first_or_none(rows)


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

def add_project_log(job_id: str, level: str, message: str):
    _db().table("project_logs").insert({
        "project_id": job_id,
        "level": level,
        "message": message,
    }).execute()


# ---------------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------------

def get_project_summary(job_id: str) -> dict | None:
    rows = _db().table("project_summaries").select("*").eq("project_id", job_id).execute()
    return _first_or_none(rows)


def save_trade_summary(job_id: str, summary: dict):
    payload = {"project_id": job_id, "trade_summary": json.dumps(summary) if not isinstance(summary, str) else summary}
    _db().table("project_summaries").upsert(payload, on_conflict="project_id").execute()


def save_overall_summary(job_id: str, summary: dict):
    payload = {"project_id": job_id, "overall_summary": json.dumps(summary) if not isinstance(summary, str) else summary}
    _db().table("project_summaries").upsert(payload, on_conflict="project_id").execute()
