# Plan2Bid Database Schema Reference

Complete schema reference for the Supabase PostgreSQL database powering Plan2Bid.
The new backend must write to these exact tables in the exact same format so the
React frontend (bid-buddy/) works unchanged.

**Database**: Supabase project `qglwmwmdoxopnubghnul.supabase.co`
**Access**: Backend uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Frontend uses
`SUPABASE_ANON_KEY` + user JWT (RLS enforced).

---

## Table of Contents

1. [Core Pipeline Tables](#1-core-pipeline-tables)
2. [Sharing Tables](#2-sharing-tables)
3. [Scenario Tables](#3-scenario-tables)
4. [User Tables](#4-user-tables)
5. [Other Tables](#5-other-tables)
6. [RLS Policies](#6-rls-policies)
7. [Database Functions & Triggers](#7-database-functions--triggers)
8. [Indexes](#8-indexes)
9. [Supabase Storage](#9-supabase-storage)
10. [Pipeline Data Flow](#10-pipeline-data-flow)
11. [Frontend Direct Supabase Access](#11-frontend-direct-supabase-access)
12. [Migration History](#12-migration-history)

---

## 1. Core Pipeline Tables

### 1.1 `projects`

Central table. All other pipeline tables FK to this via `project_id`.
Project IDs use format `est_{hex}` (TEXT, not UUID).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | TEXT | NO | — | **PRIMARY KEY** |
| `user_id` | UUID | NO | — | References auth.users(id) implicitly |
| `project_name` | TEXT | NO | `''` | |
| `project_address` | TEXT | NO | `''` | Combined full address string |
| `street_address` | TEXT | NO | `''` | |
| `city` | TEXT | NO | `''` | |
| `state` | TEXT | NO | `''` | |
| `zip_code` | TEXT | NO | `''` | |
| `facility_type` | TEXT | NO | `'other'` | Enum value or `other:Custom Text` |
| `project_type` | TEXT | NO | `'new_build'` | Enum value or `other:Custom Text` |
| `trade` | TEXT | NO | `'electrical'` | Primary/legacy single trade |
| `selected_trades` | JSONB | NO | `'[]'` | Array of trade strings for GC mode |
| `project_description` | TEXT | NO | `''` | |
| `status` | TEXT | NO | `'queued'` | CHECK: `queued`, `running`, `error`, `completed` |
| `stage` | TEXT | NO | `'queued'` | Current pipeline stage name |
| `message` | TEXT | NO | `'Waiting in queue...'` | Status message for frontend |
| `queue_position` | INTEGER | YES | — | |
| `queued_at` | TIMESTAMPTZ | YES | — | |
| `progress` | INTEGER | NO | `0` | 0-100 percentage |
| `error_message` | TEXT | YES | — | |
| `total_documents` | INTEGER | NO | `0` | |
| `total_pages` | INTEGER | NO | `0` | |
| `total_estimate` | DOUBLE PRECISION | YES | — | |
| `warnings` | JSONB | NO | `'[]'` | Pipeline warning objects |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `completed_at` | TIMESTAMPTZ | YES | — | |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | |

**Facility type values**: `occupied_retail`, `hospital`, `school`, `industrial`, `residential`, `office`, `warehouse`, `restaurant`, `data_center`, `multi_family`, `hotel`, `religious_assembly`, `parking_structure`, `mixed_use`, `government`, `laboratory`, `other`

**Project type values**: `new_build`, `renovation_restoration`, `shell_and_prep`, `lot_clearing`, `tenant_improvement`, `addition`, `demolition`, `systems_replacement`, `seismic_retrofit`, `site_work`, `other`

**Trade values**: `general_contractor`, `electrical`, `plumbing`, `hvac`, `concrete`, `demolition`, `framing`, `drywall`, `roofing`, `painting`, `flooring`, `landscaping`, `fire_protection`, `structural_steel`, `low_voltage`

---

### 1.2 `project_logs`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `level` | TEXT | NO | `'info'` | Typically: `info`, `warning`, `error` |
| `message` | TEXT | NO | `''` | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

### 1.3 `documents`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `doc_index` | INTEGER | NO | — | |
| `filename` | TEXT | NO | `''` | |
| `total_pages` | INTEGER | NO | `0` | |
| `fully_parsed` | BOOLEAN | NO | `FALSE` | |
| `quality_score` | DOUBLE PRECISION | NO | `0.0` | |
| `document_type` | TEXT | NO | `'unclassified'` | |
| `document_purpose` | TEXT | NO | `''` | |
| `relevance_tier` | TEXT | NO | `'unknown'` | |
| `relevance_notes` | TEXT | NO | `''` | |
| `document_date` | TEXT | YES | — | |
| `date_source` | TEXT | YES | — | |
| `classification_confidence` | DOUBLE PRECISION | YES | — | |
| `classification_notes` | TEXT | NO | `''` | |
| `extra_notes` | TEXT | NO | `''` | |
| `trade_relevance` | JSONB | NO | `'[]'` | |
| `notable_findings` | JSONB | NO | `'[]'` | |
| `scope_indicators` | JSONB | NO | `'[]'` | |
| `table_of_contents` | JSONB | NO | `'[]'` | |
| `storage_path` | TEXT | YES | — | Path in Supabase Storage |
| `partial_parse_warnings` | JSONB | NO | `'[]'` | |

**UNIQUE**: `(project_id, doc_index)`

---

### 1.4 `parsed_pages`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `doc_index` | INTEGER | NO | — | |
| `page_number` | INTEGER | NO | — | |
| `text_content` | TEXT | NO | `''` | |
| `tables` | JSONB | NO | `'[]'` | |
| `diagrams` | JSONB | NO | `'[]'` | |
| `has_content` | BOOLEAN | NO | `FALSE` | |
| `text_search` | TSVECTOR | YES | — | Auto-populated by trigger |

**UNIQUE**: `(project_id, doc_index, page_number)`

The `text_search` column is auto-populated by `trg_parsed_pages_search` trigger (see Section 7).

---

### 1.5 `project_briefs`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **PRIMARY KEY**, **FK** projects(id) ON DELETE CASCADE |
| `project_classification` | TEXT | NO | `''` | Legacy column |
| `facility_description` | TEXT | NO | `''` | Legacy column |
| `key_findings` | JSONB | NO | `'[]'` | Legacy column |
| `scope_summary` | TEXT | NO | `''` | Legacy column |
| `document_summary` | TEXT | NO | `''` | Legacy column |
| `extraction_focus` | TEXT | NO | `''` | Legacy column |
| `generation_notes` | TEXT | NO | `''` | Legacy column |
| `brief_data` | JSONB | YES | — | **Preferred**: full brief blob with 20+ fields |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

**Read pattern**: Backend prefers `brief_data` JSONB blob if available, falls back to individual legacy columns.

---

### 1.6 `extraction_items`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `item_id` | TEXT | NO | `''` | |
| `trade` | TEXT | NO | `''` | |
| `description` | TEXT | NO | `''` | |
| `quantity` | DOUBLE PRECISION | NO | `0` | |
| `unit` | TEXT | NO | `''` | |
| `spec_reference` | TEXT | YES | — | |
| `model_number` | TEXT | YES | — | |
| `manufacturer` | TEXT | YES | — | |
| `material_description` | TEXT | YES | — | |
| `notes` | TEXT | YES | — | |
| `work_action` | TEXT | YES | — | |
| `line_item_type` | TEXT | YES | — | |
| `bid_group` | TEXT | YES | — | |
| `source_refs` | JSONB | NO | `'[]'` | |
| `is_material` | BOOLEAN | NO | `FALSE` | |
| `is_labor` | BOOLEAN | NO | `FALSE` | |
| `extraction_confidence` | TEXT | NO | `'medium'` | |
| `ambiguity_flag` | TEXT | YES | — | |
| `document_gap_note` | TEXT | YES | — | Added by migration 005 |

**UNIQUE**: `(project_id, trade, item_id)` (changed from `(project_id, item_id)` by migration 002)

---

### 1.7 `extraction_metadata`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | `''` | |
| `total_items` | INTEGER | NO | `0` | |
| `material_items` | INTEGER | NO | `0` | |
| `labor_items` | INTEGER | NO | `0` | |
| `extraction_summary` | TEXT | NO | `''` | |
| `documents_searched` | INTEGER | NO | `0` | |
| `pages_searched` | INTEGER | NO | `0` | |
| `warnings` | JSONB | NO | `'[]'` | |
| `trade_notes` | JSONB | NO | `'[]'` | Added by migration 005 |
| `spec_requirements` | JSONB | NO | `'[]'` | Added by migration 005 |
| `labor_impact_findings` | JSONB | NO | `'[]'` | Added by migration 005 |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

**PRIMARY KEY**: `(project_id, trade)` (changed from `project_id` only by migration 002)

---

### 1.8 `material_items`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `item_id` | TEXT | NO | `''` | |
| `trade` | TEXT | NO | `''` | |
| `description` | TEXT | NO | `''` | |
| `quantity` | DOUBLE PRECISION | NO | `0` | |
| `unit` | TEXT | NO | `''` | |
| `spec_reference` | TEXT | YES | — | |
| `model_number` | TEXT | YES | — | |
| `manufacturer` | TEXT | YES | — | |
| `material_description` | TEXT | YES | — | |
| `unit_cost_low` | DOUBLE PRECISION | NO | `0` | |
| `unit_cost_expected` | DOUBLE PRECISION | NO | `0` | |
| `unit_cost_high` | DOUBLE PRECISION | NO | `0` | |
| `extended_cost_low` | DOUBLE PRECISION | NO | `0` | |
| `extended_cost_expected` | DOUBLE PRECISION | NO | `0` | |
| `extended_cost_high` | DOUBLE PRECISION | NO | `0` | |
| `confidence` | TEXT | NO | `'medium'` | `high`, `medium`, `low` |
| `price_sources` | JSONB | NO | `'[]'` | |
| `pricing_method` | TEXT | NO | `''` | |
| `pricing_notes` | TEXT | YES | — | |
| `reasoning` | TEXT | YES | — | |
| `work_action` | TEXT | YES | — | |
| `line_item_type` | TEXT | YES | — | |
| `bid_group` | TEXT | YES | — | |
| `source_refs` | JSONB | NO | `'[]'` | |
| `is_labor` | BOOLEAN | NO | `FALSE` | |
| `extraction_confidence` | TEXT | NO | `'medium'` | |

**UNIQUE**: `(project_id, trade, item_id)`

---

### 1.9 `material_metadata`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | `''` | |
| `total_material_cost` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_low` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_expected` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_high` | DOUBLE PRECISION | NO | `0` | |
| `items_high_confidence` | INTEGER | NO | `0` | |
| `items_medium_confidence` | INTEGER | NO | `0` | |
| `items_low_confidence` | INTEGER | NO | `0` | |
| `search_api_calls` | INTEGER | NO | `0` | |
| `reasoning_api_calls` | INTEGER | NO | `0` | |
| `pricing_warnings` | JSONB | NO | `'[]'` | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

**PRIMARY KEY**: `(project_id, trade)`

---

### 1.10 `labor_items`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `item_id` | TEXT | NO | `''` | |
| `trade` | TEXT | NO | `''` | |
| `description` | TEXT | NO | `''` | |
| `quantity` | DOUBLE PRECISION | NO | `0` | |
| `unit` | TEXT | NO | `''` | |
| `crew` | JSONB | NO | `'[]'` | Array of crew member objects |
| `total_labor_hours` | DOUBLE PRECISION | NO | `0` | |
| `productivity_rate` | TEXT | YES | — | |
| `economies_of_scale_applied` | BOOLEAN | NO | `FALSE` | |
| `base_hours` | DOUBLE PRECISION | NO | `0` | |
| `adjusted_hours` | DOUBLE PRECISION | NO | `0` | |
| `site_adjustments` | JSONB | NO | `'[]'` | |
| `blended_hourly_rate` | DOUBLE PRECISION | NO | `0` | |
| `labor_cost` | DOUBLE PRECISION | NO | `0` | |
| `hours_low` | DOUBLE PRECISION | NO | `0` | |
| `hours_expected` | DOUBLE PRECISION | NO | `0` | |
| `hours_high` | DOUBLE PRECISION | NO | `0` | |
| `cost_low` | DOUBLE PRECISION | NO | `0` | |
| `cost_expected` | DOUBLE PRECISION | NO | `0` | |
| `cost_high` | DOUBLE PRECISION | NO | `0` | |
| `confidence` | TEXT | NO | `'medium'` | `high`, `medium`, `low` |
| `reasoning_notes` | TEXT | NO | `''` | |
| `source_refs` | JSONB | NO | `'[]'` | |
| `extraction_confidence` | TEXT | NO | `'medium'` | |

**UNIQUE**: `(project_id, trade, item_id)`

---

### 1.11 `labor_metadata`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | `''` | |
| `total_labor_cost` | DOUBLE PRECISION | NO | `0` | |
| `total_labor_hours` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_low` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_expected` | DOUBLE PRECISION | NO | `0` | |
| `total_cost_high` | DOUBLE PRECISION | NO | `0` | |
| `total_hours_low` | DOUBLE PRECISION | NO | `0` | |
| `total_hours_expected` | DOUBLE PRECISION | NO | `0` | |
| `total_hours_high` | DOUBLE PRECISION | NO | `0` | |
| `bls_area_used` | TEXT | NO | `''` | |
| `bls_wage_data` | JSONB | NO | `'{}'` | |
| `items_high_confidence` | INTEGER | NO | `0` | |
| `items_medium_confidence` | INTEGER | NO | `0` | |
| `items_low_confidence` | INTEGER | NO | `0` | |
| `estimation_warnings` | JSONB | NO | `'[]'` | |
| `site_condition_adjustments` | JSONB | NO | `'[]'` | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

**PRIMARY KEY**: `(project_id, trade)`

---

### 1.12 `anomaly_flags`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | `''` | |
| `anomaly_type` | TEXT | NO | `'noted'` | `priced_in` or `noted` |
| `category` | TEXT | NO | `''` | |
| `description` | TEXT | NO | `''` | |
| `affected_items` | JSONB | NO | `'[]'` | |
| `cost_impact` | DOUBLE PRECISION | YES | — | |

---

### 1.13 `site_intelligence`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **PRIMARY KEY**, **FK** projects(id) ON DELETE CASCADE |
| `item_annotations` | JSONB | NO | `'[]'` | |
| `project_findings` | JSONB | NO | `'[]'` | |
| `procurement_intel` | JSONB | NO | `'{}'` | |
| `estimation_guidance` | JSONB | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

### 1.14 `pipeline_summaries`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **PRIMARY KEY**, **FK** projects(id) ON DELETE CASCADE |
| `summary_data` | JSONB | NO | `'{}'` | Full pipeline summary blob |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

### 1.15 `project_summaries`

LLM-generated display summaries (trade-level and overall).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | **PRIMARY KEY**, **FK** projects(id) ON DELETE CASCADE |
| `trade_summary` | JSONB | YES | — | |
| `overall_summary` | JSONB | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

## 2. Sharing Tables

### 2.1 `project_shares`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `shared_with_user_id` | UUID | YES | — | **FK** auth.users(id) ON DELETE CASCADE |
| `shared_with_email` | TEXT | YES | — | |
| `permission` | TEXT | NO | `'viewer'` | CHECK: `viewer`, `editor` |
| `share_type` | TEXT | NO | `'email'` | CHECK: `email`, `link` |
| `share_token` | TEXT | YES | — | **UNIQUE** |
| `invited_by` | UUID | NO | — | **FK** auth.users(id) |
| `accepted_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `trades_scope` | JSONB | YES | — | Array of trades for bid requests |
| `purpose` | TEXT | NO | `'share'` | CHECK: `share`, `bid_request` |
| `allow_competitive_view` | BOOLEAN | NO | `false` | |
| `send_documents` | BOOLEAN | NO | `false` | |

**UNIQUE** (original): `(project_id, shared_with_user_id)`
**UNIQUE partial index**: `(project_id, shared_with_email) WHERE purpose = 'share' AND shared_with_email IS NOT NULL`

---

### 2.2 `subcontractors`

GC's saved contact book.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | **PRIMARY KEY** |
| `user_id` | UUID | NO | — | **FK** auth.users(id) ON DELETE CASCADE |
| `company_name` | TEXT | NO | — | |
| `contact_name` | TEXT | NO | — | |
| `email` | TEXT | NO | — | |
| `phone` | TEXT | YES | — | |
| `trades` | JSONB | NO | `'[]'` | |
| `notes` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | |

**UNIQUE**: `(user_id, email)`

---

### 2.3 `sub_submissions`

One bid per share per trade.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `share_id` | BIGINT | NO | — | **FK** project_shares(id) ON DELETE CASCADE |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | — | |
| `submitted_by` | UUID | YES | — | **FK** auth.users(id) |
| `company_name` | TEXT | NO | `''` | |
| `contact_name` | TEXT | NO | `''` | |
| `total_material` | NUMERIC | YES | — | |
| `total_labor` | NUMERIC | YES | — | |
| `total_bid` | NUMERIC | YES | — | |
| `notes` | TEXT | YES | — | |
| `status` | TEXT | NO | `'draft'` | CHECK: `draft`, `submitted` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `submitted_at` | TIMESTAMPTZ | YES | — | |

**UNIQUE**: `(share_id, trade)`

---

### 2.4 `sub_submission_items`

Line-level pricing from subcontractor bids.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `submission_id` | BIGINT | NO | — | **FK** sub_submissions(id) ON DELETE CASCADE |
| `item_id` | TEXT | NO | — | |
| `material_unit_cost` | NUMERIC | YES | — | |
| `material_extended_cost` | NUMERIC | YES | — | |
| `labor_hours` | NUMERIC | YES | — | |
| `labor_hourly_rate` | NUMERIC | YES | — | |
| `labor_cost` | NUMERIC | YES | — | |
| `notes` | TEXT | YES | — | |
| `description` | TEXT | YES | — | For sub-added items |
| `quantity` | NUMERIC | YES | — | For sub-added items |
| `unit` | TEXT | YES | — | For sub-added items |
| `is_addition` | BOOLEAN | NO | `false` | True = sub added this item |

**UNIQUE**: `(submission_id, item_id)`

---

## 3. Scenario Tables

### 3.1 `scenarios`

What-if variations of a project estimate.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | TEXT | NO | — | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `parent_scenario_id` | TEXT | YES | — | **FK** scenarios(id) ON DELETE CASCADE (self-ref) |
| `name` | TEXT | NO | — | |
| `context` | TEXT | NO | — | Modified assumptions text |
| `summary` | TEXT | YES | — | |
| `reasoning` | TEXT | YES | — | Top cost movers narrative |
| `status` | TEXT | NO | `'pending'` | CHECK: `pending`, `running`, `completed`, `error` |
| `progress` | INTEGER | NO | `0` | |
| `error_message` | TEXT | YES | — | |
| `created_by` | UUID | YES | — | **FK** auth.users(id) |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

### 3.2 `scenario_material_metadata`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `scenario_id` | TEXT | NO | — | **FK** scenarios(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | — | |
| `total_cost_expected` | NUMERIC | NO | `0` | |
| `total_cost_low` | NUMERIC | NO | `0` | |
| `total_cost_high` | NUMERIC | NO | `0` | |
| `items_high_confidence` | INTEGER | NO | `0` | |
| `items_medium_confidence` | INTEGER | NO | `0` | |
| `items_low_confidence` | INTEGER | NO | `0` | |
| `search_api_calls` | INTEGER | NO | `0` | |
| `reasoning_api_calls` | INTEGER | NO | `0` | |

**PRIMARY KEY**: `(scenario_id, trade)`

---

### 3.3 `scenario_material_items`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `scenario_id` | TEXT | NO | — | **FK** scenarios(id) ON DELETE CASCADE |
| `project_id` | TEXT | NO | — | |
| `trade` | TEXT | NO | — | |
| `item_id` | TEXT | NO | — | |
| `description` | TEXT | NO | `''` | |
| `quantity` | NUMERIC | NO | `0` | |
| `unit` | TEXT | NO | `''` | |
| `unit_cost_low` | NUMERIC | NO | `0` | |
| `unit_cost_expected` | NUMERIC | NO | `0` | |
| `unit_cost_high` | NUMERIC | NO | `0` | |
| `extended_cost_low` | NUMERIC | NO | `0` | |
| `extended_cost_expected` | NUMERIC | NO | `0` | |
| `extended_cost_high` | NUMERIC | NO | `0` | |
| `confidence` | TEXT | NO | `'medium'` | |
| `pricing_method` | TEXT | YES | `''` | |
| `pricing_notes` | TEXT | YES | — | |
| `reasoning` | TEXT | YES | — | |
| `price_sources` | JSONB | YES | `'[]'` | |
| `work_action` | TEXT | YES | — | |
| `line_item_type` | TEXT | YES | — | |
| `bid_group` | TEXT | YES | — | |
| `model_number` | TEXT | YES | — | |
| `manufacturer` | TEXT | YES | — | |
| `source_refs` | JSONB | YES | `'[]'` | |

---

### 3.4 `scenario_labor_metadata`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `scenario_id` | TEXT | NO | — | **FK** scenarios(id) ON DELETE CASCADE |
| `trade` | TEXT | NO | — | |
| `total_cost_expected` | NUMERIC | NO | `0` | |
| `total_cost_low` | NUMERIC | NO | `0` | |
| `total_cost_high` | NUMERIC | NO | `0` | |
| `total_hours_expected` | NUMERIC | NO | `0` | |
| `total_hours_low` | NUMERIC | NO | `0` | |
| `total_hours_high` | NUMERIC | NO | `0` | |
| `items_high_confidence` | INTEGER | NO | `0` | |
| `items_medium_confidence` | INTEGER | NO | `0` | |
| `items_low_confidence` | INTEGER | NO | `0` | |
| `bls_area_used` | TEXT | YES | `''` | |
| `bls_wage_data` | JSONB | YES | `'{}'` | |

**PRIMARY KEY**: `(scenario_id, trade)`

---

### 3.5 `scenario_labor_items`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `scenario_id` | TEXT | NO | — | **FK** scenarios(id) ON DELETE CASCADE |
| `project_id` | TEXT | NO | — | |
| `trade` | TEXT | NO | — | |
| `item_id` | TEXT | NO | — | |
| `description` | TEXT | NO | `''` | |
| `quantity` | NUMERIC | NO | `0` | |
| `unit` | TEXT | NO | `''` | |
| `crew` | JSONB | YES | `'[]'` | |
| `total_labor_hours` | NUMERIC | NO | `0` | |
| `blended_hourly_rate` | NUMERIC | NO | `0` | |
| `labor_cost` | NUMERIC | NO | `0` | |
| `hours_low` | NUMERIC | NO | `0` | |
| `hours_expected` | NUMERIC | NO | `0` | |
| `hours_high` | NUMERIC | NO | `0` | |
| `cost_low` | NUMERIC | NO | `0` | |
| `cost_expected` | NUMERIC | NO | `0` | |
| `cost_high` | NUMERIC | NO | `0` | |
| `confidence` | TEXT | NO | `'medium'` | |
| `reasoning_notes` | TEXT | YES | `''` | |
| `site_adjustments` | JSONB | YES | `'[]'` | |
| `economies_of_scale_applied` | BOOLEAN | YES | `FALSE` | |
| `source_refs` | JSONB | YES | `'[]'` | |

---

### 3.6 `scenario_anomaly_flags`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `scenario_id` | TEXT | NO | — | **FK** scenarios(id) ON DELETE CASCADE |
| `project_id` | TEXT | NO | — | |
| `trade` | TEXT | NO | — | |
| `anomaly_type` | TEXT | NO | `'noted'` | CHECK: `priced_in`, `noted` |
| `category` | TEXT | YES | `''` | |
| `description` | TEXT | YES | `''` | |
| `affected_items` | JSONB | YES | `'[]'` | |
| `cost_impact` | NUMERIC | YES | — | |

---

## 4. User Tables

### 4.1 `profiles`

Auto-created on signup via trigger.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | **PRIMARY KEY** |
| `user_id` | UUID | NO | — | **UNIQUE**, **FK** auth.users(id) ON DELETE CASCADE |
| `display_name` | TEXT | YES | — | Also aliased as `full_name` in some triggers |
| `avatar_url` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### 4.2 `user_roles`

Auto-assigned `'user'` role on signup via trigger.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | **PRIMARY KEY** |
| `user_id` | UUID | NO | — | **FK** auth.users(id) ON DELETE CASCADE |
| `role` | `app_role` (ENUM) | NO | `'user'` | Values: `admin`, `moderator`, `user` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**UNIQUE**: `(user_id, role)`

**Custom type**: `CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');`

---

### 4.3 `user_preferences`

Frontend-owned. Stores saved trade combinations and settings.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `user_id` | UUID | NO | — | **PRIMARY KEY**, **FK** auth.users(id) ON DELETE CASCADE |
| `saved_combinations` | JSONB | NO | `'[]'` | |
| `settings` | JSONB | — | — | Frontend reads this for user settings |
| `onboarding_complete` | BOOLEAN | — | — | Frontend reads this for onboarding state |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

> **Note**: The tracked migration only creates `saved_combinations`. The `settings` and `onboarding_complete` columns were added directly via SQL editor. The frontend `supabase-settings.ts` reads/writes these columns directly via Supabase client.

---

### 4.4 `user_settings`

Backend-owned. Stores onboarding status and settings data (presets, markups).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `user_id` | UUID | NO | — | **PRIMARY KEY** (upsert on_conflict) |
| `onboarding_complete` | BOOLEAN | — | — | |
| `settings_data` | JSONB | — | — | |
| `updated_at` | TIMESTAMPTZ | — | — | |

> **Note**: Created via SQL editor, no tracked migration. Backend reads/writes via `queries.py`.

---

### 4.5 `signup_tokens`

Admin-generated invite codes for invite-only signup.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | (auto) | NO | — | **PRIMARY KEY** |
| `token` | TEXT | NO | — | **UNIQUE** |
| `created_by` | UUID | NO | — | |
| `label` | TEXT | YES | — | |
| `expires_at` | TIMESTAMPTZ | YES | — | |
| `is_active` | BOOLEAN | NO | — | |
| `used_by` | UUID | YES | — | |
| `used_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | — | |

> **Note**: Created via SQL editor, no tracked migration. Backend reads/writes via `queries.py`.

---

## 5. Other Tables

### 5.1 `chat_messages`

Frontend-owned. The **only** table the frontend writes to directly (besides user_preferences and project_overrides).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | GENERATED ALWAYS AS IDENTITY | **PRIMARY KEY** |
| `user_id` | UUID | NO | — | **FK** auth.users(id) |
| `project_id` | TEXT | NO | — | |
| `role` | TEXT | NO | — | CHECK: `user`, `assistant` |
| `content` | TEXT | NO | — | |
| `metadata` | JSONB | YES | `'{}'` | |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | |

---

### 5.2 `token_usage`

LLM token/cost tracking per pipeline stage.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | **PRIMARY KEY** |
| `project_id` | TEXT | NO | — | **FK** projects(id) ON DELETE CASCADE |
| `user_id` | UUID | NO | — | |
| `stage` | TEXT | NO | — | e.g. `classification`, `brief`, `extraction`, `context`, `pricing`, `labor` |
| `trade` | TEXT | YES | — | |
| `model` | TEXT | NO | — | |
| `input_tokens` | INTEGER | NO | `0` | |
| `output_tokens` | INTEGER | NO | `0` | |
| `cost_usd` | NUMERIC(10,6) | NO | `0` | |
| `api_calls` | INTEGER | NO | `1` | |
| `created_at` | TIMESTAMPTZ | YES | `now()` | |

---

### 5.3 `project_overrides`

Per-project markup/overhead/contingency overrides. Frontend reads/writes directly.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | Composite PK with user_id |
| `user_id` | UUID | NO | — | Composite PK with project_id |
| `overrides_data` | JSONB | — | — | `{ material: {}, labor: {}, markupPercent?, overheadPercent?, contingencyPercent? }` |
| `updated_at` | TIMESTAMPTZ | — | — | |

**Upsert on_conflict**: `project_id,user_id` (backend), `project_id` (frontend)

> **Note**: Created via SQL editor, no tracked migration.

---

### 5.4 `project_feedback`

Estimate accuracy ratings from users.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `project_id` | TEXT | NO | — | Composite unique with user_id |
| `user_id` | UUID | NO | — | Composite unique with project_id |
| `rating` | TEXT | NO | — | `high`, `low`, `spot_on` |
| `message` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | — | — | |

**Upsert on_conflict**: `project_id,user_id`

> **Note**: Created via SQL editor, no tracked migration.

---

## 6. RLS Policies

Every table has RLS enabled. The backend uses `SUPABASE_SERVICE_ROLE_KEY` which **bypasses all RLS**. These policies govern frontend direct access and defense-in-depth.

### Pattern A: Direct user ownership

| Table | Policy | Logic |
|-------|--------|-------|
| `profiles` | Users manage own profile | `auth.uid() = user_id` |
| `user_roles` | Users see own roles | `auth.uid() = user_id` (SELECT only) |
| `user_preferences` | Users read/insert/update own | `auth.uid() = user_id` |
| `chat_messages` | Users see own chat messages | `auth.uid() = user_id` |
| `subcontractors` | Users manage own subcontractors | `auth.uid() = user_id` |

### Pattern B: Project ownership chain (after sharing migration)

All pipeline child tables use this split pattern:

**SELECT**: Owner OR shared user can read:
```sql
EXISTS (SELECT 1 FROM projects WHERE projects.id = <table>.project_id AND (
    projects.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM project_shares WHERE project_shares.project_id = projects.id
               AND project_shares.shared_with_user_id = auth.uid())
))
```

**INSERT/UPDATE/DELETE**: Owner only:
```sql
EXISTS (SELECT 1 FROM projects WHERE projects.id = <table>.project_id AND projects.user_id = auth.uid())
```

Tables using this pattern: `projects`, `project_logs`, `documents`, `parsed_pages`, `project_briefs`, `extraction_items`, `extraction_metadata`, `material_items`, `material_metadata`, `labor_items`, `labor_metadata`, `anomaly_flags`, `site_intelligence`, `pipeline_summaries`, `project_summaries`

### Pattern C: Scenario chain

```sql
EXISTS (SELECT 1 FROM scenarios s JOIN projects p ON p.id = s.project_id
        WHERE s.id = <table>.scenario_id AND p.user_id = auth.uid())
```

Tables: `scenarios` (chains through projects), `scenario_material_metadata`, `scenario_material_items`, `scenario_labor_metadata`, `scenario_labor_items`, `scenario_anomaly_flags`

### Pattern D: project_shares

- "Owners manage shares": Owner of the project can do all operations
- "Shared users see own shares": `shared_with_user_id = auth.uid()` (SELECT only)

### Pattern E: Sub submissions

- "Owners see project submissions": Project owner can SELECT
- "Submitters manage own submissions": `submitted_by = auth.uid()` (all operations)
- Sub submission items chain through `sub_submissions.submitted_by` or project owner

### Pattern F: Token usage

- "Users read own usage": `auth.uid() = user_id` (SELECT)
- "Service role inserts": `WITH CHECK (true)` (INSERT — backend only)

### SECURITY DEFINER functions

- `has_role(user_id, role)` — avoids RLS recursion when checking roles
- `get_user_by_email(p_email)` — reads auth.users
- `claim_pending_shares()` — auto-claims shares on signup
- `handle_new_user()` — auto-creates profile
- `handle_new_user_role()` — auto-assigns 'user' role
- `search_parsed_pages(...)` — full-text search

---

## 7. Database Functions & Triggers

### Functions

#### `search_parsed_pages(p_project_id TEXT, p_query TEXT, p_doc_indices INTEGER[] DEFAULT NULL, p_limit INTEGER DEFAULT 10)`

Full-text search across parsed pages. Returns `(doc_index, filename, page_number, snippet)`.
Called via PostgREST RPC. SECURITY DEFINER.

```sql
RETURNS TABLE (doc_index INTEGER, filename TEXT, page_number INTEGER, snippet TEXT)
-- Joins parsed_pages with documents
-- Uses plainto_tsquery('english', p_query)
-- Returns ts_headline snippets (MaxFragments=1, MaxWords=50, MinWords=20)
-- Ordered by ts_rank descending
```

#### `get_user_by_email(p_email TEXT)`

Looks up auth.users by email. SECURITY DEFINER.
```sql
RETURNS TABLE (id UUID, email TEXT)
```

#### `has_role(user_id UUID, role app_role)`

Checks user_roles table. SECURITY DEFINER. Used by RLS policies to avoid recursion.

#### `handle_new_user()`

Trigger function. Auto-creates profile on signup. Pulls `full_name`/`name` and `avatar_url`/`picture` from `raw_user_meta_data` (supports Google OAuth). Uses `ON CONFLICT (user_id) DO UPDATE` to refresh on re-login.

#### `handle_new_user_role()`

Trigger function. Auto-assigns `'user'` role on signup. `ON CONFLICT DO NOTHING`.

#### `update_parsed_pages_search()`

Trigger function. Auto-populates `text_search` tsvector:
```sql
NEW.text_search := to_tsvector('english', NEW.text_content);
```

#### `update_updated_at_column()`

Generic trigger function. Sets `NEW.updated_at = now()`.

#### `claim_pending_shares()`

Trigger function. On auth.users INSERT, auto-claims pending email invites:
```sql
UPDATE project_shares SET shared_with_user_id = NEW.id, accepted_at = NOW()
WHERE shared_with_email = NEW.email AND shared_with_user_id IS NULL;
```

### Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `trg_parsed_pages_search` | `parsed_pages` | BEFORE INSERT OR UPDATE OF text_content | `update_parsed_pages_search()` |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` |
| `on_auth_user_role_assign` | `auth.users` | AFTER INSERT | `handle_new_user_role()` |
| `trg_claim_pending_shares` | `auth.users` | AFTER INSERT | `claim_pending_shares()` |
| `update_profiles_updated_at` | `profiles` | BEFORE UPDATE | `update_updated_at_column()` |

---

## 8. Indexes

| Table | Index Name | Columns | Type |
|-------|-----------|---------|------|
| `projects` | `idx_projects_user` | `(user_id)` | btree |
| `projects` | `idx_projects_status` | `(user_id, status)` | btree |
| `project_logs` | `idx_project_logs_project` | `(project_id, created_at)` | btree |
| `documents` | `idx_documents_project` | `(project_id, doc_index)` | btree |
| `parsed_pages` | `idx_parsed_pages_project` | `(project_id, doc_index, page_number)` | btree |
| `parsed_pages` | `idx_parsed_pages_fts` | `(text_search)` | **GIN** |
| `extraction_items` | `idx_extraction_items_project` | `(project_id)` | btree |
| `extraction_items` | `idx_extraction_items_description_trgm` | `(description gin_trgm_ops)` | **GIN (pg_trgm)** |
| `material_items` | `idx_material_items_project` | `(project_id)` | btree |
| `material_items` | `idx_material_items_trade` | `(project_id, trade)` | btree |
| `labor_items` | `idx_labor_items_project` | `(project_id)` | btree |
| `labor_items` | `idx_labor_items_trade` | `(project_id, trade)` | btree |
| `anomaly_flags` | `idx_anomaly_flags_project` | `(project_id)` | btree |
| `anomaly_flags` | `idx_anomaly_flags_trade` | `(project_id, trade)` | btree |
| `project_shares` | `idx_shares_project` | `(project_id)` | btree |
| `project_shares` | `idx_shares_user` | `(shared_with_user_id)` | btree |
| `project_shares` | `idx_shares_token` | `(share_token) WHERE share_token IS NOT NULL` | btree (partial) |
| `project_shares` | `project_shares_share_email_unique` | `(project_id, shared_with_email) WHERE purpose = 'share' AND shared_with_email IS NOT NULL` | btree (unique partial) |
| `subcontractors` | `idx_subcontractors_user` | `(user_id)` | btree |
| `sub_submissions` | `idx_sub_submissions_project` | `(project_id)` | btree |
| `sub_submissions` | `idx_sub_submissions_share` | `(share_id)` | btree |
| `sub_submission_items` | `idx_sub_submission_items_submission` | `(submission_id)` | btree |
| `scenarios` | `idx_scenarios_project` | `(project_id, created_at)` | btree |
| `scenarios` | `idx_scenarios_parent` | `(parent_scenario_id)` | btree |
| `scenario_material_items` | `idx_scenario_material_items_lookup` | `(scenario_id, trade)` | btree |
| `scenario_labor_items` | `idx_scenario_labor_items_lookup` | `(scenario_id, trade)` | btree |
| `scenario_anomaly_flags` | `idx_scenario_anomaly_flags_lookup` | `(scenario_id, trade)` | btree |
| `token_usage` | `idx_token_usage_project` | `(project_id)` | btree |
| `token_usage` | `idx_token_usage_user` | `(user_id)` | btree |
| `chat_messages` | `idx_chat_messages_project` | `(user_id, project_id, created_at)` | btree |

**Extensions required**: `pg_trgm` (for fuzzy search on extraction_items.description)

---

## 9. Supabase Storage

### Bucket: `project-documents`

- **Visibility**: Private (`public = FALSE`)
- **Path convention**: `{user_id}/{project_id}/source/{filename}`
- **Content**: Source PDFs and images uploaded during pipeline Stage 2.5a

**RLS Policy**:
```sql
CREATE POLICY "Users access own project documents" ON storage.objects
    FOR ALL USING (
        bucket_id = 'project-documents'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );
```

**Backend operations** (via service_role, bypasses storage RLS):
- `upload()` — with `upsert: "true"`, content-type detection
- `create_signed_url()` — 1 hour expiry for frontend PDF viewer
- `download()` — for chat page rendering

**Filename sanitization**: Brackets `[]` and `#` are replaced with `_` before upload.

---

## 10. Pipeline Data Flow

### Stage sequence and database writes

Each stage updates `projects.stage`, `projects.message`, and `projects.progress`.

| Stage | Name | `projects.stage` | Progress | Tables Written |
|-------|------|-------------------|----------|----------------|
| 1 | Ingestion | `ingestion` | 2-5% | `projects` (doc/page counts) |
| 2 | Parsing | `parsing` | 6-35% | `documents`, `parsed_pages` |
| 2.5a | Classification | `classification` | 36-40% | `documents` (classification fields updated), `token_usage`, Storage uploads |
| 2.5b | Brief Generation | `brief` | 41-45% | `project_briefs`, `token_usage` |
| — | Trade Resolution | — | — | Resolves `selected_trades` into actual trade list |
| 3 | Trade Extraction | `extraction` | 50-65% | `extraction_items`, `extraction_metadata`, `token_usage` |
| 3.5 | Context Agent | `context` | 66-67% | `site_intelligence`, `token_usage` |
| 4 | Material Pricing | `pricing_labor` | 68-85% | `material_items`, `material_metadata`, `token_usage` |
| 5 | Labor Estimation | `pricing_labor` | 68-85% | `labor_items`, `labor_metadata`, `anomaly_flags`, `token_usage` |
| — | Sanity Checks | — | 85% | `projects.warnings` (ratio + $/SF checks) |
| — | Summary | — | — | `pipeline_summaries` |
| Done | Completion | `completed` | 100% | `projects` (status=completed, total_estimate, completed_at) |

### `projects.status` transitions

```
queued -> running -> completed
                  -> error
```

### `projects.stage` values (in order)

```
queued -> ingestion -> parsing -> classification -> brief -> extraction -> context -> pricing_labor -> completed
```

### Write patterns per stage

**Stage 3 (extraction)**: Deletes old items for the specific trade first, then inserts new ones. Trade-scoped writes prevent parallel trades from interfering.

**Stages 4+5**: Run sequentially per trade (Stage 4 first, then Stage 5 receives pricing context). All trades run concurrently with each other. Same delete-then-insert pattern, trade-scoped.

**Stage 5**: Also writes `anomaly_flags` (delete old for trade, insert new).

### Multi-trade (GC) execution

```
Stages 1-2: Run ONCE (shared)
Stage 2.5a+b: Run ONCE (shared)
Stage 3: Fan out per trade (parallel via asyncio.gather)
Stage 3.5: Run ONCE (project-level)
Stages 4->5: Per trade, sequential (4 then 5). All trades concurrent.
```

### Scenario execution (what-if)

Scenarios only re-run Stages 4+5 with modified context. They write to:
- `scenarios` (status/progress updates)
- `scenario_material_items`, `scenario_material_metadata`
- `scenario_labor_items`, `scenario_labor_metadata`
- `scenario_anomaly_flags`

They do NOT touch the base estimate tables.

---

## 11. Frontend Direct Supabase Access

The frontend uses the Supabase client (`@supabase/supabase-js` with anon key + user JWT) to directly access these tables, **bypassing the backend API**:

### Direct reads

| Table | File | Operation | Columns |
|-------|------|-----------|---------|
| `user_roles` | `hooks/useRole.tsx` | SELECT | `role` WHERE `user_id, role='admin'` |
| `user_preferences` | `lib/supabase-settings.ts` | SELECT | `settings, onboarding_complete` |
| `project_overrides` | `lib/supabase-settings.ts` | SELECT | `overrides_data` |

### Direct writes

| Table | File | Operation | Details |
|-------|------|-----------|---------|
| `chat_messages` | `components/results/DocumentChat.tsx` | INSERT | `{ user_id, project_id, role, content, metadata }` |
| `user_preferences` | `lib/supabase-settings.ts` | UPSERT | `{ user_id, settings, onboarding_complete, updated_at }` on_conflict `user_id` |
| `project_overrides` | `lib/supabase-settings.ts` | UPSERT | `{ project_id, user_id, overrides_data, updated_at }` on_conflict `project_id` |

### Auth operations (all via Supabase client)

| File | Operations |
|------|-----------|
| `pages/Auth.tsx` | `signInWithPassword`, `signUp`, `signInWithOAuth` (Google), `resetPasswordForEmail` |
| `hooks/useAuth.tsx` | `onAuthStateChange`, `getSession`, `signOut` |
| `pages/SubcontractorBid.tsx` | `signUp`, `signInWithPassword`, `getSession`, `onAuthStateChange` |
| `pages/ResetPassword.tsx` | `updateUser` |
| `lib/api.ts` | `getSession` (to attach JWT to API calls) |

### Everything else goes through the backend API

All other data (projects, documents, extraction items, material items, labor items, anomaly flags, scenarios, sharing, subcontractors, admin operations, etc.) is accessed through the backend API at `/api/*`. The frontend API client (`bid-buddy/src/lib/api.ts`, 894 lines) defines the exact contract.

---

## 12. Migration History

### Backend migrations (`ESTIM8FCKINWORK/backend/db/migrations/`)

| File | Summary |
|------|---------|
| `schema.sql` | **Base schema**: 15 core tables, indexes, triggers, RLS, storage bucket, search function |
| `sharing_migration.sql` | **Sharing**: project_shares table, updated RLS on all child tables for shared access (SELECT), functions for email lookup + auto-claim |
| `002_add_multi_trade_support.sql` | **Multi-trade**: Added `selected_trades` to projects, `trade` column to material_items/labor_items/anomaly_flags, changed metadata PKs to composite `(project_id, trade)`, changed item UNIQUEs to `(project_id, trade, item_id)` |
| `003_add_project_warnings.sql` | **Warnings**: Added `warnings` JSONB column to projects |
| `004_add_scenario_reasoning.sql` | **Scenario reasoning**: Added `reasoning` TEXT column to scenarios |
| `005_add_extraction_metadata_fields.sql` | **Extraction metadata**: Added `trade_notes`, `spec_requirements`, `labor_impact_findings` JSONB columns |
| `005_add_document_gap_note.sql` | **Document gaps**: Added `document_gap_note` TEXT to extraction_items |
| `006_add_subcontractor_bidding.sql` | **Subcontractor bidding**: Extended project_shares with bid columns, created subcontractors, sub_submissions, sub_submission_items tables |
| `007_sub_enhancements.sql` | **Sub enhancements**: Added `send_documents` to project_shares, added `description`/`quantity`/`unit`/`is_addition` to sub_submission_items |

### Frontend migrations (`bid-buddy/supabase/migrations/`)

| File | Summary |
|------|---------|
| `20260302071411_*.sql` | **Profiles**: Created profiles table with auto-create trigger on signup |
| `20260302071818_*.sql` | **User roles**: Created user_roles table with app_role enum, auto-assign trigger, has_role function |
| `20260302072633_*.sql` | **RLS fixes**: Additional RLS policy refinements |
| `20260303071426_*.sql` | **Auth updates**: Updated profile trigger for Google OAuth metadata |
| `20260305073431_create_user_preferences.sql` | **User preferences**: Created user_preferences table with saved_combinations |
| `20260311201503_create_token_usage.sql` | **Token usage**: Created token_usage table with project FK and per-stage tracking |

### Tables with no tracked migration (created via SQL editor)

- `user_settings` — backend user preferences (onboarding + settings_data)
- `project_overrides` — per-project markup/overhead/contingency
- `project_feedback` — estimate accuracy ratings
- `signup_tokens` — admin invite codes
- `chat_messages` — chat conversation history
- `scenarios` + 5 child tables — what-if scenario data
- `project_summaries` — LLM-generated display summaries

---

## Relationship Diagram

```
auth.users(id)
  |
  +--< profiles(user_id)                     [1:1, auto-created]
  +--< user_roles(user_id)                   [1:N, auto-assigned]
  +--< user_preferences(user_id)             [1:1]
  +--< user_settings(user_id)                [1:1]
  +--< subcontractors(user_id)               [1:N]
  |
  +--< projects(user_id)                     [1:N]
        |
        +--< project_logs(project_id)
        +--< documents(project_id)
        |     +-- parsed_pages(project_id, doc_index)
        +--  project_briefs(project_id)          [1:1]
        +--< extraction_items(project_id, trade)
        +--< extraction_metadata(project_id, trade)  [PK]
        +--< material_items(project_id, trade)
        +--< material_metadata(project_id, trade)    [PK]
        +--< labor_items(project_id, trade)
        +--< labor_metadata(project_id, trade)       [PK]
        +--< anomaly_flags(project_id, trade)
        +--  site_intelligence(project_id)       [1:1]
        +--  pipeline_summaries(project_id)      [1:1]
        +--  project_summaries(project_id)       [1:1]
        +--< token_usage(project_id)
        +--< project_feedback(project_id, user_id)
        +--< project_overrides(project_id, user_id)
        +--< chat_messages(project_id)
        +--< project_shares(project_id)
        |     +--< sub_submissions(share_id)
        |           +--< sub_submission_items(submission_id)
        +--< scenarios(project_id)
              +--< scenarios(parent_scenario_id)      [self-ref]
              +--< scenario_material_metadata(scenario_id, trade)  [PK]
              +--< scenario_material_items(scenario_id)
              +--< scenario_labor_metadata(scenario_id, trade)     [PK]
              +--< scenario_labor_items(scenario_id)
              +--< scenario_anomaly_flags(scenario_id)
```
