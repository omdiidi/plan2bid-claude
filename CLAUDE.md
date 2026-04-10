# Plan2Bid Claude — Construction Estimation Backend

## Architecture

This is a Python/FastAPI backend that uses the Claude Agent SDK to power construction estimation. The frontend is a React SPA in `frontend/`.

### Key Components

- **Backend** (`backend/app/`): FastAPI server with ~62 API endpoints
  - `pipeline/`: Agent SDK integration — orchestrator, queue, schemas, db_writer
  - `routes/`: HTTP endpoint handlers split by domain
  - `db/`: Supabase PostgREST client and query functions
  - `services/`: Anthropic API client (summaries, presets), OpenAI Whisper
- **Prompts** (`backend/prompts/`): System prompts adapted from Plan2Bid CLI commands
- **Frontend** (`frontend/`): React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Database**: Supabase PostgreSQL (34 tables, schema in `DATABASE_SCHEMA_REFERENCE.md`)

### Estimation Pipeline

```
POST /api/estimate → ZIP extraction → Agent SDK query() → structured output → DB write → completed
```

The Agent SDK runs the estimation using the system prompt from `prompts/estimation_system.md`. The agent reads construction documents, extracts line items, researches material pricing via web search, and estimates labor costs. Output is constrained by a Pydantic JSON Schema.

### GC Mode (Multi-Trade)

When multiple trades are selected, the agent spawns sub-agents per trade via the `Agent` tool.

### Database

Uses existing Supabase project. Backend uses service role key (bypasses RLS). Frontend uses anon key + user JWT.

Tables NOT populated by this backend (deferred):
- `parsed_pages` — was Reducto output, agent reads PDFs directly
- `token_usage` — removed
- `chat_messages` — document chat removed (rebuild later with Google embeddings)
- `documents` — deferred until subcontractor document serving is wired up

### Running Locally

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Fill in your keys
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

See `backend/.env.example` for all required variables.
