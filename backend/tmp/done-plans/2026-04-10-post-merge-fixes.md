# Plan: Post-Merge Fixes — Disable Broken Document/Chat Components

## Goal
Fix the 3 critical issues found in the codex review of the production UI merge:
1. Comment out DocumentViewer in GCTradeTab.tsx (hits 501 stub)
2. Comment out DocumentChat + SubDocumentViewer in SubcontractorBid.tsx (hits 501 stubs)
3. Hide the empty "Documents" tab in Results.tsx and GCTradeTab.tsx (users see blank pane)

Also: do NOT add a re-run button — user explicitly decided to skip it for now.

## Files Being Changed

```
frontend/src/
  components/results/
    GCTradeTab.tsx              ← MODIFIED (comment out DocumentViewer import + usage, hide Documents tab)
  pages/
    Results.tsx                 ← MODIFIED (hide Documents tab trigger + content)
    SubcontractorBid.tsx        ← MODIFIED (comment out DocumentChat + SubDocumentViewer)
```

## Architecture Overview

These are surgical comment-outs. The Document/Chat components exist and compile fine, but the backend endpoints they call (`/api/projects/{id}/documents`, `/api/chat/{id}`, `/api/sub-invites/{token}/documents`) all return HTTP 501. Until those endpoints are implemented, the components must be disabled to prevent error screens.

## Tasks

### Task 1: GCTradeTab.tsx — comment out DocumentViewer and hide Documents tab

File: `/tmp/plan2bid-claude/frontend/src/components/results/GCTradeTab.tsx`

**1a.** Comment out the import at line 12:
```typescript
// TODO: Re-enable when document storage is wired up
// import DocumentViewer from "./DocumentViewer";
```

**1b.** Comment out the Documents TabsTrigger at line 264-265:
```typescript
{/* <TabsTrigger value="documents" className="text-sm gap-1.5">
  <FileText className="w-3.5 h-3.5" />Documents
</TabsTrigger> */}
```

**1c.** Comment out the Documents TabsContent at lines 315-317:
```typescript
{/* <TabsContent value="documents" className="mt-0">
  <DocumentViewer projectId={projectId} />
</TabsContent> */}
```

### Task 2: Results.tsx — hide the empty Documents tab

File: `/tmp/plan2bid-claude/frontend/src/pages/Results.tsx`

**2a.** Comment out the Documents TabsTrigger at lines 907-909:
```typescript
{/* <TabsTrigger value="documents" className="text-sm gap-1.5">
  <FileText className="w-3.5 h-3.5" />Documents
</TabsTrigger> */}
```

**2b.** Comment out the Documents TabsContent at lines 978-980:
```typescript
{/* <TabsContent value="documents" className="mt-0">
  {/* <DocumentViewer projectId={projectId!} /> */}
</TabsContent> */}
```

Note: the inner comment is already there. Wrap the whole TabsContent in JSX comment.

### Task 3: SubcontractorBid.tsx — comment out DocumentChat and SubDocumentViewer

File: `/tmp/plan2bid-claude/frontend/src/pages/SubcontractorBid.tsx`

**3a.** Comment out imports at lines 27-28:
```typescript
// TODO: Re-enable when document storage and chat endpoints are implemented
// import SubDocumentViewer from "@/components/results/SubDocumentViewer";
// import DocumentChat from "@/components/results/DocumentChat";
```

**3b.** Comment out the SubDocumentViewer TabsContent at lines 627-631:
```typescript
{/* {data.send_documents && token && (
  <TabsContent value="documents" className="mt-0">
    <SubDocumentViewer token={token} />
  </TabsContent>
)} */}
```

**3c.** Comment out the DocumentChat FAB at lines 729-735:
```typescript
{/* {data.project_id && (
  <DocumentChat
    projectIdOverride={data.project_id}
    onRequireAuth={handleChatAuthGate}
  />
)} */}
```

**3d.** Also hide the Documents tab trigger in SubcontractorBid if it exists. Search for `value="documents"` TabsTrigger and comment it out.

### Task 4: Verify build

Run `cd /tmp/plan2bid-claude/frontend && npm run build` to confirm no errors.

## Validation Gates

1. `npm run build` passes with zero errors
2. No remaining active (uncommented) imports of DocumentViewer, DocumentChat, or SubDocumentViewer in any file other than their own component definitions
3. No visible "Documents" tab in Results, GCTradeTab, or SubcontractorBid

## Confidence Score: 10/10

These are pure comment-outs with no logic changes.
