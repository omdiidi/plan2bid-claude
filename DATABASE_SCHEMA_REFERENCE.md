# Plan2Bid Database Schema Reference — Full SQL Dump

**Source:** Supabase project `qglwmwmdoxopnubghnul.supabase.co`
**Last updated:** 2026-04-09
**Note:** This schema is for context only and is not meant to be run directly.

---

## Key Facts
- `projects.id` is **TEXT** (format `est_{hex}`), NOT UUID
- `scenarios.id` is **UUID**
- All pipeline tables FK to `projects(id)` via `project_id TEXT`
- Scenario mirror tables FK to `scenarios(id)` via `scenario_id UUID`

---

## Tables

### projects
```sql
CREATE TABLE public.projects (
  id text NOT NULL,
  user_id uuid NOT NULL,
  project_name text NOT NULL DEFAULT ''::text,
  project_address text NOT NULL DEFAULT ''::text,
  street_address text NOT NULL DEFAULT ''::text,
  city text NOT NULL DEFAULT ''::text,
  state text NOT NULL DEFAULT ''::text,
  zip_code text NOT NULL DEFAULT ''::text,
  facility_type text NOT NULL DEFAULT 'other'::text,
  trade text NOT NULL DEFAULT 'electrical'::text,
  project_description text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'running'::text CHECK (status = ANY (ARRAY['queued','running','error','completed'])),
  stage text NOT NULL DEFAULT 'ingestion'::text,
  message text NOT NULL DEFAULT 'Starting pipeline...'::text,
  progress integer NOT NULL DEFAULT 0,
  error_message text,
  total_documents integer NOT NULL DEFAULT 0,
  total_pages integer NOT NULL DEFAULT 0,
  total_estimate double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  project_type text NOT NULL DEFAULT 'new_build'::text,
  selected_trades jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_trade_name text,
  intake_answers jsonb,
  is_custom_trade boolean NOT NULL DEFAULT false,
  queued_at timestamptz,
  queue_position integer,
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);
```

### extraction_items
```sql
CREATE TABLE public.extraction_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  item_id text NOT NULL DEFAULT ''::text,
  trade text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  quantity double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT ''::text,
  spec_reference text,
  model_number text,
  manufacturer text,
  material_description text,
  notes text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_material boolean NOT NULL DEFAULT false,
  is_labor boolean NOT NULL DEFAULT false,
  extraction_confidence text NOT NULL DEFAULT 'medium'::text,
  ambiguity_flag text,
  work_action text,
  line_item_type text,
  bid_group text,
  document_gap_note text,
  CONSTRAINT extraction_items_pkey PRIMARY KEY (id),
  CONSTRAINT extraction_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### extraction_metadata
```sql
CREATE TABLE public.extraction_metadata (
  project_id text NOT NULL,
  trade text NOT NULL DEFAULT ''::text,
  total_items integer NOT NULL DEFAULT 0,
  material_items integer NOT NULL DEFAULT 0,
  labor_items integer NOT NULL DEFAULT 0,
  extraction_summary text NOT NULL DEFAULT ''::text,
  documents_searched integer NOT NULL DEFAULT 0,
  pages_searched integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  trade_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  spec_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  labor_impact_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT extraction_metadata_pkey PRIMARY KEY (project_id, trade),
  CONSTRAINT extraction_metadata_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### material_items
```sql
CREATE TABLE public.material_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  item_id text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  quantity double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT ''::text,
  spec_reference text,
  model_number text,
  manufacturer text,
  material_description text,
  unit_cost_low double precision NOT NULL DEFAULT 0,
  unit_cost_expected double precision NOT NULL DEFAULT 0,
  unit_cost_high double precision NOT NULL DEFAULT 0,
  extended_cost_low double precision NOT NULL DEFAULT 0,
  extended_cost_expected double precision NOT NULL DEFAULT 0,
  extended_cost_high double precision NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'medium'::text,
  price_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_method text NOT NULL DEFAULT ''::text,
  pricing_notes text,
  reasoning text,
  work_action text,
  line_item_type text,
  bid_group text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_labor boolean NOT NULL DEFAULT false,
  extraction_confidence text NOT NULL DEFAULT 'medium'::text,
  trade text NOT NULL DEFAULT ''::text,
  source_label text,
  CONSTRAINT material_items_pkey PRIMARY KEY (id),
  CONSTRAINT material_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### material_metadata
```sql
CREATE TABLE public.material_metadata (
  project_id text NOT NULL,
  trade text NOT NULL DEFAULT ''::text,
  total_material_cost double precision NOT NULL DEFAULT 0,
  total_cost_low double precision NOT NULL DEFAULT 0,
  total_cost_expected double precision NOT NULL DEFAULT 0,
  total_cost_high double precision NOT NULL DEFAULT 0,
  items_high_confidence integer NOT NULL DEFAULT 0,
  items_medium_confidence integer NOT NULL DEFAULT 0,
  items_low_confidence integer NOT NULL DEFAULT 0,
  search_api_calls integer NOT NULL DEFAULT 0,
  reasoning_api_calls integer NOT NULL DEFAULT 0,
  pricing_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_metadata_pkey PRIMARY KEY (project_id, trade),
  CONSTRAINT material_metadata_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### labor_items
```sql
CREATE TABLE public.labor_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  item_id text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  quantity double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT ''::text,
  crew jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_labor_hours double precision NOT NULL DEFAULT 0,
  productivity_rate text,
  economies_of_scale_applied boolean NOT NULL DEFAULT false,
  base_hours double precision NOT NULL DEFAULT 0,
  adjusted_hours double precision NOT NULL DEFAULT 0,
  site_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  blended_hourly_rate double precision NOT NULL DEFAULT 0,
  labor_cost double precision NOT NULL DEFAULT 0,
  hours_low double precision NOT NULL DEFAULT 0,
  hours_expected double precision NOT NULL DEFAULT 0,
  hours_high double precision NOT NULL DEFAULT 0,
  cost_low double precision NOT NULL DEFAULT 0,
  cost_expected double precision NOT NULL DEFAULT 0,
  cost_high double precision NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'medium'::text,
  reasoning_notes text NOT NULL DEFAULT ''::text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraction_confidence text NOT NULL DEFAULT 'medium'::text,
  trade text NOT NULL DEFAULT ''::text,
  source_label text,
  CONSTRAINT labor_items_pkey PRIMARY KEY (id),
  CONSTRAINT labor_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### labor_metadata
```sql
CREATE TABLE public.labor_metadata (
  project_id text NOT NULL,
  trade text NOT NULL DEFAULT ''::text,
  total_labor_cost double precision NOT NULL DEFAULT 0,
  total_labor_hours double precision NOT NULL DEFAULT 0,
  total_cost_low double precision NOT NULL DEFAULT 0,
  total_cost_expected double precision NOT NULL DEFAULT 0,
  total_cost_high double precision NOT NULL DEFAULT 0,
  total_hours_low double precision NOT NULL DEFAULT 0,
  total_hours_expected double precision NOT NULL DEFAULT 0,
  total_hours_high double precision NOT NULL DEFAULT 0,
  bls_area_used text NOT NULL DEFAULT ''::text,
  bls_wage_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  items_high_confidence integer NOT NULL DEFAULT 0,
  items_medium_confidence integer NOT NULL DEFAULT 0,
  items_low_confidence integer NOT NULL DEFAULT 0,
  estimation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  site_condition_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_metadata_pkey PRIMARY KEY (project_id, trade),
  CONSTRAINT labor_metadata_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### anomaly_flags
```sql
CREATE TABLE public.anomaly_flags (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  anomaly_type text NOT NULL DEFAULT 'noted'::text,
  category text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  affected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_impact double precision,
  trade text NOT NULL DEFAULT ''::text,
  CONSTRAINT anomaly_flags_pkey PRIMARY KEY (id),
  CONSTRAINT anomaly_flags_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### site_intelligence
```sql
CREATE TABLE public.site_intelligence (
  project_id text NOT NULL,
  item_annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  procurement_intel jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimation_guidance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_intelligence_pkey PRIMARY KEY (project_id),
  CONSTRAINT site_intelligence_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### project_briefs
```sql
CREATE TABLE public.project_briefs (
  project_id text NOT NULL,
  project_classification text NOT NULL DEFAULT ''::text,
  facility_description text NOT NULL DEFAULT ''::text,
  key_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_summary text NOT NULL DEFAULT ''::text,
  document_summary text NOT NULL DEFAULT ''::text,
  extraction_focus text NOT NULL DEFAULT ''::text,
  generation_notes text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  brief_data jsonb,
  CONSTRAINT project_briefs_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_briefs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### pipeline_summaries
```sql
CREATE TABLE public.pipeline_summaries (
  project_id text NOT NULL,
  summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_summaries_pkey PRIMARY KEY (project_id),
  CONSTRAINT pipeline_summaries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
```

### scenarios
```sql
CREATE TABLE public.scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  parent_scenario_id uuid,
  name text NOT NULL DEFAULT 'Untitled Scenario'::text,
  context text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending','running','completed','error'])),
  progress integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,
  reasoning text,
  CONSTRAINT scenarios_pkey PRIMARY KEY (id),
  CONSTRAINT scenarios_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT scenarios_parent_scenario_id_fkey FOREIGN KEY (parent_scenario_id) REFERENCES public.scenarios(id)
);
```

### scenario_material_items
```sql
CREATE TABLE public.scenario_material_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  scenario_id uuid NOT NULL,
  project_id text NOT NULL,
  trade text NOT NULL,
  item_id text NOT NULL,
  description text,
  quantity numeric,
  unit text,
  unit_cost_expected numeric,
  unit_cost_low numeric,
  unit_cost_high numeric,
  extended_cost_expected numeric,
  extended_cost_low numeric,
  extended_cost_high numeric,
  confidence text,
  pricing_method text,
  pricing_notes text,
  reasoning text,
  price_sources jsonb DEFAULT '[]'::jsonb,
  work_action text,
  line_item_type text,
  bid_group text,
  model_number text,
  manufacturer text,
  source_refs jsonb DEFAULT '[]'::jsonb,
  material_description text,
  CONSTRAINT scenario_material_items_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_material_items_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);
```

### scenario_material_metadata
```sql
CREATE TABLE public.scenario_material_metadata (
  scenario_id uuid NOT NULL,
  trade text NOT NULL,
  total_cost_expected numeric,
  total_cost_low numeric,
  total_cost_high numeric,
  items_high_confidence integer DEFAULT 0,
  items_medium_confidence integer DEFAULT 0,
  items_low_confidence integer DEFAULT 0,
  search_api_calls integer DEFAULT 0,
  reasoning_api_calls integer DEFAULT 0,
  CONSTRAINT scenario_material_metadata_pkey PRIMARY KEY (scenario_id, trade),
  CONSTRAINT scenario_material_metadata_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);
```

### scenario_labor_items
```sql
CREATE TABLE public.scenario_labor_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  scenario_id uuid NOT NULL,
  project_id text NOT NULL,
  trade text NOT NULL,
  item_id text NOT NULL,
  description text,
  quantity numeric,
  unit text,
  hours_expected numeric,
  hours_low numeric,
  hours_high numeric,
  cost_expected numeric,
  cost_low numeric,
  cost_high numeric,
  total_labor_hours numeric,
  crew jsonb DEFAULT '[]'::jsonb,
  blended_hourly_rate numeric,
  labor_cost numeric,
  confidence text,
  reasoning_notes text,
  site_adjustments jsonb DEFAULT '[]'::jsonb,
  economies_of_scale_applied boolean DEFAULT false,
  source_refs jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT scenario_labor_items_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_labor_items_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);
```

### scenario_labor_metadata
```sql
CREATE TABLE public.scenario_labor_metadata (
  scenario_id uuid NOT NULL,
  trade text NOT NULL,
  total_cost_expected numeric,
  total_cost_low numeric,
  total_cost_high numeric,
  total_hours_expected numeric,
  total_hours_low numeric,
  total_hours_high numeric,
  items_high_confidence integer DEFAULT 0,
  items_medium_confidence integer DEFAULT 0,
  items_low_confidence integer DEFAULT 0,
  bls_area_used text,
  bls_wage_data jsonb,
  CONSTRAINT scenario_labor_metadata_pkey PRIMARY KEY (scenario_id, trade),
  CONSTRAINT scenario_labor_metadata_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);
```

### scenario_anomaly_flags
```sql
CREATE TABLE public.scenario_anomaly_flags (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  scenario_id uuid NOT NULL,
  project_id text NOT NULL,
  trade text,
  anomaly_type text CHECK (anomaly_type = ANY (ARRAY['priced_in','noted'])),
  category text,
  description text,
  affected_items text[],
  cost_impact numeric,
  CONSTRAINT scenario_anomaly_flags_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_anomaly_flags_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);
```

### Other tables (auth, sharing, admin, etc.)

```sql
-- profiles, project_shares, project_feedback, project_logs, project_overrides,
-- project_summaries, user_settings, user_preferences, user_roles, signup_tokens,
-- subcontractors, sub_submissions, sub_submission_items, sub_comparisons,
-- sub_comparison_items, comparison_matches, comparison_change_log,
-- documents, parsed_pages, chat_messages, token_usage,
-- bid_analyses, bid_analysis_*, custom_trade_requests, trade_catalog
-- See full SQL dump for details.
```

---

## NEW TABLES (for worker architecture)

Run this SQL to create the job queue and worker tracking tables:

```sql
CREATE TABLE IF NOT EXISTS estimation_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    job_type TEXT NOT NULL DEFAULT 'estimation' CHECK (job_type IN ('estimation', 'scenario')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled')),
    priority INT NOT NULL DEFAULT 0,
    worker_id TEXT,
    zip_storage_path TEXT,
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    scenario_context TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_estimation_jobs_queue ON estimation_jobs(priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_estimation_jobs_user ON estimation_jobs(user_id, status);

CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    hostname TEXT,
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline')),
    current_job_id UUID REFERENCES estimation_jobs(id),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    jobs_completed INT DEFAULT 0,
    jobs_failed INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Note: `user_id` is UUID (references auth.users), `project_id` is TEXT (references projects), `scenario_id` is UUID (references scenarios).
