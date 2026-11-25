"""Health, readiness, version and Prometheus metrics."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.config import APP_ENV
from ..core.observability import request_metrics
from ..database import get_db

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "mane-maarga-api", "version": "1.0.0"}


@router.get("/api/system/version")
def system_version():
    return {
        "service": "mane-maarga-api",
        "version": "1.0.0",
        "environment": APP_ENV,
        "docs_enabled": APP_ENV != "production",
    }


@router.get("/metrics", response_class=PlainTextResponse)
def metrics():
    lines = [
        "# HELP mane_maarga_http_requests_total Total API requests by method, path, and status.",
        "# TYPE mane_maarga_http_requests_total counter",
    ]
    for (method, path, status), count in sorted(request_metrics.items()):
        safe_path = path.replace("\\", "").replace('"', "")
        lines.append(
            f'mane_maarga_http_requests_total{{method="{method}",path="{safe_path}",status="{status}"}} {count}'
        )
    return "\n".join(lines) + "\n"


@router.get("/ready")
def readiness(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected", "service": "mane-maarga-api"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database is not ready")
