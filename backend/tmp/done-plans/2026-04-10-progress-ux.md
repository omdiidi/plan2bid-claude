# Plan: Progress Page UX — Skip Queue Banner, Show Progress Immediately

## Goal
Remove the "In Queue" waiting banner from the Progress page. Instead, show the animated progress visualization immediately with a "Starting estimation..." message. The worker claims jobs within 5 seconds, so the queue state is fleeting.

## Files Being Changed

```
frontend/src/pages/Progress.tsx    ← MODIFIED
```

## Architecture Overview

Currently the Progress page has 3 visual states:
1. **isQueued** → "In Queue" amber banner (blocks the progress visualization)
2. **!isComplete && !isFailed && !isQueued** → Animated progress visualization
3. **isComplete** → Green "Estimate Complete" banner

The change: treat `queued` the same as `running` for the visualization. Show the progress animation immediately with stage "ingestion" and progress 0%. The queue banner is removed entirely.

## Tasks

### Task 1: Remove queue banner and treat queued as running in the visualization

File: `/tmp/plan2bid-claude/frontend/src/pages/Progress.tsx`

**1a.** Remove the entire "Queue Waiting Banner" block (lines ~412-430):
```tsx
{/* ── Queue Waiting Banner ── */}
{isQueued && (
  <Card className="p-6 shadow-card border-amber-500/30 bg-amber-500/5 mb-6 animate-slide-up">
    ...
  </Card>
)}
```
Delete this entire block.

**1b.** Change the progress visualization condition from:
```tsx
{!isComplete && !isFailed && !isQueued && (
```
To:
```tsx
{!isComplete && !isFailed && (
```
This shows the animation for ALL non-terminal states including queued.

**1c.** In the progress interpolation `useEffect`, treat `queued` as running so the progress starts incrementing:
Find the line:
```typescript
const isRunning = activeStatus?.status === "running";
```
Change to:
```typescript
const isRunning = activeStatus?.status === "running" || activeStatus?.status === "queued";
```

**1d.** Update the stage display for queued status. When `currentStage` is "queued" (not in STAGE_DISPLAY), the stageDisplay fallback is `{ name: "queued", subtitle: "" }`. Add "queued" to STAGE_DISPLAY:
```typescript
const STAGE_DISPLAY: Record<string, { name: string; subtitle: string }> = {
  queued:        { name: "Starting Estimation",          subtitle: "Preparing your estimate..." },
  ingestion:     { name: "File Upload & Extraction",     subtitle: "Extracting and validating documents from ZIP" },
  ...
```

**1e.** Remove the `isQueued` variable since it's no longer used:
Find `const isQueued = activeStatus?.status === "queued";` and delete it.
Also remove `queuePosition` usage if it's only used by the queue banner.

### Task 2: Verify build

`cd /tmp/plan2bid-claude/frontend && npm run build`

## Confidence: 10/10
Pure frontend change, removes code rather than adding it.
