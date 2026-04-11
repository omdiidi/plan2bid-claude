# Plan: Fix Worker Stability — Nesting Crash Loop + Anomaly Schema + Terminal Close

## Problems Found
1. **84 restart cycles from "Nesting" crash** — Claude Code crashes when told "Run /plan2bid:run" because it tries to invoke a skill-within-a-skill. Fix: DON'T tell Claude to run the skill. Instead, inline the instructions.
2. **anomaly_flags schema mismatch** — save_estimate.py passes raw anomaly dicts, DB rejects unknown columns.
3. **Terminal didn't close** — likely because worker process died during the 84-restart loop.
4. **Auto-Enter keystroke causes interference** — fires during skill loading, contributes to crash loop.

## Files Being Changed

```
worker repo (~/Desktop/CODEBASES/estim8r/plan2bid-worker/):
  worker.py               ← MODIFIED (inline skill instructions, remove auto-Enter, fix prompt)
  save_estimate.py         ← MODIFIED (anomaly_flags column mapping)

skills repo (~/.claude-dotfiles/commands/plan2bid/):
  run.md                   ← READ ONLY (we read it to extract the instructions to inline)
```

## Architecture Overview

Currently the worker prompt says:
```
Run /plan2bid:run to estimate this project.
```

Claude Code sees this and tries to invoke `Skill(/plan2bid:run)` which triggers "Nesting" — a Claude Code platform limitation where skills can't be nested within `--dangerously-skip-permissions` mode reliably.

**The fix:** Instead of telling Claude to invoke the skill, we give Claude the skill's instructions DIRECTLY in the prompt. The prompt becomes self-contained — no skill invocation needed. Claude just follows the instructions inline.

The prompt will include:
1. Project metadata (already there)
2. The JSON schema from run.md (already there via the worker prompt)  
3. Key estimation instructions extracted from run.md
4. The save-to-db instructions (instead of "run /plan2bid:save-to-db", give the bash command directly)

## Tasks

### Task 1: Remove auto-Enter keystroke from _run.sh

File: `worker.py`

Remove this line from the _run.sh script:
```bash
(sleep 3 && osascript -e 'tell application "System Events" to keystroke return') &
```

The `--dangerously-skip-permissions` flag should handle trust dialogs. The auto-Enter was causing interference with the Nesting crash loop.

### Task 2: Change the prompt to NOT invoke /plan2bid:run

File: `worker.py`

The prompt currently starts with:
```
Run /plan2bid:run to estimate this project.
```

Change it to give Claude the instructions directly:
```
You are a construction estimation AI. Estimate this project following these steps:

1. Read all documents in the current directory (batch in 18-page chunks for large PDFs)
2. Extract line items with quantities from the documents
3. Research current material pricing via web search
4. Estimate labor hours and rates for the project location
5. Apply markups if a pricing profile exists at ~/plan2bid-profile/
6. Save the result as JSON to {pwd}/estimate_output.json using the EXACT schema below

[... JSON schema already in the prompt ...]

When done, save to database by running:
cd {worker_dir} && source .venv/bin/activate 2>/dev/null; python3 save_estimate.py --input {absolute_path}/estimate_output.json --project-id {project_id}
```

This eliminates the skill invocation entirely. Claude gets the same instructions but without the "Nesting" crash.

### Task 3: Include the save-to-db command directly in the prompt

Instead of:
```
When the estimate is complete, run /plan2bid:save-to-db {project_id}
```

Give the exact bash command:
```
When the estimate is complete, save to the database by running this command:
cd ~/workermacmini && source .venv/bin/activate 2>/dev/null; python3 save_estimate.py --input {pwd}/estimate_output.json --project-id {project_id}

If ~/workermacmini doesn't exist, try ~/plan2bid-worker or ~/Desktop/CODEBASES/estim8r/plan2bid-worker.
```

### Task 4: Fix anomaly_flags column mapping in save_estimate.py

File: `save_estimate.py`

Find the anomaly_flags section (~line 95-102). Currently:
```python
trade_anomalies = [a for a in anomalies if a.get("trade") == trade]
if trade_anomalies:
    for a in trade_anomalies:
        a["project_id"] = project_id
    db.post("anomaly_flags", trade_anomalies)
```

Change to map to exact DB columns:
```python
trade_anomalies = [a for a in anomalies if a.get("trade") == trade]
if trade_anomalies:
    mapped = [{
        "project_id": project_id,
        "trade": a.get("trade", trade),
        "anomaly_type": a.get("anomaly_type", "noted"),
        "category": a.get("category", ""),
        "description": a.get("description", ""),
        "affected_items": a.get("affected_items", []),
        "cost_impact": float(a.get("cost_impact", 0) or 0),
    } for a in trade_anomalies]
    db.post("anomaly_flags", mapped)
```

### Task 5: Do the same for scenarios

File: `save_scenario.py`

Find the scenario anomaly section and apply the same column mapping. Also coerce `affected_items` to list of strings for the `text[]` column type.

## Verify

1. `python -c "import py_compile; py_compile.compile('worker.py'); py_compile.compile('save_estimate.py'); py_compile.compile('save_scenario.py'); print('OK')"`
2. Test with a real estimation job — should NOT show "Nesting" at all

## Confidence: 8/10

The Nesting fix is the key change. By not invoking `/plan2bid:run` as a skill, we avoid the crash loop entirely. The estimation quality should be the same since Claude gets the same instructions inline. The -2 is because we haven't tested if Claude follows inline instructions as well as skill-loaded instructions.
