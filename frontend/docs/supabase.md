# Supabase Integration — `src/integrations/supabase/`

## Overview

Supabase is used for **authentication only** in most of the app. The Python FastAPI backend owns all project/estimate data. However, there are two places where the frontend talks to Supabase directly for data.

## Client Setup — `src/integrations/supabase/client.ts`

Creates the Supabase client using two env vars:

```
VITE_SUPABASE_URL          → Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY → Supabase anon/publishable key
```

These must be set in `.env` (or `.env.local`). The app throws on startup if they're missing.

**Client config:**
- `auth.storage = localStorage` — session persisted in browser
- `auth.persistSession = true`
- `auth.autoRefreshToken = true`

**Import pattern:**
```ts
import { supabase } from "@/integrations/supabase/client";
```

## Who Uses Supabase Directly

| File | What It Does | Table/Feature |
|------|-------------|---------------|
| `useAuth.tsx` | Session management, sign in/out, auth state listener | `auth.*` |
| `useRole.tsx` | Admin role check | `user_roles` (SELECT) |
| `Auth.tsx` | Login, signup, Google OAuth, password reset email | `auth.*` |
| `ResetPassword.tsx` | Update password | `auth.updateUser()` |
| `DocumentChat.tsx` | Read/write chat messages | `chat_messages` (SELECT, INSERT) |
| `api.ts` | Extract JWT from session for API auth headers | `auth.getSession()` |

## Database Tables (from auto-generated types)

**File:** `src/integrations/supabase/types.ts`

| Table | Used By Frontend | Purpose |
|-------|-----------------|---------|
| `profiles` | Not directly | User profiles (may be used by backend) |
| `projects` | Not directly | Projects table (frontend uses backend API instead) |
| `user_roles` | `useRole.tsx` | Admin role assignments |
| `user_preferences` | Not directly | User preferences (frontend uses backend API) |
| `chat_messages` | `DocumentChat.tsx` | Chat message persistence |

### chat_messages Schema

```ts
{
  id: string;           // UUID, auto-generated
  project_id: string;   // References project
  user_id: string;      // References auth.users
  role: string;         // "user" or "assistant"
  content: string;      // Message text
  metadata: Json;       // references, tier_used, model_used, etc.
  created_at: string;   // Timestamp
}
```

### user_roles Schema

```ts
{
  id: number;           // Auto-increment
  user_id: string;      // References auth.users
  role: string;         // "admin" or other roles
  created_at: string;   // Timestamp
}
```

## Auth Token Flow

```
Supabase session (in localStorage)
  → supabase.auth.getSession()
  → session.access_token (JWT)
  → Sent as Authorization: Bearer <token> to FastAPI backend
  → Backend validates JWT against same Supabase project
```

The backend trusts Supabase JWTs. The frontend never handles raw tokens — `api.ts/getAuthHeaders()` extracts them automatically.

## Two Data Paths (Important)

The app has two separate data paths:

### Path 1: Backend API (primary — used by everything)
```
Frontend → api.ts → fetch(/api/...) → Vite proxy → FastAPI backend → Postgres/storage
```

### Path 2: Direct Supabase (exceptions only)
```
Frontend → supabase client → Supabase Postgres (via PostgREST)
```

**Path 2 is only used for:**
- Auth operations (login, signup, session management)
- Admin role check (`user_roles` table)
- Chat message persistence (`chat_messages` table)

## Migrations

Located in `supabase/migrations/`. These are for Supabase's migration system, not the backend's.

| Migration | Creates |
|-----------|---------|
| `20260302...profiles.sql` | `profiles` table + trigger |
| `20260302...user_roles.sql` | `user_roles` table |
| `20260302...projects.sql` | `projects` table |
| `20260303...project_type.sql` | Adds `project_type` column to `projects` |
| `20260303...user_preferences.sql` | `user_preferences` table |

**Note:** There is NO migration for `chat_messages`. The table must exist in the Supabase project but was likely created outside the migration system.

## Do NOT

- Add new direct Supabase queries for data that the backend already serves
- Modify migration files after they've been applied
- Change the Supabase client config without understanding session persistence implications
- Remove `autoRefreshToken: true` — this keeps long sessions alive
- Use `supabase.from("projects")` — projects are served by the FastAPI backend, not directly from Supabase
- Assume the `projects` table schema matches `BackendProject` — they differ significantly (see types-and-constants.md)
