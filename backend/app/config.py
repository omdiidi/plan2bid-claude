import os
from dataclasses import dataclass, field


@dataclass
class _Settings:
    OPENROUTER_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    PORT: int = 8000


def _load_settings() -> _Settings:
    return _Settings(
        OPENROUTER_API_KEY=os.environ.get("OPENROUTER_API_KEY", ""),
        OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY", ""),
        SUPABASE_URL=os.environ.get("SUPABASE_URL", ""),
        SUPABASE_ANON_KEY=os.environ.get("SUPABASE_ANON_KEY", ""),
        SUPABASE_SERVICE_ROLE_KEY=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        SUPABASE_JWT_SECRET=os.environ.get("SUPABASE_JWT_SECRET", ""),
        ALLOWED_ORIGINS=os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"),
        PORT=int(os.environ.get("PORT", "8000")),
    )


settings = _load_settings()
