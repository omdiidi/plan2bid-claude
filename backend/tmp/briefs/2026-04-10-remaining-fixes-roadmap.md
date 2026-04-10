# Brief: Remaining Fixes Roadmap — 58 Open Issues in 6 Runs

## Why
58 issues remain open from the MASTER-AUDIT after fixing 33. They span 3 codebases (this backend/frontend, the worker repo, and the skills repo). Grouping them into effective runs minimizes context switching and respects dependencies.

## The 6 Runs

---

### RUN 1: Backend API Contracts + Column Names (this codebase)
**Effort:** Medium | **Files:** 6 backend files + 1 frontend type file
**Why first:** These are all in this codebase, independent of worker, and some block UI features.

| ID | Issue |
|----|-------|
| C3 | Sub-bids response flat array vs `{bids_by_trade}` wrapper |
| C4 | Admin users `roles` vs `role`, missing `runs_total`/`runs_today` |
| C7 | Signup tokens `claimed_by`/`claimed` vs `used_by`/`is_active` |
| C8 | Queue state `running` bare string vs `{job_id}` wrapper |
| G1 | project_shares column names (token→share_token, shared_by_user_id→invited_by, email→shared_with_email) |
| G2 | signup_tokens column names (claimed_by→used_by, claimed→is_active, revoked doesn't exist) |
| H1 | NewEstimate form field name mismatch (verify files vs zip_file) |
| H7 | getSubBidDetail calls nonexistent backend endpoint |
| H13 | validate_description drops 6 of 9 fields |

---

### RUN 2: Backend Error Handling + Auth Architecture (this codebase)
**Effort:** Medium | **Files:** ~10 backend files + config
**Why second:** Security and reliability improvements. B2/B3 is the big architectural decision.

| ID | Issue |
|----|-------|
| B2 | Silent auth degradation to DEV_UUID (52 occurrences) |
| B3 | DEV_UUID projects world-accessible as OWNER |
| F1 | No transaction boundaries in save scripts (or add error recovery) |
| F2 | No retry logic in supabase_client.py |
| F4 | No submission idempotency |
| F5 | Raw PostgREST errors leaked to users |
| F7 | Unauthenticated AI endpoints (validate, transcribe, polish) |
| G4 | Settings dual-write split brain (user_preferences vs user_settings) |
| G5 | All async handlers use synchronous blocking I/O |
| H8 | SUPABASE_JWT_SECRET placeholder in .env |
| H9 | Zero startup validation (partially done — add hard fail for critical vars) |
| H20 | Prompt injection in validate-description and polish-text |
| H27 | .env.example mismatch (partially fixed) |

**Decision needed for B2/B3:** Either (a) remove DEV_UUID entirely and require real auth, or (b) gate behind DEV_MODE env var. This affects every route file.

---

### RUN 3: Worker + Skills Showstoppers (worker repo + skills repo)
**Effort:** Large | **Files:** worker.py, run.md, save-to-db.md, save-scenario-to-db.md
**Why third:** This is what makes the pipeline actually work end-to-end. Depends on nothing from Runs 1-2.

| ID | Issue |
|----|-------|
| A1 | Worker doesn't pass project metadata to Claude Code |
| A2 | No JSON schema for estimate_output.json |
| A3 | Hardcoded dev-machine paths in save-to-db skills |
| B7 | Shell injection via user input in bash script |
| B8 | Clarifying questions stall daemon |
| E1 | Missing scripts from old Plan2BidAgent layout |
| E3 | No cwd guarantee for estimate_output.json |

**This is the most important run for getting plan2bid to actually work.** A1+A2+A3 together make the pipeline produce correct results. B7 must be fixed before A1 (user content enters the prompt). B8 should be in the same prompt update.

---

### RUN 4: Save Script Fixes (worker repo)
**Effort:** Small-Medium | **Files:** save_estimate.py, save_scenario.py
**Why after Run 3:** These only matter once the pipeline actually produces output. Run 3 makes that possible.

| ID | Issue |
|----|-------|
| D1 | projects.warnings column doesn't exist |
| D2 | extraction_metadata column name mismatches |
| D3 | material_items missing material_description |
| D4 | save_scenario.py doesn't filter is_material |
| D5 | scenario_anomaly_flags text[] vs jsonb type mismatch |
| D6 | labor_metadata missing hour range totals |
| D7 | scenario_labor_metadata missing 7 columns |

---

### RUN 5: Worker Hardening (worker repo)
**Effort:** Medium | **Files:** worker.py, supabase_client.py
**Why after Runs 3-4:** The pipeline works and saves correctly. Now make it reliable.

| ID | Issue |
|----|-------|
| B1 | Worker marks job "completed" before verifying save succeeded |
| B5 | Timeout/reaper 30-35 min overlap (increase timeouts) |
| B6 | osascript failure blocks worker 30 minutes |
| E2 | Nested ZIP directories not handled |
| E4 | pdfplumber not in requirements |
| E5 | Inconsistent filter API in supabase_client.py |
| G9 | SIGTERM not handled (launchd graceful shutdown) |
| G10 | Stale reaper can requeue own active job |
| G11 | Prompt injection via scenario_context |
| G12 | Zip bomb vulnerability |

---

### RUN 6: Frontend Cleanup + Remaining (this codebase)
**Effort:** Small | **Files:** Various frontend files
**Why last:** These are cosmetic, UX polish, and minor issues that don't block functionality.

| ID | Issue |
|----|-------|
| G8 | 4 tables written but never read by Results |
| G16 | NewEstimate isSubmitting never reset on success |
| G17 | Dashboard recentProjects unsorted |
| H4 | Sub-invite exposes all trades regardless of trades_scope |
| H6 | Competitor bids query uses wrong field |
| H10 | Frontend .env.example + VITE_API_URL for production |
| H11 | estimation_jobs table not in schema reference |
| H12 | Supabase types.ts defines 6 tables but app uses 25+ |
| H24 | onAuthStateChange ignores event type |
| H28 | N+1 query in compare_scenarios |
| H29 | Google Places API key committed in plaintext |

---

## Dependencies Between Runs

```
Run 1 (API contracts)     ──independent──
Run 2 (Auth + errors)     ──independent──
Run 3 (Worker pipeline)   ──independent── (different repo)
Run 4 (Save scripts)      ──depends on── Run 3
Run 5 (Worker hardening)  ──depends on── Run 3
Run 6 (Frontend cleanup)  ──independent──
```

Runs 1, 2, 3, and 6 can happen in any order or in parallel.
Run 4 and 5 must wait for Run 3.

## Decisions
- Run 3 is the highest-impact run (makes the pipeline work)
- Run 1 and 2 improve the existing backend regardless of the pipeline
- B2/B3 (DEV_UUID) in Run 2 needs an architectural decision before implementation
- Runs can be done in separate Claude sessions since each has its own scope

## Direction
Execute runs in order 1→2→3→4→5→6, or prioritize Run 3 first if getting the pipeline working is more important than backend polish. Each run should be a separate `/plan` + `/implement` cycle.
