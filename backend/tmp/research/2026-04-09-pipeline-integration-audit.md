---
date: 2026-04-09T21:42:38Z
researcher: omidzahrai
git_commit: (no commits yet)
branch: main
repository: plan2bid-claude
topic: "Full-Stack Pipeline Integration Audit"
tags: [research, codebase, integration, api-contracts, state-machine, worker, supabase]
status: complete
last_updated: 2026-04-09
last_updated_by: omidzahrai
---

# Research: Full-Stack Pipeline Integration Audit

**Date**: 2026-04-09T21:42:38Z
**Researcher**: omidzahrai
**Branch**: main
**Repository**: plan2bid-claude + plan2bid-worker + claude-dotfiles

## Research Question
Audit the plan2bid full-stack pipeline for integration bugs, data contract mismatches, and missing error handling across: Backend, Frontend, Worker, and Skills.

## Summary

13 parallel research agents audited the complete pipeline. Findings organized into 4 focus areas with 60+ distinct issues found.

---

## Focus 1: Frontend-Backend API Contract

37 endpoints audited. 28 have mismatches between frontend TypeScript types and backend Python responses.

### Critical Mismatches (will crash at runtime)

| Endpoint | Frontend Expects | Backend Returns | Impact |
|----------|-----------------|-----------------|--------|
| All sharing.py endpoints | calls `get_optional_user_id` | Not imported -> NameError | 500 on every request |
| All admin.py endpoints | calls `get_optional_user_id` | Not imported -> NameError | 500 on every request |
| All auth_routes.py endpoints | calls `get_optional_user_id` | Not imported -> NameError | 500 on every request |
| POST feedback | JSON body, no Content-Type | Pydantic expects application/json | 422 Unprocessable |
| GET /api/health | `/api/health` | Registered at `/health` | 404 |

### Data Shape Mismatches

| Endpoint | Frontend Type | Backend Response | Diff |
|----------|-------------|-----------------|------|
| GET status/{id} | `error?: string` | No `error` field | Error messages lost |
| GET status/{id} | `logs.timestamp: number` | ISO string | Type mismatch |
| POST shares/accept | `{status: "accepted"}` | `{accepted: true}` | Accept never works |
| GET sub-bids | `{bids_by_trade: ...}` | Flat array | Wrapper missing |
| GET competitors | `{competitors: ...}` | Flat array | Wrapper missing |
| GET admin/users | `role: string` | `roles: string[]` | Singular vs plural |
| GET admin/users | `runs_total, runs_today` | Not computed | Always undefined |
| GET admin/tokens | `used_by, used_at, is_active` | `claimed_by, claimed, revoked` | Field name mismatch |
| DELETE scenario | `children_deleted: number` | `children_deleted: true` | Type mismatch |
| PATCH scenario | `{scenario_id, updated, regenerating}` | `{updated: true}` | Missing fields |
| PUT settings | Sends `{settings: {...}}` | Stores nested without unwrapping | Double-nested |
| PUT overrides | Sends `{overrides: {...}}` | Stores nested without unwrapping | Double-nested |
| POST validate-token | Error in field `error` | Error in field `reason` | Field name |
| GET queue | `running: {job_id: string}` | `running: string` (bare) | Wrapper missing |
| POST add material | `unit_cost` | DB column `unit_cost_expected` | Field name |
| POST add labor | `hours, hourly_rate` | DB cols `total_labor_hours, blended_hourly_rate` | Field name |

### Backend Stubs (501)

Export, documents (list/pdf/page/search), chat, token-usage -- all return 501.

---

## Focus 2: Save Script -> Backend Read Path

### Tables Written but Never Read by Results Page

| Table | Written by | Lines Written | Read by Results? |
|-------|-----------|---------------|-----------------|
| extraction_items | save_estimate.py:21-24 | ~17 cols per item | NO |
| material_metadata | save_estimate.py:45-55 | 9 cols | Fetched but variable UNUSED |
| site_intelligence | save_estimate.py:90-93 | pass-through | NO |
| project_briefs | save_estimate.py:96-99 | pass-through | NO |
| pipeline_summaries | save_estimate.py:102-109 | 1 JSONB col | NO |

### Fields Read but Never Written

| Table | Field Read | Read Location | Schema Column | Writer |
|-------|-----------|--------------|---------------|--------|
| extraction_metadata | `total_documents` | estimates.py:328 | `documents_searched` | NEVER WRITTEN |
| extraction_metadata | `total_pages` | estimates.py:329 | `pages_searched` | NEVER WRITTEN |
| extraction_metadata | `parsing_warnings` | estimates.py:341 | `warnings` | NEVER WRITTEN |
| material_items | `material_description` | estimates.py:64 | Column exists | NOT in _to_material_row |
| scenario_material_items | `material_description` | scenarios.py:62 | Column exists | NOT in _to_scenario_material_row |
| scenario_labor_items | `source_refs` | scenarios.py:78 | Column exists | NOT in _to_scenario_labor_row |

### Semantic Mismatches

- `labor_cost` vs `cost_expected`: save_estimate writes BOTH fields. Backend reads only `cost_expected`. If they differ in agent output, wrong value used.
- BLS data: save_estimate writes `bls_area_used` as top-level column. Backend ignores it, reads `bls_wage_data.area_name` from JSONB instead.
- `projects.warnings`: save_estimate.py:120 writes this, but column DOES NOT EXIST in schema.
- Scenario ID: scenarios.py:91 generates `scn_{hex}` text. `scenarios.id` is UUID. Insert will fail.

---

## Focus 3: Supabase Client Wrapper

### _QueryBuilder Dead Code
- `_filters` (line 17): Declared, never read
- `_select_cols` (line 18): Assigned by `select()`, never read
- `_order_col`, `_order_desc` (lines 19-20): Never read; ordering goes through `_params["order"]`

### Filter Collision
`.eq()` stores filters in a dict keyed by column name. Two `.eq()` calls on the same column = second overwrites first. Not exploited today but prevents range queries on same column.

### DELETE Returns Nothing
`execute()` always returns `[]` for DELETE (line 102-103). Callers cannot distinguish "deleted 1 row" from "deleted 0 rows". All delete functions return hardcoded `True`.

### Blocking I/O on Async Event Loop
Every `async def` route handler calls synchronous `httpx.Client` methods. FastAPI runs `async def` handlers on the event loop thread. Each DB call blocks the entire event loop for up to 30 seconds. This means: while one request waits for Supabase, ALL other requests are blocked.

### Singleton Not Thread-Safe
`_db()` uses check-then-set without lock. Under concurrent startup, two instances could be created. Practically harmless under CPython GIL.

---

## Focus 4: Project Status State Machine

### projects.status Transitions

```
queued (estimates.py:184)
  -> running (worker.py:152)
    -> completed (save_estimate.py:117)
    -> error (worker.py:189,197)
```

No transition from error/completed back. No direct queued->error.

### projects.stage -- Only 2 of 7 Stages Ever Written

Frontend expects 7 stages: ingestion, parsing, classification, brief, extraction, context, pricing_labor

Backend writes: queued (estimates.py:185), ingestion (worker.py:152), extraction (worker.py:167)

**5 stages are NEVER written**: parsing, classification, brief, context, pricing_labor

Progress only reaches 10% before stalling until completion.

### estimation_jobs.status Transitions

```
pending -> running -> completed/error
pending -> cancelled (user cancel, project delete, expiry)
running -> pending (stale reaper at 35min, startup recovery)
```

The running->pending requeue creates a loop for jobs that take >35 min.

### Critical Race: save_estimate.py vs Worker

1. save_estimate.py sets `projects.status = "completed"` (line 117)
2. Claude Code exits, shell script runs `touch _done` (worker.py:116)
3. Worker sees _done, sets `estimation_jobs.status = "completed"` (worker.py:178)

If save_estimate.py CRASHES:
- Claude Code still exits (non-zero)
- Shell still runs `touch _done`
- Worker sees _done, marks estimation_jobs as "completed"
- But projects.status is still "running"
- Frontend polls projects.status, sees "running" forever

### Frontend Checks for Invalid Status Values

- Progress.tsx:76-91: Checks for `"failed"` -- DB only has `"error"`
- utils.ts:28-37: Handles `"partial"` -- not a valid DB status

### Scenario Status Gap

Worker sets scenarios.status to "running" and "error". Nobody in the provided codebase sets it to "completed" -- that's presumably done by the save-scenario-to-db Claude Code skill, which calls save_scenario.py line 64.

---

## Additional Findings (from extended research)

### Database Schema vs Code

- `project_shares` column names: Code uses `token`, `shared_by_user_id`, `email`. Schema has `share_token`, `invited_by`, `shared_with_email`.
- `signup_tokens`: Code writes `claimed_by`/`claimed`. Schema has `used_by`/`is_active`.
- `accepted_at = "now()"`: Stored as LITERAL STRING "now()", not a timestamp.
- Settings dual-write: Frontend writes `user_preferences` table directly. Backend writes `user_settings` table. These never sync.

### Worker Lifecycle

- SIGTERM not handled: launchd stop leaves job in "running" with no cleanup
- Reaper runs on all workers: All workers reap all jobs. Duplicate reap attempts.
- Reaper can requeue THIS worker's active job after 35 min, causing duplicate execution
- scenario_context prompt injection: User-supplied text injected into Claude prompt with --dangerously-skip-permissions
- Zip bomb: No size/path validation on extractall
- httpx.Client never closed: Stale connections in long-running daemon

### Frontend Edge Cases

- Progress.tsx:585: `status.warnings.length` crashes when status is null
- Dashboard.tsx:15: `recentProjects` not sorted by date
- Dashboard.tsx:109: Error/partial projects route to Results (which may crash)
- NewEstimate.tsx:360-409: `isSubmitting` never reset on success path
- app-context.tsx:179-187: `deleteProject` removes from UI even on API failure
- app-context.tsx:159-173: Project fetch error silently swallowed, shows empty state

---

## Code References

### Backend Routes
- `backend/app/routes/estimates.py` -- estimate CRUD, status, queue, validation, summaries
- `backend/app/routes/projects.py` -- project CRUD
- `backend/app/routes/scenarios.py` -- scenario CRUD
- `backend/app/routes/sharing.py` -- project sharing (broken imports)
- `backend/app/routes/admin.py` -- admin endpoints (broken imports)
- `backend/app/routes/auth_routes.py` -- signup tokens (broken imports)
- `backend/app/routes/feedback.py` -- feedback (missing Content-Type)
- `backend/app/routes/settings.py` -- settings/overrides
- `backend/app/routes/subcontractors.py` -- subcontractor CRUD, bid invites

### Database Layer
- `backend/app/db/client.py` -- _QueryBuilder, _SupabaseDB, _StorageClient
- `backend/app/db/queries.py` -- 60+ query functions across 17 tables
- `backend/app/auth.py` -- JWT verification, permission checks, DEV_UUID

### Worker
- `plan2bid-worker/worker.py` -- job polling, claiming, Terminal launch, heartbeat, reapers
- `plan2bid-worker/save_estimate.py` -- 11-table write
- `plan2bid-worker/save_scenario.py` -- 6-table write
- `plan2bid-worker/supabase_client.py` -- PostgREST HTTP helper

### Skills
- `~/.claude-dotfiles/commands/plan2bid/run.md` -- core estimation engine
- `~/.claude-dotfiles/commands/plan2bid/save-to-db.md` -- calls save_estimate.py
- `~/.claude-dotfiles/commands/plan2bid/save-scenario-to-db.md` -- calls save_scenario.py

### Frontend
- `frontend/src/lib/api.ts` -- all API functions and type declarations
- `frontend/src/types/index.ts` -- TypeScript type definitions
- `frontend/src/pages/Progress.tsx` -- status polling and stage visualization
- `frontend/src/pages/Results.tsx` -- estimate results display
- `frontend/src/pages/Dashboard.tsx` -- project list
- `frontend/src/pages/NewEstimate.tsx` -- estimate submission form
- `frontend/src/lib/app-context.tsx` -- global state management
