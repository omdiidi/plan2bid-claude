# Plan: Delete Old Pipeline + Fix Progress Timing

## Goal
1. Delete the dead `app/pipeline/` directory (empty __init__.py + stale .pyc)
2. Fix Progress.tsx timing so the 7-stage UI looks smooth even though the worker only reports 2 stages (ingestion at 5%, extraction at 10%, then completed)

## Files Being Changed

```
backend/
  app/
    pipeline/                    ← DELETE entire directory
frontend/
  src/
    pages/
      Progress.tsx               ← MODIFIED (timing fix + comment update)
```

## Architecture Overview

The worker writes exactly 2 stage updates:
- `stage: "ingestion", progress: 5` — when downloading docs
- `stage: "extraction", progress: 10` — when launching Claude Code

Then save_estimate.py sets `projects.status = "completed"` as its final step.

The Progress page currently has 7 stages with specific progress thresholds. The stage visualization uses `getStageStatus()` which compares the current stage index against each stage's index in `STAGE_ORDER`. Since the worker only reports ingestion and extraction, stages after extraction (context, pricing_labor) are never reached — they stay "pending" until the status jumps to "completed" which marks ALL stages as "completed" simultaneously.

The fix: since progress jumps from 10 to "completed", we need the stage UI to show realistic progression. The key insight is that `getStageStatus` already handles `pipelineStatus === "completed"` by marking all stages as "completed" (line 80). So we just need the RUNNING state to look right — when `stage: "extraction"` and `progress: 10`, stages ingestion through extraction should show as completed/running, and the rest as pending. This already works correctly because extraction is index 4 and anything below it shows as "completed."

The real issue is the PROGRESS RING: it shows the numeric progress value (5%, 10%, then 100%). The jump from 10% to 100% is jarring. We should make the progress ring interpolate smoothly when status is "running" but progress hasn't updated in a while.

## Tasks

### Task 1: Delete app/pipeline/ directory

```bash
rm -rf /tmp/plan2bid-claude/backend/app/pipeline/
```

That's it. No code imports from this directory.

### Task 2: Fix Progress.tsx — smooth progress interpolation

The problem: worker sets progress to 5 then 10, then nothing until "completed" jumps to 100.

**Approach: Client-side progress interpolation.** When the status is "running" and progress is stuck at a low value, slowly increment the displayed progress over time to give the appearance of work happening. Cap it at 90% so there's still a visible jump when it actually completes.

In Progress.tsx, add a `useEffect` that interpolates progress when status is "running":

```typescript
// After the polling state setup, add interpolated progress
const [displayProgress, setDisplayProgress] = useState(0);

useEffect(() => {
  const serverProgress = activeStatus?.progress ?? 0;
  const isRunning = activeStatus?.status === "running";
  
  if (!isRunning) {
    // Not running — show exact server value (0 for queued, 100 for completed)
    setDisplayProgress(activeStatus?.status === "completed" ? 100 : serverProgress);
    return;
  }
  
  // Running — smoothly interpolate from server progress toward 90%
  // Start from wherever the server says, increment slowly
  setDisplayProgress(prev => {
    const target = Math.max(serverProgress, prev);
    if (target >= 90) return 90; // Cap at 90% while running
    return target;
  });
  
  const interval = setInterval(() => {
    setDisplayProgress(prev => {
      if (prev >= 90) return 90;
      // Increment by ~1% every 3 seconds, slowing as we approach 90
      const remaining = 90 - prev;
      const increment = Math.max(0.3, remaining * 0.02);
      return Math.min(90, prev + increment);
    });
  }, 3000);
  
  return () => clearInterval(interval);
}, [activeStatus?.status, activeStatus?.progress]);
```

Then replace all references to `activeStatus?.progress` in the JSX with `displayProgress` for the progress ring/bar display. The stage cards continue using `activeStatus?.stage` for their status icons (this already works correctly).

### Task 3: Update the comment at line 53

Change:
```typescript
// ─── Stage mapping (matches backend orchestrator.py exactly) ─────────────────
```
To:
```typescript
// ─── Stage mapping (visual stages — worker reports ingestion + extraction, rest are interpolated) ─
```

### Task 4: Fix the line 605 crash (G14)

While we're in Progress.tsx, fix the null crash at line 605:

Change:
```typescript
`Completed with ${status.warnings.length} warning${status.warnings.length > 1 ? "s" : ""}`
```
To:
```typescript
`Completed with ${activeStatus?.warnings?.length ?? 0} warning${(activeStatus?.warnings?.length ?? 0) > 1 ? "s" : ""}`
```

### Task 5: Fix logs .slice(-2) showing oldest instead of newest (H14)

Change:
```typescript
.slice(-2)
```
To:
```typescript
.slice(0, 2)
```

This takes the first 2 entries from the desc-sorted array (newest first), instead of the last 2 (oldest).

### Task 6: Build and verify

Run `cd /tmp/plan2bid-claude/frontend && npm run build`

## Validation Gates

1. `app/pipeline/` directory no longer exists
2. `npm run build` passes
3. No import of anything from `app.pipeline` exists in backend code

## Confidence Score: 9/10

Simple changes. The progress interpolation is the most complex part but it's a standard React pattern.
