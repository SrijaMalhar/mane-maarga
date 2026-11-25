"""Mane Maarga API: the app factory. Routes live in app/api/, shared pieces in app/core/."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .api import ROUTERS
from .core.config import ALLOWED_ORIGINS, APP_ENV, VERSION
from .core.observability import security_and_request_id
from .core.security import _auth_attempts, current_user, enforce_auth_rate_limit  # noqa: F401  (re-exported for tests)


def ensure_consent_status_column(database_engine) -> None:
    """Older databases predate cases.consent_status; add it in place."""
    columns = {column["name"] for column in inspect(database_engine).get_columns("cases")}
    if "consent_status" not in columns:
        with database_engine.begin() as conn:
            conn.execute(text("ALTER TABLE cases ADD COLUMN consent_status VARCHAR(20) DEFAULT 'pending'"))


def create_app() -> FastAPI:
    docs = APP_ENV != "production"
    app = FastAPI(
        title="Mane Maarga API",
        version=VERSION,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.middleware("http")(security_and_request_id)
    for router in ROUTERS:
        app.include_router(router)
    return app


app = create_app()
