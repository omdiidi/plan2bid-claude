# Estim8r Frontend — Architecture Overview

## What This Is

Estim8r is an AI-powered construction bid estimation tool. Users upload blueprint ZIPs, fill in project details (trade, facility type, address, description), and the system produces detailed material + labor cost estimates with confidence levels, anomaly flags, and source references.

This is the **React frontend**. The backend is a separate **Python FastAPI** server at `localhost:8000`. The frontend proxies all `/api/*` requests to it via Vite dev server.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 (SWC plugin) |
| Styling | Tailwind CSS 3.4 + tailwindcss-animate |
| UI Components | shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Auth | Supabase Auth (email/password + Google OAuth) |
| State | React Context (AppProvider) |
| Routing | react-router-dom v6 |
| Toasts | Sonner |
| API | Fetch-based client in `src/lib/api.ts` |

## Folder Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Provider tree + routing
├── index.css                   # Global styles, CSS variables, animations
├── vite-env.d.ts               # Vite type declarations
├── types/index.ts              # All TypeScript interfaces (backend API shapes)
├── lib/
│   ├── api.ts                  # HTTP client — ALL backend communication
│   ├── app-context.tsx         # Global state: projects, settings, onboarding
│   ├── constants.ts            # Enum arrays (TRADES, FACILITY_TYPES, etc.) + UI types
│   └── utils.ts                # Formatting helpers (currency, date, cn())
├── hooks/
│   ├── useAuth.tsx             # Supabase auth context + session management
│   ├── useRole.tsx             # Admin role check (queries user_roles table)
│   └── useMobile.tsx           # Viewport breakpoint hook
├── integrations/supabase/
│   ├── client.ts               # Supabase client instance (env vars)
│   └── types.ts                # Auto-generated DB types
├── pages/                      # Route-level components (1 per route)
│   ├── Auth.tsx                # Login / signup / forgot password
│   ├── ResetPassword.tsx       # Password reset form
│   ├── Onboarding.tsx          # 3-step setup wizard
│   ├── Dashboard.tsx           # Home: stats, recent projects
│   ├── SelectTrades.tsx        # Trade picker grid
│   ├── NewEstimate.tsx         # Upload + project form + submit
│   ├── Progress.tsx            # Polling pipeline tracker
│   ├── Results.tsx             # Full results view (tabs, summaries, chat)
│   ├── Projects.tsx            # Project list with search/sort
│   ├── SettingsPage.tsx        # User settings (presets, markups)
│   ├── AdminDashboard.tsx      # Admin: all users + projects
│   ├── AcceptShare.tsx         # Share link acceptance
│   └── NotFound.tsx            # 404 page
├── components/
│   ├── AppLayout.tsx           # Nav bar + main content wrapper
│   ├── ComboTooltip.tsx        # Trade combination tooltip
│   ├── results/                # Results page sub-components
│   │   ├── MaterialsTable.tsx
│   │   ├── LaborTable.tsx
│   │   ├── ProjectSummaryCard.tsx
│   │   ├── TradeSummaryCard.tsx
│   │   ├── DocumentChat.tsx
│   │   ├── DocumentViewer.tsx
│   │   ├── PageViewerLightbox.tsx
│   │   └── ReviewMatchesDialog.tsx
│   ├── sharing/
│   │   ├── ShareButton.tsx
│   │   └── ShareModal.tsx
│   └── ui/                     # 21 shadcn/ui primitives
└── test/
    ├── setup.ts
    └── example.test.ts
```

## Provider Hierarchy

```
<TooltipProvider>
  <Sonner />                     ← Toast notifications
  <BrowserRouter>
    <AuthProvider>               ← Supabase session/user
      <RoleProvider>             ← Admin role check
        <AppProvider>            ← Projects, settings, onboarding state
          <AppRoutes />          ← ProtectedRoute + routing
        </AppProvider>
      </RoleProvider>
    </AuthProvider>
  </BrowserRouter>
</TooltipProvider>
```

## Data Flow

```
User Action → Page Component → api.ts function → fetch(/api/...) → Vite proxy → FastAPI backend
                                     ↑
                          Supabase auth token injected automatically
```

- **ALL backend communication** goes through `src/lib/api.ts` (except chat persistence — see supabase.md)
- Auth tokens are extracted from the Supabase session and sent as `Authorization: Bearer <token>`
- On 401/403, a custom event `estim8r:auth-expired` fires, which `useAuth` catches to force sign-out

## Routing

| Path | Page | Protected | Description |
|------|------|-----------|-------------|
| `/auth` | Auth | No | Login / signup |
| `/reset-password` | ResetPassword | No | Password reset |
| `/onboarding` | Onboarding | Yes | First-time setup |
| `/` | Dashboard | Yes | Home dashboard |
| `/select-trades` | SelectTrades | Yes | Trade picker |
| `/new-estimate` | NewEstimate | Yes | Create estimate |
| `/progress/:projectId` | Progress | Yes | Pipeline tracker |
| `/results/:projectId` | Results | Yes | View results |
| `/projects` | Projects | Yes | All projects |
| `/settings` | SettingsPage | Yes | User settings |
| `/admin` | AdminDashboard | Yes | Admin panel |
| `/share/:token` | AcceptShare | Yes | Accept shared project |

## Context Files Index

Each doc below provides deep context for a specific section of the codebase:

| File | Section | What It Covers |
|------|---------|----------------|
| [api-client.md](./api-client.md) | `src/lib/api.ts` | Every API endpoint, auth flow, error handling, request patterns |
| [auth-and-state.md](./auth-and-state.md) | `src/hooks/`, `src/lib/app-context.tsx` | Auth system, AppContext, settings persistence, project data mapping |
| [pages.md](./pages.md) | `src/pages/` | Each page's purpose, data dependencies, navigation, key behaviors |
| [results-section.md](./results-section.md) | `src/components/results/` | All results sub-components, preset matching, overrides, document chat |
| [supabase.md](./supabase.md) | `src/integrations/supabase/` | Client setup, direct DB usage, tables, auth vs API data paths |
| [types-and-constants.md](./types-and-constants.md) | `src/types/`, `src/lib/constants.ts` | Type architecture, where types live, enum constants, mapping rules |

## Critical Rules

1. **NEVER modify the Supabase database schema** from the frontend. The backend owns all data.
2. **ALL backend calls go through `api.ts`** — never use raw `fetch("/api/...")` in components.
3. **Auth tokens are handled automatically** by `getAuthHeaders()` in api.ts. Never manually manage tokens.
4. **Settings persist to the backend** via `saveUserSettings()`. They also live in AppContext state in memory.
5. **The `BackendProject` → `Project` mapping** in `app-context.tsx` is critical. The backend sends `project_address` (combined), the frontend parses it into `city`/`state`/`zip`.
6. **Toast notifications use Sonner** exclusively: `import { toast } from "sonner"`. No other toast system.
7. **Animations are CSS-only** — custom keyframes in `index.css`, utility classes like `animate-fade-in`, `animate-slide-up`. No framer-motion.
