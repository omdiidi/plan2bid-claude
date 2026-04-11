# Plan: Full Repo + Database Audit Search

## Purpose
A comprehensive search plan to find every remaining problem across the codebase and database. Run each section independently. Each section has the exact commands/queries to execute.

---

## SECTION 1: Database Schema vs Code Alignment

### 1A: Every column the backend READS but might not exist
Run this SQL to find every column the backend code references, then verify it exists:

```sql
-- Check all columns read by estimates.py get_estimate endpoint
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'extraction_metadata'
ORDER BY ordinal_position;
-- VERIFY: does it have 'documents_searched' and 'pages_searched'?
-- The backend reads 'total_documents' and 'total_pages' (D2) — are those aliases or wrong names?
```

```sql
-- Check all columns in material_items that save_estimate.py writes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'material_items'
ORDER BY ordinal_position;
-- COMPARE against save_estimate.py _to_material_row() fields
```

```sql
-- Same for labor_items
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'labor_items'
ORDER BY ordinal_position;
-- COMPARE against save_estimate.py _to_labor_row() fields
```

```sql
-- Check scenario tables match save_scenario.py
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scenario_material_items' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scenario_labor_items' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scenario_anomaly_flags' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scenario_material_metadata' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scenario_labor_metadata' ORDER BY ordinal_position;
```

### 1B: Every column the backend WRITES but might not exist
Search the codebase for all PostgREST writes:

```bash
# Find every field name written by save_estimate.py
grep -oP '"(\w+)"' ~/Desktop/CODEBASES/estim8r/plan2bid-worker/save_estimate.py | sort -u

# Find every field name written by save_scenario.py
grep -oP '"(\w+)"' ~/Desktop/CODEBASES/estim8r/plan2bid-worker/save_scenario.py | sort -u

# Find every column name used in queries.py inserts/updates/upserts
grep -oP '"(\w+)"' /tmp/plan2bid-claude/backend/app/db/queries.py | sort -u
```

Then cross-reference each field against the actual DB columns from 1A.

### 1C: Check NOT NULL constraints vs code defaults
```sql
-- Find all NOT NULL columns with no default — these will fail if code doesn't provide them
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND is_nullable = 'NO'
AND column_default IS NULL
AND column_name != 'id'
ORDER BY table_name, column_name;
```

Compare against what the code actually sends in each insert/upsert.

---

## SECTION 2: Frontend API Contract Verification

### 2A: Every API call the frontend makes
```bash
# Extract every endpoint the frontend calls
grep -rn "request\b\|request<" /tmp/plan2bid-claude/frontend/src/lib/api.ts | grep -oP '"/[^"]+' | sort -u
```

### 2B: Every response type the frontend expects
```bash
# Extract all TypeScript return types from api.ts
grep -n "Promise<" /tmp/plan2bid-claude/frontend/src/lib/api.ts
```

### 2C: Every endpoint the backend actually serves
```bash
# Extract all route registrations
grep -rn "@router\.\(get\|post\|put\|patch\|delete\)" /tmp/plan2bid-claude/backend/app/routes/ | sed 's/.*"\(.*\)".*/\1/' | sort -u
```

### 2D: Cross-reference
Compare the lists from 2A and 2C. Any endpoint in 2A but not 2C = frontend calls a nonexistent endpoint. Any endpoint in 2C but not 2A = dead backend code.

---

## SECTION 3: Database Data Quality

### 3A: Orphan and integrity checks
```sql
-- Full FK integrity (already run — should be 0 orphans)
-- Re-run to confirm after any changes:
WITH checks AS (
  SELECT 'anomaly_flags→projects' as fk, COUNT(*) as orphans FROM anomaly_flags a LEFT JOIN projects p ON p.id = a.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'documents→projects', COUNT(*) FROM documents d LEFT JOIN projects p ON p.id = d.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'estimation_jobs→projects', COUNT(*) FROM estimation_jobs ej LEFT JOIN projects p ON p.id = ej.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'scenarios→projects', COUNT(*) FROM scenarios s LEFT JOIN projects p ON p.id = s.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'material_items→projects', COUNT(*) FROM material_items mi LEFT JOIN projects p ON p.id = mi.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'labor_items→projects', COUNT(*) FROM labor_items li LEFT JOIN projects p ON p.id = li.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'project_shares→projects', COUNT(*) FROM project_shares ps LEFT JOIN projects p ON p.id = ps.project_id WHERE p.id IS NULL
  UNION ALL SELECT 'sub_submissions→project_shares', COUNT(*) FROM sub_submissions ss LEFT JOIN project_shares ps ON ps.id = ss.share_id WHERE ps.id IS NULL
)
SELECT * FROM checks WHERE orphans > 0;
```

### 3B: Data consistency
```sql
-- Projects where status and data don't match
SELECT id, project_name, status, total_estimate,
  (SELECT COUNT(*) FROM material_items WHERE project_id = p.id) as mat_count,
  (SELECT COUNT(*) FROM labor_items WHERE project_id = p.id) as lab_count
FROM projects p
WHERE (status = 'completed' AND (total_estimate IS NULL OR total_estimate = 0))
   OR (status = 'error' AND total_estimate > 0);
```

```sql
-- Material metadata totals vs actual item sums
SELECT mm.project_id, mm.trade, 
  mm.total_cost_expected as metadata_total,
  (SELECT COALESCE(SUM(extended_cost_expected), 0) FROM material_items mi WHERE mi.project_id = mm.project_id AND mi.trade = mm.trade) as actual_total,
  ABS(mm.total_cost_expected - COALESCE((SELECT SUM(extended_cost_expected) FROM material_items mi WHERE mi.project_id = mm.project_id AND mi.trade = mm.trade), 0)) as diff
FROM material_metadata mm
WHERE ABS(mm.total_cost_expected - COALESCE((SELECT SUM(extended_cost_expected) FROM material_items mi WHERE mi.project_id = mm.project_id AND mi.trade = mm.trade), 0)) > 1
ORDER BY diff DESC
LIMIT 20;
```

```sql
-- Labor metadata totals vs actual
SELECT lm.project_id, lm.trade,
  lm.total_labor_cost as metadata_total,
  (SELECT COALESCE(SUM(cost_expected), 0) FROM labor_items li WHERE li.project_id = lm.project_id AND li.trade = lm.trade) as actual_total
FROM labor_metadata lm
WHERE ABS(lm.total_labor_cost - COALESCE((SELECT SUM(cost_expected) FROM labor_items li WHERE li.project_id = lm.project_id AND li.trade = lm.trade), 0)) > 1
ORDER BY 1
LIMIT 20;
```

### 3C: Stale/test data
```sql
-- Projects that look like tests
SELECT id, project_name, status, trade, created_at
FROM projects
WHERE project_name ILIKE '%test%' OR project_name ILIKE '%sunglasses%' OR project_name ILIKE '%asdf%'
ORDER BY created_at;
```

```sql
-- Estimation jobs in terminal states with errors
SELECT id, project_id, status, error_message, created_at
FROM estimation_jobs
WHERE status = 'error'
ORDER BY created_at DESC;
```

---

## SECTION 4: RLS Policy Audit

### 4A: Tables with RLS enabled but no policies
```sql
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public' AND t.rowsecurity = true
GROUP BY t.tablename
HAVING COUNT(p.policyname) = 0;
```
These tables block ALL access via the anon/authenticated roles. Only the service_role key bypasses RLS.

### 4B: Tables with overly permissive policies
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND (qual = 'true' OR with_check = 'true')
AND cmd != 'SELECT';
```

### 4C: Tables with NO RLS at all
```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
```
These tables are wide open to any authenticated user via the Supabase JS client.

---

## SECTION 5: Worker + Skills Repo Checks

### 5A: Worker code search
```bash
# Check worker.py for hardcoded values
grep -n "1800\|30 \*\|DEV_UUID\|localhost\|127.0.0.1\|hardcod" ~/Desktop/CODEBASES/estim8r/plan2bid-worker/worker.py

# Check for any remaining eq. prefix issues
grep -n 'eq\.' ~/Desktop/CODEBASES/estim8r/plan2bid-worker/worker.py

# Check supabase_client.py filter consistency
grep -n 'def get\|def post\|def patch\|def delete\|def upsert' ~/Desktop/CODEBASES/estim8r/plan2bid-worker/supabase_client.py
```

### 5B: Skills search
```bash
# Check all skills for hardcoded paths
grep -rn "Desktop/Projects\|Desktop/CODEBASES\|plan2bid-worker" ~/.claude-dotfiles/commands/plan2bid/

# Check for any skill that references a script that doesn't exist
grep -rn "python.*\.py\|scripts/" ~/.claude-dotfiles/commands/plan2bid/ | grep -v "save_estimate\|save_scenario"
```

### 5C: A2 — JSON schema check
```bash
# Does run.md have a JSON schema yet?
grep -n "schema\|JSON\|line_items\|is_material\|is_labor" ~/.claude-dotfiles/commands/plan2bid/run.md | head -20
```
This is the last showstopper — if no schema, the pipeline output format is unpredictable.

---

## SECTION 6: Frontend Component Health

### 6A: Unused imports
```bash
# Find imports that might reference deleted/commented components
grep -rn "import.*DocumentChat\|import.*DocumentViewer\|import.*SubDocumentViewer" /tmp/plan2bid-claude/frontend/src/ | grep -v "^.*//\|^.*{/\*"
```

### 6B: Dead API functions
```bash
# Find api.ts exports that are never imported elsewhere
for fn in $(grep "^export.*function" /tmp/plan2bid-claude/frontend/src/lib/api.ts | sed 's/.*function \(\w*\).*/\1/'); do
  count=$(grep -rn "$fn" /tmp/plan2bid-claude/frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "api.ts" | wc -l)
  if [ "$count" -eq 0 ]; then
    echo "DEAD: $fn (0 imports)"
  fi
done
```

### 6C: TypeScript type check
```bash
cd /tmp/plan2bid-claude/frontend && npx tsc --noEmit 2>&1 | head -50
```

### 6D: Build check
```bash
cd /tmp/plan2bid-claude/frontend && npm run build 2>&1 | tail -10
```

---

## SECTION 7: Security Scan

### 7A: Secrets in repo
```bash
# Check for committed secrets
grep -rn "sk-\|eyJ\|AIza\|password\|secret" /tmp/plan2bid-claude/frontend/.env /tmp/plan2bid-claude/backend/.env 2>/dev/null
grep -rn "sk-\|eyJ\|AIza" /tmp/plan2bid-claude/frontend/src/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

### 7B: Endpoints without auth
```bash
# Find route handlers that don't call get_user_id or get_optional_user_id
grep -B5 "async def " /tmp/plan2bid-claude/backend/app/routes/*.py | grep -A5 "async def" | grep -v "user_id\|get_user\|get_optional\|get_required" | grep "async def"
```

### 7C: Supabase security advisors
Run via MCP:
- `get_advisors(type: "security")`
- `get_advisors(type: "performance")`

---

## SECTION 8: Cross-Codebase Consistency

### 8A: settings table confusion
```sql
-- What's in user_preferences vs user_settings?
SELECT 'user_preferences' as tbl, COUNT(*) as rows FROM user_preferences
UNION ALL SELECT 'user_settings', COUNT(*) FROM user_settings;
```

```bash
# Which table does the frontend use?
grep -rn "user_preferences\|user_settings" /tmp/plan2bid-claude/frontend/src/

# Which table does the backend use?
grep -rn "user_preferences\|user_settings" /tmp/plan2bid-claude/backend/app/
```

### 8B: Storage bucket verification
```sql
-- Check what storage buckets exist
SELECT id, name, public FROM storage.buckets;
```

```bash
# What bucket name does the code use?
grep -rn "project-files\|project-documents\|project_files" /tmp/plan2bid-claude/backend/app/ ~/Desktop/CODEBASES/estim8r/plan2bid-worker/
```

---

## How to Run This

Each section is independent. Run them in any order. For SQL queries, use the Supabase MCP `execute_sql` tool or the Supabase SQL Editor in the dashboard. For bash commands, run them in the terminal.

After running, collect findings and add any new issues to `./tmp/MASTER-AUDIT.md`.
