# API Client — `src/lib/api.ts`

## Overview

Single-file HTTP client that handles ALL communication with the FastAPI backend. Every backend call in the app goes through this file. No component should ever use raw `fetch("/api/...")` directly.

**File:** `src/lib/api.ts` (~527 lines)

## Architecture

### Request Flow

```
Component calls api function
  → getAuthHeaders() extracts Supabase JWT
  → fetch() with auth header + Content-Type
  → Vite proxy rewrites /api → http://localhost:8000
  → FastAPI processes request
  → Response parsed as JSON, typed, returned
```

### Core Internals (NOT exported to components)

| Function | Purpose |
|----------|---------|
| `getAuthHeaders()` | Extracts JWT from Supabase session → `{ Authorization: "Bearer <token>" }` |
| `request<T>(path, options)` | Generic typed fetch wrapper. Handles auth, errors, 401/403 detection |
| `ApiError` | Custom error class with `status`, `message`, `details` fields |

### Auth Expiry Handling

On 401/403 responses, `request()` dispatches a custom DOM event:
```ts
window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
```
The `useAuth` hook listens for this event and triggers `supabase.auth.signOut()`, which redirects to `/auth`.

## All Endpoints

### Estimate Lifecycle

| Function | Method | Path | Body | Used By |
|----------|--------|------|------|---------|
| `createEstimate(formData)` | POST | `/api/estimate` | FormData (ZIP + fields) | NewEstimate.tsx |
| `getEstimateStatus(jobId)` | GET | `/api/estimate/status/:jobId` | — | Progress.tsx |
| `getEstimate(estimateId)` | GET | `/api/estimate/:estimateId` | — | Results.tsx |

**Note:** `createEstimate` does NOT use the generic `request()` helper because it sends `FormData` (multipart), not JSON. It manually calls `fetch()` with auth headers but no Content-Type (browser sets it for FormData).

### Line Item CRUD

| Function | Method | Path | Body | Used By |
|----------|--------|------|------|---------|
| `addMaterialItem(projectId, body)` | POST | `/api/estimate/:id/material` | JSON | MaterialsTable.tsx |
| `addLaborItem(projectId, body)` | POST | `/api/estimate/:id/labor` | JSON | LaborTable.tsx |
| `deleteMaterialItem(projectId, itemId)` | DELETE | `/api/estimate/:id/material/:itemId` | — | MaterialsTable.tsx |
| `deleteLaborItem(projectId, itemId)` | DELETE | `/api/estimate/:id/labor/:itemId` | — | LaborTable.tsx |

### Projects

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `getProjects()` | GET | `/api/projects` | AppProvider |
| `getProject(projectId)` | GET | `/api/projects/:id` | Results.tsx |
| `deleteProject(projectId)` | DELETE | `/api/projects/:id` | AppProvider |

### Documents & Viewer

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `getDocuments(jobId)` | GET | `/api/projects/:id/documents` | DocumentViewer.tsx |
| `getDocumentPdfUrl(jobId, docIndex)` | GET | `/api/projects/:id/documents/:idx/pdf` | DocumentViewer.tsx |
| `searchDocuments(jobId, query, opts)` | GET | `/api/projects/:id/search?q=...` | DocumentViewer.tsx |
| `getPageImageUrl(jobId, docIndex, page)` | — | Returns URL string (not a fetch) | DocumentViewer.tsx |

### Chat

| Function | Method | Path | Body | Used By |
|----------|--------|------|------|---------|
| `sendChatMessage(jobId, msg, history, mode)` | POST | `/api/chat/:jobId` | JSON (message, history, mode) | DocumentChat.tsx |

### Summaries

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `getOverallSummary(jobId, regenerate?)` | GET | `/api/projects/:id/summary/overall` | ProjectSummaryCard.tsx |
| `getTradeSummary(jobId, regenerate?)` | GET | `/api/projects/:id/summary/trade` | TradeSummaryCard.tsx |

### Preset Matching & Overrides

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `matchPresets(jobId, body)` | POST | `/api/projects/:id/match-presets` | Results.tsx |
| `getProjectOverrides(projectId)` | GET | `/api/projects/:id/overrides` | Results.tsx |
| `saveProjectOverrides(projectId, overrides)` | PUT | `/api/projects/:id/overrides` | Results.tsx |

### Sharing

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `createEmailShare(projectId, email, perm)` | POST | `/api/projects/:id/shares/email` | ShareModal.tsx |
| `createLinkShare(projectId, perm)` | POST | `/api/projects/:id/shares/link` | ShareModal.tsx |
| `acceptShareLink(token)` | POST | `/api/shares/accept/:token` | AcceptShare.tsx |
| `listShares(projectId)` | GET | `/api/projects/:id/shares` | ShareModal.tsx |
| `updateShare(projectId, shareId, perm)` | PATCH | `/api/projects/:id/shares/:shareId` | ShareModal.tsx |
| `revokeShare(projectId, shareId)` | DELETE | `/api/projects/:id/shares/:shareId` | ShareModal.tsx |

### Settings

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `getUserSettings()` | GET | `/api/settings` | AppProvider |
| `saveUserSettings(data)` | PUT | `/api/settings` | AppProvider |

### Admin

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `adminGetUsers()` | GET | `/api/admin/users` | AdminDashboard.tsx |
| `adminGetProjects()` | GET | `/api/admin/projects` | AdminDashboard.tsx |

### Validation & Voice

| Function | Method | Path | Used By |
|----------|--------|------|---------|
| `validateDescription(req)` | POST | `/api/validate-description` | NewEstimate.tsx |
| `transcribeVoice(audioBlob)` | POST | `/api/transcribe-voice` | NewEstimate.tsx |

### Export (URL builder, not a fetch)

| Function | Returns | Used By |
|----------|---------|---------|
| `getExportUrl(estimateId, format)` | URL string | Results.tsx |

## Patterns to Follow

1. **Always use `request<T>()` for JSON endpoints.** It handles auth headers, error parsing, and 401 detection.
2. **Always include `Content-Type: application/json`** when sending a JSON body. This is already done correctly on all endpoints.
3. **For FormData uploads** (ZIP files, audio), use manual `fetch()` with `getAuthHeaders()` but do NOT set Content-Type (browser handles multipart boundary).
4. **New endpoint functions** should follow the existing pattern: exported async function, typed return, using `request<T>()`.
5. **`getAuthHeaders`** and **`ApiError`** are re-exported at the bottom for components that need authenticated fetch outside the standard pattern (e.g., export downloads).

## Do NOT

- Add `fetch()` calls in components — always add new functions here
- Remove the 401/403 → `estim8r:auth-expired` event dispatch
- Change the `API_BASE = "/api"` constant (it relies on Vite proxy config)
- Add imports in the middle of the file (consolidate at top)
