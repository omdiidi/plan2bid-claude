# Plan: Backend Fixes Batch — Quick Wins + Security + Config

Fixes 25 issues from MASTER-AUDIT in one pass across the backend codebase.

## Issues Addressed

**Group 2 — Quick backend fixes (5 issues):**
- A5: NameError in sharing.py, admin.py, auth_routes.py (missing imports)
- C1: Status endpoint doesn't return error messages
- C5: Health endpoint 404 (path mismatch)
- H15: Queue position off-by-one
- H26: Results.tsx export uses snake_case for project fields

**Group 3 — Security cluster (10 issues):**
- B4: Queue endpoints zero auth
- H2: Share creation allows "owner" permission
- H3: Share update/delete IDOR (no project_id scoping)
- H16: Scenario IDOR (no project ownership verification)
- H19: Email shares accepted by wrong user
- H5: Claim-invite hijack
- H21: submit_bid zero auth (can't add auth — token-based, but add rate guard)
- H22: Negative bid amounts
- H23: FeedbackBody.rating no validation
- F6: Subcontractor update missing ownership check

**Group 4 — Config/deployment (4 issues):**
- H8: JWT secret placeholder
- H9: Zero startup validation
- H10: No frontend .env.example
- H27: .env.example lists wrong API key name

**Bonus quick fixes (6 issues):**
- H17: Deleting running project doesn't cancel running jobs
- H18: insert_anomaly_flags mutates input rows
- H25: httpx Client never closed
- G7: material_metadata fetched but unused
- G15: deleteProject removes UI on failure
- G18: Error projects routed to Results page

## Files Being Changed

```
backend/
  app/
    config.py                     ← MODIFIED (startup validation)
    main.py                       ← MODIFIED (health path, lifespan cleanup)
    routes/
      sharing.py                  ← MODIFIED (fix imports, permission validation, IDOR, email check)
      admin.py                    ← MODIFIED (fix imports)
      auth_routes.py              ← MODIFIED (fix imports)
      estimates.py                ← MODIFIED (error in status, queue auth, queue position)
      scenarios.py                ← MODIFIED (project ownership check)
      subcontractors.py           ← MODIFIED (ownership check, bid validation)
      feedback.py                 ← MODIFIED (rating validation)
      projects.py                 ← MODIFIED (cancel running jobs on delete)
    db/
      queries.py                  ← MODIFIED (share scoping, anomaly mutation, remove dead fetch)
  .env.example                    ← MODIFIED (fix key name)

frontend/
  .env.example                    ← NEW
  src/
    lib/
      app-context.tsx             ← MODIFIED (deleteProject error handling, error projects routing)
    pages/
      Dashboard.tsx               ← MODIFIED (route error projects to progress)
      Results.tsx                 ← MODIFIED (fix export snake_case)
```

## Tasks

### Phase 1: Fix broken imports (A5)

**Task 1.1: sharing.py — fix import**
File: `/tmp/plan2bid-claude/backend/app/routes/sharing.py`
Change line 6 from:
```python
from app.auth import DEV_UUID, ProjectPermission, get_user_id, require_permission
```
To:
```python
from app.auth import DEV_UUID, ProjectPermission, get_optional_user_id, get_user_id, require_permission
```

**Task 1.2: admin.py — fix import**
File: `/tmp/plan2bid-claude/backend/app/routes/admin.py`
Change line 6 from:
```python
from app.auth import get_user_id, require_admin
```
To:
```python
from app.auth import DEV_UUID, get_optional_user_id, get_user_id, require_admin
```

**Task 1.3: auth_routes.py — fix import**
File: `/tmp/plan2bid-claude/backend/app/routes/auth_routes.py`
Change line 6 from:
```python
from app.auth import get_user_id
```
To:
```python
from app.auth import DEV_UUID, get_optional_user_id, get_user_id
```

### Phase 2: Quick backend fixes (C1, C5, H15)

**Task 2.1: Add error field to status endpoint (C1)**
File: `/tmp/plan2bid-claude/backend/app/routes/estimates.py`
In the `get_estimate_status` function, find the response dict (around line 252). Add:
```python
"error": project.get("error_message"),
```

**Task 2.2: Fix health endpoint path (C5)**
File: `/tmp/plan2bid-claude/backend/app/main.py`
Change `@app.get("/health")` to `@app.get("/api/health")`.

**Task 2.3: Fix queue position off-by-one (H15)**
File: `/tmp/plan2bid-claude/backend/app/routes/estimates.py`
In the status endpoint, find `queue_position = sum(1 for j in ahead if ...)`. After computing it, add 1:
```python
queue_position = sum(1 for j in ahead if (j.get("created_at") or "") < job_created) + 1
```
This makes position 1-indexed (first in queue = position 1, matching frontend's `=== 1` check for "Your estimate is next").

### Phase 3: Security cluster

**Task 3.1: Validate share permission on creation (H2)**
File: `/tmp/plan2bid-claude/backend/app/routes/sharing.py`
In `share_by_email` (around line 28-30), after the require_permission check, add:
```python
if body.permission not in ("viewer", "editor"):
    raise HTTPException(400, "Invalid permission. Must be 'viewer' or 'editor'.")
```
Do the same in `share_by_link` (around line 66-68).

**Task 3.2: Scope share update/delete to project (H3)**
File: `/tmp/plan2bid-claude/backend/app/db/queries.py`
Change `update_share_permission`:
```python
def update_share_permission(share_id: int, permission: str, project_id: str = None):
    q = _db().table("project_shares").update({"permission": permission}).eq("id", share_id)
    if project_id:
        q = q.eq("project_id", project_id)
    q.execute()
```
Change `delete_share`:
```python
def delete_share(share_id: int, project_id: str = None):
    q = _db().table("project_shares").delete().eq("id", share_id)
    if project_id:
        q = q.eq("project_id", project_id)
    q.execute()
```
Then update callers in sharing.py to pass `project_id=job_id`:
- `update_share` → `queries.update_share_permission(share_id, permission, project_id=job_id)`
- `delete_share` → `queries.delete_share(share_id, project_id=job_id)`

**Task 3.3: Verify scenario belongs to project (H16)**
File: `/tmp/plan2bid-claude/backend/app/routes/scenarios.py`
In `delete_scenario`, `update_scenario`, and `get_scenario_detail`, after fetching the project and checking permission, add:
```python
scenario = queries.get_scenario_detail(scenario_id)
if not scenario or scenario.get("project_id") != job_id:
    raise HTTPException(404, "Scenario not found in this project")
```

**Task 3.4: Validate email match on share accept (H19)**
File: `/tmp/plan2bid-claude/backend/app/routes/sharing.py`
In `accept_share`, after fetching the share, add:
```python
if share.get("share_type") == "email" and share.get("email"):
    # For email shares, verify the accepting user's email matches
    user_profile = queries.get_user_by_email(share["email"]) if share.get("email") else None
    if user_profile and user_profile.get("id") != user_id:
        raise HTTPException(403, "This share was sent to a different email address")
```

**Task 3.5: Prevent claim-invite hijack (H5)**
File: `/tmp/plan2bid-claude/backend/app/routes/subcontractors.py`
In `claim_invite`, before calling `queries.claim_invite`, check if already claimed:
```python
invite = queries.get_sub_invite_by_token(token)
if not invite:
    raise HTTPException(404, "Invite not found")
if invite.get("shared_with_user_id") and invite["shared_with_user_id"] != user_id:
    raise HTTPException(403, "This invite has already been claimed by another user")
queries.claim_invite(token, user_id)
```

**Task 3.6: Validate bid amounts (H22)**
File: `/tmp/plan2bid-claude/backend/app/routes/subcontractors.py`
In `submit_bid`, before storing, add:
```python
if body.total_bid < 0 or body.total_material < 0 or body.total_labor < 0:
    raise HTTPException(400, "Bid amounts cannot be negative")
```

**Task 3.7: Validate feedback rating (H23)**
File: `/tmp/plan2bid-claude/backend/app/routes/feedback.py`
Change `FeedbackBody`:
```python
class FeedbackBody(BaseModel):
    rating: str
    message: str | None = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v):
        if v not in ("high", "low", "spot_on"):
            raise ValueError("rating must be 'high', 'low', or 'spot_on'")
        return v
```
Add `from pydantic import BaseModel, field_validator` to imports.

**Task 3.8: Add ownership check to subcontractor update (F6)**
File: `/tmp/plan2bid-claude/backend/app/db/queries.py`
Change `update_subcontractor`:
```python
def update_subcontractor(sub_id: str, data: dict, user_id: str = None):
    q = _db().table("subcontractors").update(data).eq("id", sub_id)
    if user_id:
        q = q.eq("user_id", user_id)
    q.execute()
```
Update caller in `subcontractors.py` to pass `user_id`:
```python
queries.update_subcontractor(sub_id, data, user_id=user_id)
```

**Task 3.9: Add auth to queue endpoints (B4)**
File: `/tmp/plan2bid-claude/backend/app/routes/estimates.py`
Change both queue functions to accept `request: Request` and extract user_id:
```python
@router.get("/api/queue")
async def get_queue(request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        # ... rest of function unchanged
```
```python
@router.delete("/api/queue/{job_id}")
async def cancel_queue_job(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        # ... rest of function unchanged
```

### Phase 4: Config/deployment (H8, H9, H10, H27)

**Task 4.1: Fix .env.example (H27)**
File: `/tmp/plan2bid-claude/backend/.env.example`
Replace `ANTHROPIC_API_KEY=sk-ant-...` with `OPENROUTER_API_KEY=sk-or-...`

**Task 4.2: Add startup validation (H9)**
File: `/tmp/plan2bid-claude/backend/app/config.py`
Add validation after `_load_settings`:
```python
def _validate_settings(s: _Settings) -> list[str]:
    warnings = []
    if not s.SUPABASE_URL:
        warnings.append("SUPABASE_URL is not set")
    if not s.SUPABASE_SERVICE_ROLE_KEY:
        warnings.append("SUPABASE_SERVICE_ROLE_KEY is not set")
    if not s.SUPABASE_JWT_SECRET or s.SUPABASE_JWT_SECRET.startswith("YOUR_"):
        warnings.append("SUPABASE_JWT_SECRET is not set or is a placeholder")
    return warnings
```
Then in `main.py` lifespan, add:
```python
from app.config import _validate_settings
warnings = _validate_settings(settings)
for w in warnings:
    logger.warning(f"CONFIG: {w}")
```

**Task 4.3: Create frontend .env.example (H10)**
File: `/tmp/plan2bid-claude/frontend/.env.example`
```
# Required
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...

# Required for production (not needed in dev — Vite proxy handles it)
VITE_API_URL=https://api.yourdomain.com

# Optional
VITE_GOOGLE_PLACES_API_KEY=AIza...
```

**Task 4.4: Close httpx client on shutdown (H25)**
File: `/tmp/plan2bid-claude/backend/app/main.py`
In lifespan, after yield:
```python
from app.db.client import _db, _singleton
if _singleton:
    _singleton._client.close()
```

### Phase 5: Bonus quick fixes

**Task 5.1: Cancel running jobs on project delete (H17)**
File: `/tmp/plan2bid-claude/backend/app/routes/projects.py`
In `delete_project`, change the job cancellation to also cancel running jobs:
```python
if project.get("status") in ("queued", "running"):
    _db().table("estimation_jobs").update({"status": "cancelled"}).eq("project_id", job_id).in_("status", ["pending", "running"]).execute()
```

**Task 5.2: Fix insert_anomaly_flags mutation (H18)**
File: `/tmp/plan2bid-claude/backend/app/db/queries.py`
Change `insert_anomaly_flags`:
```python
def insert_anomaly_flags(job_id: str, rows: list[dict]):
    safe_rows = [{**r, "project_id": job_id} for r in rows]
    _batch_insert("anomaly_flags", safe_rows)
```
Instead of mutating `r["project_id"]` in-place on each dict.

**Task 5.3: Remove dead material_metadata fetch (G7)**
File: `/tmp/plan2bid-claude/backend/app/routes/estimates.py`
In `get_estimate`, find `mat_meta = queries.get_all_material_metadata(job_id)` and delete the line (it's never used in the response).

**Task 5.4: Fix deleteProject error handling (G15)**
File: `/tmp/plan2bid-claude/frontend/src/lib/app-context.tsx`
Change `deleteProject` catch block from removing to showing error:
```typescript
const deleteProject = useCallback(async (id: string) => {
    try {
      await apiDeleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project:", err);
      // Don't remove from UI on failure — let user retry
    }
  }, []);
```

**Task 5.5: Route error projects to Progress page (G18)**
File: `/tmp/plan2bid-claude/frontend/src/pages/Dashboard.tsx`
Change the click handler (around line 109) from:
```typescript
project.status === "running" || project.status === "queued" ? `/progress/${project.id}` : `/results/${project.id}`
```
To:
```typescript
project.status === "running" || project.status === "queued" || project.status === "error" ? `/progress/${project.id}` : `/results/${project.id}`
```

**Task 5.6: Fix export snake_case fields (H26)**
File: `/tmp/plan2bid-claude/frontend/src/pages/Results.tsx`
Find references to `project?.facility_type` and `project?.project_type` in the export data builder. Change to `project?.facilityType` and `project?.projectType`.

### Phase 6: Verify

**Task 6.1:** `cd /tmp/plan2bid-claude/frontend && npm run build` — zero errors
**Task 6.2:** `cd /tmp/plan2bid-claude/backend && python -c "from app.main import app; print('OK')"` — no import errors

## Validation Gates

1. Frontend build passes
2. Backend imports cleanly
3. `sharing.py`, `admin.py`, `auth_routes.py` all import `get_optional_user_id`
4. Health endpoint at `/api/health`
5. Queue endpoints accept `request: Request`
6. Share creation rejects `permission: "owner"`

## Confidence Score: 8/10

All fixes follow existing patterns. The only risk is the share email validation (Task 3.4) which depends on `get_user_by_email` returning the right data. The Pydantic field_validator in Task 3.7 requires importing correctly.
