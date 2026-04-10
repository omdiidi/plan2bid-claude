# Auth & State Management

## Overview

The app uses three React Context providers stacked in order: `AuthProvider` → `RoleProvider` → `AppProvider`. Each depends on the one above it.

## Auth System — `src/hooks/useAuth.tsx`

### How It Works

1. On mount, calls `supabase.auth.getSession()` to check for existing session
2. Subscribes to `supabase.auth.onAuthStateChange()` for real-time updates (login, logout, token refresh)
3. Exposes `{ session, user, loading, signOut }` via context

### Auth Expiry Bridge

The API client (`api.ts`) and auth hook are connected via a custom DOM event:

```
api.ts: 401/403 → dispatches "estim8r:auth-expired" event
useAuth.tsx: listens for event → calls supabase.auth.signOut()
App.tsx: ProtectedRoute sees user=null → redirects to /auth
```

This ensures that if the backend rejects a token (expired, revoked), the user is cleanly logged out without coupling `api.ts` to the auth context.

### Provides

```ts
interface AuthContextType {
  session: Session | null;    // Full Supabase session (has access_token)
  user: User | null;          // Supabase user object (has id, email, metadata)
  loading: boolean;           // True until initial session check completes
  signOut: () => Promise<void>;
}
```

### Used By

- `AppProvider` — gates project/settings fetch on `user` being present
- `AppLayout.tsx` — shows user info, sign-out button
- `ProtectedRoute` — redirects to `/auth` when `user` is null
- `DocumentChat.tsx` — uses `user.id` for chat message attribution

## Role System — `src/hooks/useRole.tsx`

### How It Works

Queries the Supabase `user_roles` table directly:
```sql
SELECT role FROM user_roles WHERE user_id = :userId AND role = 'admin'
```

Returns `isAdmin: boolean` and `loading: boolean`.

### Used By

- `AppLayout.tsx` — conditionally shows Admin nav link
- `AdminDashboard.tsx` — guards access (redirects non-admins)

### Important

This is the ONLY place that queries `user_roles` directly via Supabase client. The backend has its own role checking for API-level authorization.

## App Context — `src/lib/app-context.tsx`

### What It Manages

| State | Type | Source | Persistence |
|-------|------|--------|-------------|
| `projects` | `Project[]` | `GET /api/projects` | Backend (re-fetched on mount) |
| `loading` | `boolean` | Internal | — |
| `settings` | `Settings` | `GET /api/settings` | Backend via `PUT /api/settings` |
| `settingsLoading` | `boolean` | Internal | — |
| `onboardingComplete` | `boolean` | `GET /api/settings` | Backend |

### Settings Shape

```ts
interface Settings {
  presetTrade: string;              // Default trade for new estimates
  materialPresets: MaterialPreset[]; // User's saved material price presets
  laborPresets: LaborPreset[];       // User's saved labor rate presets
  enableValidation: boolean;         // AI description validation (no UI toggle)
  markupPercent: number;             // Default: 10
  overheadPercent: number;           // Default: 5
  contingencyPercent: number;        // Default: 5
  savedCombinations: TradeCombination[]; // Saved multi-trade combos
}
```

### Settings Persistence Flow

```
User changes setting in UI
  → component calls updateSettings({ markupPercent: 15 })
  → AppProvider merges into state immediately (optimistic)
  → AppProvider calls saveUserSettings({ settings: mergedSettings })
  → PUT /api/settings sends full settings blob to backend
```

Settings are stored as a JSON blob on the backend. The frontend always sends the complete `Settings` object, not partial updates.

### BackendProject → Project Mapping

The backend returns `BackendProject` (snake_case, combined `project_address`). The frontend needs `Project` (camelCase, parsed address fields). The `backendProjectToProject()` function handles this:

```
BackendProject.project_address = "123 Main St, Springfield IL 62701"
  → Project.name = "123 Main St"
  → Project.city = "Springfield"
  → Project.state = "IL"
  → Project.zip = "62701"

BackendProject.total_documents → Project.documentCount
BackendProject.total_pages → Project.pageCount
BackendProject.project_description → Project.description
```

**Regex used:** `/^(.+?)\s+(\w{2})\s*(\d{5})?$/` on the city/state/zip portion after splitting on comma.

### Exported Types

These types are defined in `app-context.tsx` and imported by other components:

- `Project` — UI-friendly project shape
- `Settings` — Full settings object
- `MaterialPreset` — `{ id, name, unitPrice, unit }`
- `LaborPreset` — `{ id, role, hourlyRate }`

### Actions

| Action | What It Does |
|--------|-------------|
| `deleteProject(id)` | Calls API, optimistically removes from state |
| `updateSettings(partial)` | Merges into state, persists to backend |
| `refreshProjects()` | Re-fetches all projects from backend |
| `markOnboardingComplete()` | Sets flag, persists to backend |

## useMobile Hook — `src/hooks/useMobile.tsx`

Simple viewport hook: returns `true` when window width < 768px. Uses `window.matchMedia`. Only used by `DocumentViewer.tsx` to switch between Dialog (desktop) and Drawer (mobile) layouts.

## Do NOT

- Add a fourth context provider without understanding the dependency chain
- Move auth token handling out of `api.ts` — the pattern is intentional
- Change the `backendProjectToProject` mapping without verifying backend response shape
- Use `useAuth` outside of components wrapped by `AuthProvider`
- Query Supabase tables directly in new features — use `api.ts` instead (exception: `useRole` for admin check, `DocumentChat` for chat history)
