# Plan: Merge Production UI + Add Missing Backend Endpoints

## Goal
Replace the local frontend with the production frontend from `github.com/nkpardon8-prog/OFFICIAL-ESTIM8R/bid-buddy/`, preserve 5 critical local bug fixes, keep DocumentChat/DocumentViewer disabled, and add the 3 missing backend PATCH endpoints that production's UI calls.

## Why
The local frontend diverged from production during development. Production has ~3000+ lines of features (inline editing, export popover, sub-bid comparison, dark mode, markup/waste/tax management) that local is missing. Local has 5 surgical bug fixes (~45 lines total) that production doesn't. The merge strategy is: production as base, re-apply local fixes.

## Reference
- Master audit: `./tmp/MASTER-AUDIT.md`
- Codex review: conversation history (4-agent review confirming merge strategy)
- Production repo: `github.com/nkpardon8-prog/OFFICIAL-ESTIM8R` (directory: `bid-buddy/`)

---

## Files Being Changed

```
frontend/
  src/
    lib/
      api.ts                    ← REPLACED from production, then 5 surgical edits
      app-context.tsx            ← REPLACED from production, then 1 surgical edit
      state-tax-rates.ts         ← NEW (from production)
      transformers.ts            ← NEW (from production)
    pages/
      Results.tsx                ← REPLACED from production, then 2 edits (disable docs, keep re-run)
      Progress.tsx               ← REPLACED from production
      NewEstimate.tsx            ← REPLACED from production
      Dashboard.tsx              ← REPLACED from production
      (all other pages)          ← REPLACED from production
    components/
      results/
        GCOverviewSubBids.tsx    ← NEW (from production)
        SubBidDetailModal.tsx    ← NEW (from production)
        (all other components)   ← REPLACED from production
    App.tsx                      ← REPLACED from production, then 1 edit (enhanced ErrorBoundary)
    types/
      index.ts                   ← REPLACED from production
  package.json                   ← REPLACED from production

backend/
  app/
    routes/
      estimates.py               ← MODIFIED (add 2 PATCH endpoints)
      projects.py                ← MODIFIED (add 1 PATCH endpoint)
    db/
      queries.py                 ← MODIFIED (add 3 query functions)
```

---

## Architecture Overview

This is a **replace-then-patch** operation:

1. Clone production `bid-buddy/src/` and `bid-buddy/package.json` over the local frontend
2. Apply 5 targeted edits to fix known bugs in production code that crash against this backend
3. Comment out DocumentChat/DocumentViewer (backend stubs return 501)
4. Add 3 PATCH endpoints to the backend that production's inline editing UI calls

The frontend changes are 95% "copy from production" and 5% "re-apply local fixes." The backend changes are new code following existing patterns.

---

## Key Pseudocode

### Fix 1: Selective auth-expired in api.ts `request()` function

Production code (WRONG for this backend):
```typescript
if (res.status === 401) {
  if (import.meta.env.DEV) console.warn(`[Estim8r] ${res.status} on ${path} — session may be expired`);
  window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
}
```

Replace with:
```typescript
if (res.status === 401) {
  const isAuthCritical = !path.includes("match-presets") && !path.includes("summary") && !path.includes("polish") && !path.includes("validate") && !path.includes("transcribe");
  if (isAuthCritical) {
    if (import.meta.env.DEV) console.warn(`[Estim8r] 401 on ${path} — session expired`);
    window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
  } else {
    if (import.meta.env.DEV) console.warn(`[Estim8r] 401 on ${path} — ignored (non-critical)`);
  }
}
```

### Fix 2: Catch 403 on createEstimate in api.ts

Production code:
```typescript
if (res.status === 401) {
```

Replace with (in `createEstimate` function only):
```typescript
if (res.status === 401 || res.status === 403) {
```

This appears in the `createEstimate` function around line 108.

### Fix 3: Unwrap 3 API functions in api.ts

These 3 functions in production expect wrapped responses that this backend doesn't send:

**getScenarios** — Production:
```typescript
const res = await request<{ scenarios: Scenario[] }>(`/projects/${projectId}/scenarios`);
return res.scenarios;
```
Replace with:
```typescript
return request<Scenario[]>(`/projects/${projectId}/scenarios`);
```

**getProjectFeedback** — Production:
```typescript
const res = await request<{ feedback: ProjectFeedback | null }>(`/projects/${projectId}/feedback`);
return res.feedback;
```
Replace with:
```typescript
return request<ProjectFeedback | null>(`/projects/${projectId}/feedback`);
```

**getProjectOverrides** — Production:
```typescript
const res = await request<{ overrides: ProjectOverrides }>(`/projects/${projectId}/overrides`);
return res.overrides;
```
Replace with:
```typescript
return request<ProjectOverrides>(`/projects/${projectId}/overrides`);
```

### Fix 4: Null-safe settings merge in app-context.tsx

Production code:
```typescript
const merged = { ...defaultSettings, ...(data.settings as Partial<Settings>) };
```

Replace with:
```typescript
const raw = (data.settings || {}) as Record<string, unknown>;
const merged = { ...defaultSettings };
for (const key of Object.keys(raw)) {
  if (raw[key] !== null && raw[key] !== undefined) {
    (merged as any)[key] = raw[key];
  }
}
```

### Fix 5: Add Content-Type headers to 3 JSON-body functions in api.ts

Production `submitFeedback`, `saveProjectOverrides`, and `saveUserSettings` all send `body: JSON.stringify(...)` without `Content-Type: application/json`. FastAPI's Pydantic body parsing requires this header. Add to each:
```typescript
headers: { "Content-Type": "application/json" },
```

Functions to fix:
- `submitFeedback` (~line 590)
- `saveProjectOverrides` (~line 673) -- note: currently unused by Results.tsx which uses supabase-settings.ts directly, but fix for correctness
- `saveUserSettings` (~line 688)

### Fix 6: Enhanced ErrorBoundary in App.tsx

Production has a simple `{ hasError: boolean }` state. Replace ErrorBoundary with one that captures and displays `errorMessage` and `errorStack`:

```typescript
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string; errorStack: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message, errorStack: error.stack || "" };
  }
  // ... render includes error details panel
}
```

### Fix 6: Comment out DocumentChat/DocumentViewer in Results.tsx

After copying production's Results.tsx, comment out the imports and usages:
```typescript
// TODO: Rebuild DocumentChat with Google embeddings
// import DocumentChat from "@/components/results/DocumentChat";
// TODO: Rebuild DocumentViewer when document storage is wired up
// import DocumentViewer from "@/components/results/DocumentViewer";
```

And comment out their JSX usage in the render (search for `<DocumentChat` and `<DocumentViewer`).

### Backend: PATCH material item endpoint

Follow the existing `add_material_item` / `delete_material_item` pattern in estimates.py.

**IMPORTANT**: The route param `item_id` is the TEXT identifier (e.g., "ELEC-001"), NOT the DB row `id` (bigint PK). The query must filter on `.eq("item_id", item_id)` to match the text column. The existing `delete_material_item` in queries.py uses `.eq("id", item_id)` which may be incorrect -- audit and fix if needed.

**IMPORTANT**: Whitelist allowed update fields. The frontend only sends `material_description` and `description` for materials, `description` for labor. Filter out dangerous columns (`id`, `project_id`, `item_id`, `trade`) to prevent accidental overwrites.

```python
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
        raise HTTPException(500, f"Failed to update material item: {e}")
```

### Backend: PATCH labor item endpoint

```python
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
        raise HTTPException(500, f"Failed to update labor item: {e}")
```

### Backend: PATCH project name endpoint

```python
@router.patch("/api/projects/{job_id}/name")
async def rename_project(job_id: str, request: Request):
    try:
        user_id = get_optional_user_id(request) or DEV_UUID
        project = queries.get_project_by_id(job_id)
        if not project:
            raise HTTPException(404, "Project not found")
        require_permission(project, user_id, ProjectPermission.EDITOR)

        body = await request.json()
        new_name = (body.get("project_name") or "").strip()
        if not new_name:
            raise HTTPException(400, "Project name cannot be empty")
        queries.update_project(job_id, project_name=new_name)
        return {"project_name": new_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to rename project: {e}")
```

### Backend: Query functions in queries.py

```python
def update_material_item(job_id: str, item_id: str, data: dict) -> None:
    # NOTE: filter on "item_id" column (text identifier), NOT "id" (bigint PK)
    _db().table("material_items").update(data).eq("item_id", item_id).eq("project_id", job_id).execute()

def update_labor_item(job_id: str, item_id: str, data: dict) -> None:
    _db().table("labor_items").update(data).eq("item_id", item_id).eq("project_id", job_id).execute()
```

Note: `update_project` already exists at queries.py:65 using `**kwargs`, so `rename_project` just calls `queries.update_project(job_id, project_name=new_name)`.

**MANDATORY FIX**: The existing `delete_material_item` at queries.py:202 uses `.eq("id", item_id)` where `id` is the bigint PK, but the frontend passes text identifiers like "ELEC-001". This query silently matches nothing. Change to `.eq("item_id", item_id)`. Same fix needed for `delete_labor_item` at queries.py:213.

---

## Tasks (in order)

### Phase 0: Rollback safety

**Task 0.1: Create a backup branch before starting**
- Run `cd /tmp/plan2bid-claude && git add -A && git stash` or create a named branch
- This ensures the entire frontend can be reverted if the merge goes wrong

### Phase 1: Clone production frontend

**Task 1.1: Fetch production frontend files**
- Clone or download `bid-buddy/src/` from `github.com/nkpardon8-prog/OFFICIAL-ESTIM8R`
- Also fetch `bid-buddy/package.json`
- Use `gh api` to download files or `git clone --depth 1` the repo to a temp location

**Task 1.2: Replace local frontend src/**
- Delete contents of `/tmp/plan2bid-claude/frontend/src/`
- Copy production `bid-buddy/src/` into `/tmp/plan2bid-claude/frontend/src/`
- Copy production `bid-buddy/package.json` to `/tmp/plan2bid-claude/frontend/package.json`
- Verify these production-only files are present after copy:
  - `src/lib/state-tax-rates.ts` (NEW)
  - `src/lib/transformers.ts` (NEW)
  - `src/lib/export/exportIndustryXlsx.ts` (NEW, replaces exportCsv.ts)
  - `src/components/results/GCOverviewSubBids.tsx` (NEW)
  - `src/components/results/SubBidDetailModal.tsx` (NEW)
  - `src/components/ui/ExportPopover.tsx` (NEW)

**Task 1.3: Install dependencies**
- Run `cd /tmp/plan2bid-claude/frontend && npm install`
- This picks up any new production deps (exceljs, file-saver, etc.)

### Phase 2: Apply the 5+1 local fixes to the production frontend

**Task 2.1: Fix api.ts — selective auth-expired handling**
- In the `request()` function, find the `if (res.status === 401)` block
- Replace the simple dispatch with the selective `isAuthCritical` check (see pseudocode Fix 1)

**Task 2.2: Fix api.ts — catch 403 on createEstimate**
- In the `createEstimate()` function, find `if (res.status === 401)`
- Change to `if (res.status === 401 || res.status === 403)`

**Task 2.3: Fix api.ts — unwrap 3 response functions**
- Find `getScenarios`, change from `res.scenarios` pattern to direct `request<Scenario[]>()` call
- Find `getProjectFeedback`, change from `res.feedback` pattern to direct `request<ProjectFeedback | null>()` call
- Find `getProjectOverrides`, change from `res.overrides` pattern to direct `request<ProjectOverrides>()` call

**Task 2.4: Fix app-context.tsx — null-safe settings merge**
- Find the settings merge line (should be like `const merged = { ...defaultSettings, ...(data.settings...`) 
- Replace with the null-safe loop that skips null/undefined values (see pseudocode Fix 4)

**Task 2.5: Fix App.tsx — enhanced ErrorBoundary (keep ThemeProvider)**
- Production's App.tsx wraps everything in `<ThemeProvider>` from `next-themes` -- KEEP this (it enables dark mode)
- Replace ONLY the ErrorBoundary class: swap the simple `{ hasError: boolean }` state with the enhanced version that captures errorMessage and errorStack
- Do NOT remove the ThemeProvider wrapper
- Note: `next-themes` is already in package.json so the import will resolve

**Task 2.6: Fix api.ts — add Content-Type headers**
- Add `headers: { "Content-Type": "application/json" },` to `submitFeedback`, `saveProjectOverrides`, and `saveUserSettings` functions

**Task 2.7: Add dark-mode script to index.html**
- Do NOT replace `index.html` wholesale (local has branding changes from commit e9ab8c8)
- Add this script to `<head>` to prevent white flash on dark mode:
  ```html
  <script>try{if(localStorage.getItem('plan2bid-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}</script>
  ```

**Task 2.8: Fix Results.tsx — disable DocumentChat/DocumentViewer**
- Comment out the imports for DocumentChat and DocumentViewer with TODO notes
- Comment out their JSX usage in the render method
- Search for `<DocumentChat` and `<DocumentViewer` in the JSX and comment them out

### Phase 3: Add missing backend PATCH endpoints

**Task 3.1: Add update queries + fix existing delete queries in queries.py**
- Add `update_material_item` and `update_labor_item` after the existing `delete_labor_item` function
- Two simple functions using `.update(data).eq("item_id", item_id).eq("project_id", job_id)`
- **ALSO FIX**: Change `delete_material_item` from `.eq("id", item_id)` to `.eq("item_id", item_id)` (line 202)
- **ALSO FIX**: Change `delete_labor_item` from `.eq("id", item_id)` to `.eq("item_id", item_id)` (line 213)

**Task 3.2: Add PATCH /api/estimate/{job_id}/material/{item_id} to estimates.py**
- Add after the existing `add_labor_item` endpoint (~line 451)
- Follow the same auth/permission pattern as `add_material_item`
- Call `queries.update_material_item()` + `queries.recalculate_material_metadata()`
- Return `{"updated": True, "item_id": item_id, "fields": list(body.keys())}`

**Task 3.3: Add PATCH /api/estimate/{job_id}/labor/{item_id} to estimates.py**
- Same pattern as material PATCH

**Task 3.4: Add PATCH /api/projects/{job_id}/name to projects.py**
- Follow the existing `delete_project` auth pattern
- Read `project_name` from body
- Call `queries.update_project(job_id, project_name=new_name)` (function already exists)
- Return `{"project_name": new_name}`

### Phase 3.5: Cleanup

**Task 3.5.1: Delete _backup/ directory**
- Remove `/tmp/plan2bid-claude/frontend/src/_backup/` if it exists (dead code from prior sessions)

**Task 3.5.2: Do NOT replace config files**
- `vite.config.ts`, `tsconfig.*.json`, `tailwind.config.ts`, `postcss.config.js`, `eslint.config.js`, `components.json` — leave these as-is (already in sync between local and production)
- Only `src/` and `package.json` are replaced

### Phase 4: Verify build

**Task 4.1: Build frontend**
- Run `cd /tmp/plan2bid-claude/frontend && npm run build`
- Fix any TypeScript or import errors
- Common issues: missing type exports, changed component prop interfaces

**Task 4.2: Start backend and verify endpoints**
- Start the FastAPI server
- Test `PATCH /api/estimate/{job_id}/material/{item_id}` with a curl
- Test `PATCH /api/estimate/{job_id}/labor/{item_id}` with a curl
- Test `PATCH /api/projects/{job_id}/name` with a curl

---

## Deprecated Code (to remove)

After the merge, these local-only files/code are no longer needed:
- Inline `lineItemToMaterial` and `lineItemToLabor` functions inside Results.tsx (replaced by `@/lib/transformers.ts`)
- `exportCsv.ts` if production's `exportIndustryXlsx.ts` replaces it (verify first)
- `_backup/` directory in frontend/src/ if it exists (old Results.tsx backup)

---

## Validation Gates

1. **Build passes**: `npm run build` in frontend succeeds with zero errors
2. **Backend starts**: `uvicorn app.main:app` starts without import errors
3. **PATCH endpoints respond**: `curl -X PATCH .../material/test-id` returns 404 (project not found) not 405 (method not allowed)
4. **Results page loads**: Opening a completed project doesn't crash (the 3 unwrapped API fixes work)
5. **Settings load**: Opening settings doesn't crash (null-safe merge works)
6. **Dark mode toggles**: ThemeProvider is working (toast themes match)

---

## Confidence Score: 8/10

High confidence because:
- Production frontend is a known-working codebase (it's deployed)
- The 5 local fixes are precisely identified with exact code
- Backend PATCH endpoints follow existing patterns exactly
- The only risk is unexpected TypeScript errors from production code referencing things we haven't accounted for — but `npm run build` will catch these immediately

The -2 is for:
- Possible production components that reference APIs not yet verified
- `exportIndustryXlsx` may have dependencies we haven't checked
