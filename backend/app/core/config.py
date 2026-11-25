"""Settings read from the environment. Production refuses unsafe defaults."""

import os
from pathlib import Path


def env(name: str, default: str | None = None) -> str | None:
    """Read MANE_MAARGA_<name>, falling back to the project's earlier SOORU_<name> variables."""
    return os.getenv(f"MANE_MAARGA_{name}", os.getenv(f"SOORU_{name}", default))


APP_ENV = os.getenv("APP_ENV", "development").lower()
VERSION = "1.0.0"
SERVICE = "mane-maarga-api"

_production_secret = (env("JWT_SECRET", "") or "").strip()
if APP_ENV == "production" and (
    len(_production_secret) < 32
    or _production_secret.lower().startswith(("replace", "change", "example", "your-secret"))
):
    raise RuntimeError(
        "Production requires a randomly generated MANE_MAARGA_JWT_SECRET (at least 32 characters; placeholders are rejected)."
    )

JWT_SECRET = (env("JWT_SECRET") or "dev-only-change-this-secret-before-deployment").encode()
JWT_TTL_MINUTES = int(env("JWT_TTL_MINUTES", "60") or "60")

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
if APP_ENV == "production" and "*" in ALLOWED_ORIGINS:
    raise RuntimeError("Wildcard CORS origins are not allowed in production.")

LOG_LEVEL = (env("LOG_LEVEL", "INFO") or "INFO").upper()

# Mutable on purpose: tests point uploads at a temporary folder.
UPLOAD_DIR = Path(env("UPLOAD_DIR", "uploads/cases") or "uploads/cases").resolve()
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

BOOTSTRAP_ENABLED = (env("BOOTSTRAP_ENABLED") or ("true" if APP_ENV != "production" else "false")).lower() in {
    "1",
    "true",
    "yes",
}
