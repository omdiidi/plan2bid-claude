# Pages — `src/pages/`

## Overview

Each file in `src/pages/` corresponds to one route in `App.tsx`. All protected routes are wrapped in `<ProtectedRoute>` which checks for auth and onboarding status.

---

## Auth.tsx — `/auth`

**Purpose:** Login, signup, Google OAuth, forgot password.

**Not protected** — accessible without login. Redirects to `/` if already authenticated.

**Data flow:**
- Uses Supabase client directly for auth operations (signInWithPassword, signUp, signInWithOAuth, resetPasswordForEmail)
- Does NOT use `api.ts` — auth is purely Supabase

**Key behaviors:**
- Toggles between login/signup mode via `isLogin` state
- Google OAuth redirects to `/auth/callback`
- Forgot password sends email with redirect to `/reset-password`
- Toasts via `sonner` for success/error feedback

---

## ResetPassword.tsx — `/reset-password`

**Purpose:** Set new password after receiving reset email.

**Not protected.** Checks URL hash for `type=recovery` token. Shows "invalid link" if missing.

**Data flow:** `supabase.auth.updateUser({ password })` directly.

---

## Onboarding.tsx — `/onboarding`

**Purpose:** 3-step first-time setup wizard.

**Steps:**
1. Select default trade
2. Add material presets (name, unit price, unit)
3. Add labor presets (role, hourly rate)

**Data flow:**
- Reads/writes to `AppProvider` settings via `useApp().updateSettings()`
- On completion, calls `markOnboardingComplete()` which persists to backend
- After complete, redirects to `/`

**Key dependencies:** `TRADES`, `UNITS` from `constants.ts`

---

## Dashboard.tsx — `/`

**Purpose:** Home page with stats and recent projects.

**Data flow:**
- Reads `projects` from `useApp()` context (already fetched by AppProvider)
- Computes stats: total projects, completed estimates, total estimated value
- Shows 3 most recent projects as cards

**Navigation:** "New Estimate" button → `/select-trades`

---

## SelectTrades.tsx — `/select-trades`

**Purpose:** Trade selection grid before creating an estimate.

**Features:**
- Single trade selection (click tile → navigate to `/new-estimate?trade=X`)
- Multi-select mode (toggle, select multiple → navigate with `?trades=X,Y,Z`)
- "Run All Trades" option (sends all 14 trades)
- Save/load trade combinations (persisted via AppContext settings)

**Data flow:**
- Reads `savedCombinations` from `useApp().settings`
- Saves combinations via `updateSettings()`
- Navigates to `/new-estimate` with URL params

---

## NewEstimate.tsx — `/new-estimate`

**Purpose:** Main form for creating a new estimate. The most complex page.

**Sections:**
1. **ZIP upload** — drag-and-drop or click, max 500MB
2. **Project info** — street address, city, state, zip, facility type, project type
3. **Trade selector** — pre-filled from URL params, or manual selection
4. **Description** — textarea with voice input (microphone recording → transcription API)
5. **AI Validation** — auto-triggers when description > 50 words, asks follow-up questions
6. **Submit** — builds FormData, calls `createEstimate()`, navigates to `/progress/:jobId`

**Data flow:**
- Reads `settings.presetTrade` for default trade
- Reads URL params `?trade=X` or `?trades=X,Y,Z` from SelectTrades
- Calls `validateDescription()` for AI feedback (with retry logic)
- Calls `transcribeVoice()` for voice input
- Calls `createEstimate(formData)` on submit → navigates to Progress

**Key dependency:** `TRADES`, `FACILITY_TYPES`, `PROJECT_TYPES` from `constants.ts`

---

## Progress.tsx — `/progress/:projectId`

**Purpose:** Real-time pipeline progress tracker.

**Data flow:**
- Polls `getEstimateStatus(projectId)` every 2 seconds via `setInterval`
- Displays: current stage, progress bar, stage timeline, live log entries
- On `status === "completed"`: shows success banner, navigates to `/results/:projectId`
- On `status === "error"`: shows error banner with message

**Important:** The `projectId` in the URL is the `job_id` returned by `createEstimate`, which is also the project ID used everywhere else.

---

## Results.tsx — `/results/:projectId`

**Purpose:** Full results view. The largest and most complex page (~680 lines).

**Contains inline `FinalPricingTab` sub-component** (renders markup/overhead/contingency calculations).

**Tabs:**
1. **Materials** — `<MaterialsTable>` component
2. **Labor** — `<LaborTable>` component
3. **Final Pricing** — inline `FinalPricingTab` (markup, overhead, contingency calculations)
4. **Documents** — `<DocumentViewer>` component

**Side panels:**
- `<ProjectSummaryCard>` — AI overall summary (collapsible)
- `<TradeSummaryCard>` — AI trade summary (collapsible)
- Cost summary cards (materials, labor, total)
- Anomaly flags panel
- `<ShareButton>` → `<ShareModal>`
- `<DocumentChat>` — floating chat FAB

**Data flow on mount:**
1. `getProject(projectId)` — project metadata
2. `getEstimate(projectId)` — full estimate with line items
3. `getProjectOverrides(projectId)` — any saved price/rate overrides
4. `matchPresets(projectId, ...)` — LLM matches user presets to line items

**Preset matching flow:**
- Sends user's material/labor presets + estimate line items to backend
- Backend returns match suggestions (item_id → preset_id with confidence)
- User can review matches via `<ReviewMatchesDialog>`
- Applied matches become overrides saved via `saveProjectOverrides()`

---

## Projects.tsx — `/projects`

**Purpose:** Filterable, sortable list of all user projects.

**Data flow:**
- Reads `projects` from `useApp()` context
- Local filtering by search query (name, city, trade)
- Local sorting (newest first, oldest first, by name, by estimate)
- Delete with confirmation dialog → `deleteProject()` from context

---

## SettingsPage.tsx — `/settings`

**Purpose:** User settings management.

**Sections:**
1. Default trade selector (includes saved combinations)
2. Markup %, Overhead %, Contingency % inputs
3. Material presets CRUD (add/remove)
4. Labor presets CRUD (add/remove)

**Data flow:** All reads/writes go through `useApp().settings` and `updateSettings()`.

---

## AdminDashboard.tsx — `/admin`

**Purpose:** Admin-only dashboard showing all users and all projects.

**Guard:** Checks `useRole().isAdmin` — redirects non-admins to `/`.

**Data flow:**
- `adminGetUsers()` → user table
- `adminGetProjects()` → all projects table (across all users)
- Both fetched on mount via `useEffect`

---

## AcceptShare.tsx — `/share/:token`

**Purpose:** Accepts a project share link.

**Data flow:**
- Extracts `token` from URL params
- Calls `acceptShareLink(token)` on mount
- On success → navigates to `/results/:projectId`
- On error → shows error message with "Go to Projects" link

---

## NotFound.tsx — `*` (catch-all)

**Purpose:** Simple 404 page. Shows "Return to Home" link.

## Do NOT

- Add new pages without adding the route to `App.tsx`
- Use `location.state` for passing data between pages — use URL params or context
- Bypass `ProtectedRoute` for pages that need auth
- Import `api.ts` functions in auth pages (Auth.tsx, ResetPassword.tsx) — those use Supabase directly
