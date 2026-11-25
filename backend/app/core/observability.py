"""Request IDs, security headers, structured logs and request counters."""

import json
import logging
import re
import secrets
import time
from collections import defaultdict

from fastapi import Request

from .config import LOG_LEVEL

logging.basicConfig(level=LOG_LEVEL, format="%(message)s")
logger = logging.getLogger("mane_maarga.api")
request_metrics: defaultdict[tuple[str, str, str], int] = defaultdict(int)

DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}


async def security_and_request_id(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID", "")
    request_id = incoming if re.fullmatch(r"[A-Za-z0-9._-]{1,80}", incoming) else secrets.token_hex(12)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        request_metrics[(request.method, request.url.path, "500")] += 1
        logger.exception(
            json.dumps(
                {"event": "request_error", "request_id": request_id, "method": request.method, "path": request.url.path}
            )
        )
        raise
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path not in DOC_PATHS:
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    if request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-cache")
    route = getattr(request.scope.get("route"), "path", request.url.path)
    request_metrics[(request.method, route, str(response.status_code))] += 1
    logger.info(
        json.dumps(
            {
                "event": "request",
                "request_id": request_id,
                "method": request.method,
                "path": route,
                "status": response.status_code,
                "duration_ms": elapsed_ms,
            }
        )
    )
    return response
