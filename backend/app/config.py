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


def validate_settings(s: _Settings) -> list[str]:
    warnings = []
    if not s.SUPABASE_URL:
        warnings.append("SUPABASE_URL is not set")
    if not s.SUPABASE_SERVICE_ROLE_KEY:
        warnings.append("SUPABASE_SERVICE_ROLE_KEY is not set")
    if not s.SUPABASE_ANON_KEY:
        warnings.append("SUPABASE_ANON_KEY is not set — auth verification will fail")
    if not s.OPENROUTER_API_KEY:
        warnings.append("OPENROUTER_API_KEY is not set — AI endpoints will fail")
    if not s.OPENAI_API_KEY:
        warnings.append("OPENAI_API_KEY is not set — transcription will fail")
    return warnings


settings = _load_settings()
