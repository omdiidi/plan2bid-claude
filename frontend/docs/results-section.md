# Results Section — `src/components/results/`

## Overview

The `/results/:projectId` page is the most complex view in the app. It delegates to 8 sub-components in `src/components/results/`. Each handles a specific part of the results experience.

## Component Map

```
Results.tsx (page)
├── ProjectSummaryCard.tsx     — AI-generated overall project summary
├── TradeSummaryCard.tsx       — AI-generated trade-specific summary
├── MaterialsTable.tsx         — Interactive materials line item table
├── LaborTable.tsx             — Interactive labor line item table
├── FinalPricingTab (inline)   — Markup/overhead/contingency calculations
├── DocumentViewer.tsx         — Document browser with page images
├── DocumentChat.tsx           — AI chat about documents
│   └── PageViewerLightbox.tsx — Full-screen page viewer (from chat references)
├── ReviewMatchesDialog.tsx    — Bulk preset match review sheet
└── sharing/
    └── ShareButton.tsx → ShareModal.tsx
```

---

## MaterialsTable.tsx (~550 lines)

**Purpose:** Sortable, searchable, expandable materials table with inline editing.

**Props:** Receives `items: MaterialItem[]`, `presetMatches`, `overrides`, `onOverridesChange`, `onItemsChange` from Results.tsx.

**Key features:**
- Sort by description, quantity, unit cost, total, confidence
- Search/filter by description
- Expand rows to show pricing details, sources, confidence notes
- Slider for adjusting unit cost (between cost_low and cost_high)
- Preset matching: if a match exists, shows preset name/price with "Apply" button
- Override management: applied presets become overrides (stored in `ProjectOverrides`)
- Add new item form (description, quantity, unit, unit cost) → calls `addMaterialItem()` API
- Delete items with confirmation → calls `deleteMaterialItem()` API

**Types used:**
- `MaterialItem` from `constants.ts` — UI view model
- `PresetMatch`, `ItemOverride` from `types/index.ts` — preset matching
- `MaterialPreset` from `app-context.tsx` — user's saved presets

---

## LaborTable.tsx (~590 lines)

**Purpose:** Same pattern as MaterialsTable but for labor line items.

**Key differences from MaterialsTable:**
- Shows crew summary, hours, hourly rate instead of unit cost
- Two sliders: hours (hoursLow↔hoursHigh) and rate (rateLow↔rateHigh)
- Shows site condition adjustments and labor reasoning
- Add form: description, quantity, unit, hours, hourly rate → `addLaborItem()` API

---

## ProjectSummaryCard.tsx

**Purpose:** Collapsible card showing AI-generated overall project summary.

**Data flow:**
- Calls `getOverallSummary(projectId)` on mount
- Shows loading skeleton while fetching
- Displays: headline, classification, building info, document set, trades in scope, constraints, parties, narrative
- "Regenerate" button calls `getOverallSummary(projectId, true)` to force re-generation

---

## TradeSummaryCard.tsx

**Purpose:** Collapsible card showing AI-generated trade-specific summary.

**Data flow:**
- Calls `getTradeSummary(projectId)` on mount
- Displays: scope overview, key quantities table, site conditions, labor snapshot, anomalies, confidence assessment, assumptions
- "Regenerate" button for re-generation

---

## DocumentViewer.tsx

**Purpose:** Browse uploaded project documents with page image viewer.

**Layout:**
- Desktop: Dialog with sidebar document list + main page viewer
- Mobile: Drawer layout (uses `useIsMobile()` hook)

**Key features:**
- Document list sidebar with search (calls `searchDocuments()`)
- Page image viewer with authenticated images (`AuthImage` internal component)
- Page navigation (prev/next)
- PDF download button (calls `getDocumentPdfUrl()`)
- Fullscreen toggle

**AuthImage pattern:**
```ts
// Internal component that fetches images with auth headers
function AuthImage({ src, ...props }) {
  // Fetches blob URL with Authorization header
  // Displays as <img> with object URL
}
```
This is needed because page images are served by the backend behind auth.

---

## DocumentChat.tsx

**Purpose:** Floating AI chat panel for asking questions about project documents.

**UI:** FAB (floating action button) in bottom-right → slides in chat panel.

**Data flow:**
- Sends messages to `sendChatMessage(jobId, message, history, mode)` API
- Persists messages to Supabase `chat_messages` table directly (NOT through api.ts)
- Loads chat history from Supabase on mount
- Supports "deep search" mode toggle

**Chat references:**
- AI responses can include `ChatReference[]` with doc_index, page_number
- Clicking a reference opens `PageViewerLightbox`

**Known issue:** Chat persistence bypasses the backend API. It reads/writes Supabase `chat_messages` table directly using the Supabase client. This is the only component that does this (besides `useRole` which reads `user_roles`).

---

## PageViewerLightbox.tsx

**Purpose:** Full-screen page viewer opened from chat references.

**Current state:** Renders a **placeholder div** instead of actual page images. Has zoom controls, keyboard navigation, and thumbnail strip, but the main content area shows "Document Page Preview" text instead of a real `<img>`.

**Note:** `DocumentViewer.tsx` has a working `AuthImage` component that correctly fetches and displays authenticated page images. This pattern should be reused if the lightbox is ever completed.

---

## ReviewMatchesDialog.tsx

**Purpose:** Sheet/drawer for bulk-reviewing AI-suggested preset matches.

**Flow:**
1. Results.tsx calls `matchPresets()` API with user's presets + estimate items
2. Returns `PresetMatch[]` — suggested mappings of items to presets
3. User opens ReviewMatchesDialog to review all suggestions at once
4. Can "Apply All Compatible" or review individually
5. Applied matches become `ItemOverride` entries in `ProjectOverrides`
6. Overrides are saved via `saveProjectOverrides()` API

---

## ShareButton.tsx + ShareModal.tsx

**Purpose:** Project sharing UI.

- `ShareButton` — simple button that opens `ShareModal`
- `ShareModal` — full dialog with:
  - Email invite (enter email + permission level)
  - Link sharing (generate link, copy to clipboard)
  - Current shares list with permission editing
  - Revoke access

**API calls:** `createEmailShare`, `createLinkShare`, `listShares`, `updateShare`, `revokeShare`

---

## Data Types Cheat Sheet

| Type | Source | Used For |
|------|--------|----------|
| `MaterialItem` | `constants.ts` | UI view model for material rows |
| `LaborItem` | `constants.ts` | UI view model for labor rows |
| `Anomaly` | `constants.ts` | Anomaly flag display |
| `PresetMatch` | `types/index.ts` | AI-suggested preset mapping |
| `ItemOverride` | `types/index.ts` | Applied override record |
| `ProjectOverrides` | `types/index.ts` | Full overrides blob (material + labor + percentages) |
| `MaterialPreset` | `app-context.tsx` | User's saved material presets |
| `LaborPreset` | `app-context.tsx` | User's saved labor presets |
| `AggregatedEstimate` | `types/index.ts` | Full estimate response from backend |
| `EstimateLineItem` | `types/index.ts` | Raw line item from backend (mapped to MaterialItem/LaborItem in Results.tsx) |

## Do NOT

- Add new results sub-components without wiring them through `Results.tsx`
- Use raw `fetch()` — always go through `api.ts`
- Modify `MaterialItem`/`LaborItem` types without checking both MaterialsTable AND LaborTable
- Touch `DocumentChat`'s Supabase persistence without understanding it bypasses the API layer
