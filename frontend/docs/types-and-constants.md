# Types & Constants

## Overview

Type definitions are spread across three files, each serving a different purpose:

| File | Contains | Purpose |
|------|----------|---------|
| `src/types/index.ts` | Backend API response types | Matches what the FastAPI backend sends/receives |
| `src/lib/constants.ts` | Enum arrays + UI view model types | Dropdown options, UI-facing interfaces |
| `src/lib/app-context.tsx` | Settings/state types | Types for the global context state |

## `src/types/index.ts` — Backend Types

These interfaces match the exact shape of FastAPI backend responses. If the backend changes, these must update too.

### Enums / Unions

| Type | Values |
|------|--------|
| `Trade` | `'general_contractor' \| 'electrical' \| 'plumbing' \| 'hvac' \| ...` (15 values) |
| `FacilityType` | `'occupied_retail' \| 'hospital' \| 'school' \| ...` (17 values) |
| `ProjectType` | `'new_build' \| 'renovation_restoration' \| ...` (11 values) |
| `ConfidenceLevel` | `'high' \| 'medium' \| 'low'` |
| `ProjectStatus` | `'running' \| 'completed' \| 'error' \| 'partial'` |
| `StageStatus` | `'pending' \| 'running' \| 'completed' \| 'failed' \| 'warning'` |
| `AnomalyType` | `'priced_in' \| 'noted'` |
| `ProjectRole` | `'owner' \| 'editor' \| 'viewer'` |
| `SharePermission` | `'viewer' \| 'editor'` |
| `ChatMode` | `'auto' \| 'deep_search'` |

### Core Data Types

**`BackendProject`** — Raw project from backend API:
```ts
{
  id, project_address, trade, facility_type, project_type,
  project_description, status, created_at, completed_at?,
  total_estimate?, confidence_distribution?, total_documents,
  total_pages, error_message?, output_dir?, role?, shared_by?
}
```
→ Mapped to `Project` (UI shape) by `backendProjectToProject()` in app-context.tsx

**`AggregatedEstimate`** — Full estimate response:
```ts
{
  project_address, facility_type, project_type, trade, is_gc_mode,
  generated_at, line_items: EstimateLineItem[], trade_sections?,
  trade_subtotals?, dedup_notes, cost_summary, confidence_distribution,
  anomaly_report, parsing_warnings, bls_area_used, bls_wage_rates,
  total_documents_parsed, total_pages_parsed
}
```

**`EstimateLineItem`** — Individual line item (has both material AND labor fields):
```ts
{
  item_id, description, quantity, unit,
  has_material, material_unit_cost?, material_extended_cost?, material_confidence?,
  has_labor, labor_hours?, labor_hourly_rate?, labor_cost?, labor_confidence?,
  total_cost, overall_confidence, source_refs?
}
```

**Important:** `EstimateLineItem` is the backend's unified format. The frontend splits these into `MaterialItem[]` and `LaborItem[]` (from constants.ts) in `Results.tsx` based on `has_material`/`has_labor` flags.

### Validation & Voice

```ts
ValidationResult { valid, summary, questions: ValidationQuestion[], _error? }
TranscriptionResult { text, duration_seconds }
```

### Chat Types

```ts
ChatMessage { id, role, content, references?, tier_used?, model_used?, confidence?, intent?, reasoning_summary?, timestamp }
ChatResponse { answer, references: ChatReference[], tier_used, model_used, reasoning_summary, confidence, intent }
ChatReference { doc_index, doc_name, page_number, description, image_url }
```

### Preset Matching & Overrides

```ts
MatchPresetsRequest { material_presets, labor_presets, material_items, labor_items }
MatchPresetsResponse { material_matches: PresetMatch[], labor_matches: PresetMatch[] }
PresetMatch { item_id, preset_id, confidence, reasoning }
ItemOverride { preset_id, preset_name, original_value, override_value, type }
ProjectOverrides { material: Record<string,ItemOverride>, labor: Record<string,ItemOverride>, markupPercent?, overheadPercent?, contingencyPercent? }
```

### Summary Types

```ts
OverallSummary { headline, classification, building_info, document_set, trades_in_scope, key_constraints, parties, narrative }
TradeSummary { headline, scope_overview, key_quantities, site_conditions, labor_snapshot, anomalies, confidence_summary, assumptions }
SummaryResponse<T> { job_id, summary: T, cached }
```

### Document Types

```ts
ProjectDocument { doc_index, filename, file_type, total_pages, document_type?, relevance_tier?, storage_path? }
DocumentPdfResponse { url, filename, total_pages, expires_in }
DocumentSearchResult { doc_index, page_number, filename?, snippet, text_content?, rank? }
DocumentSearchResponse { query, results: DocumentSearchResult[], total_results }
```

---

## `src/lib/constants.ts` — Enum Arrays & UI Types

### Constant Arrays

Used to populate dropdown menus and selection grids across the app:

| Constant | Shape | Used By |
|----------|-------|---------|
| `TRADES` | `{ value, label, subtitle? }[]` | SelectTrades, NewEstimate, Onboarding, SettingsPage, ComboTooltip |
| `FACILITY_TYPES` | `{ value, label }[]` | NewEstimate |
| `PROJECT_TYPES` | `{ value, label }[]` | NewEstimate |
| `UNITS` | `string[]` (e.g., "each", "LF", "SF") | Onboarding, SettingsPage |

All arrays are `as const` for type safety.

### UI View Model Types

These are the **frontend representation** of line items, mapped from `EstimateLineItem` in Results.tsx:

**`MaterialItem`** — Material line item with range data:
```ts
{
  id, description, qty, unit, unitCost, total, confidence, confidenceNotes,
  costLow, costExpected, costHigh,
  source: { document, page },
  detail: { pricingMethod, sources: {name,url}[], notes }
}
```

**`LaborItem`** — Labor line item with range data:
```ts
{
  id, description, crew, hours, hourlyRate, total, confidence, confidenceNotes,
  hoursLow, hoursExpected, hoursHigh, rateLow, rateExpected, rateHigh,
  source: { document, page },
  detail: { hoursBreakdown, productivityRate, reasoning, siteAdjustments }
}
```

**`Anomaly`** — Anomaly flag:
```ts
{
  id, type: "priced_in"|"noted", category, description, affectedItems, costImpact
}
```

---

## `src/lib/app-context.tsx` — State Types

| Type | Shape |
|------|-------|
| `Project` | UI-friendly project (camelCase, parsed address) |
| `Settings` | Full user settings blob |
| `MaterialPreset` | `{ id, name, unitPrice, unit }` |
| `LaborPreset` | `{ id, role, hourlyRate }` |

---

## Type Mapping Flow

```
Backend (FastAPI)
  → BackendProject (snake_case, combined address)
  → backendProjectToProject() in app-context.tsx
  → Project (camelCase, split address fields)

Backend (FastAPI)
  → AggregatedEstimate.line_items: EstimateLineItem[]
  → Results.tsx mapping logic
  → MaterialItem[] + LaborItem[] (UI view models in constants.ts)
```

## Do NOT

- Change `types/index.ts` without verifying the backend still sends that shape
- Add new types to `constants.ts` that represent backend responses — those go in `types/index.ts`
- Rename fields in `BackendProject` without updating `backendProjectToProject()`
- Modify `MaterialItem`/`LaborItem` without checking both MaterialsTable and LaborTable
- Assume `EstimateLineItem` maps 1:1 to `MaterialItem` or `LaborItem` — the mapping happens in Results.tsx
