"""Tool endpoints for machine callers. /api/tools/* needs the X-Service-Token header; every call is audited."""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..agents.tools import REGISTRY, ToolContext, ToolError, call_tool, tool_specs
from ..core import config
from ..database import get_db

router = APIRouter(tags=["tools"])


def service_caller(x_service_token: str = Header(default="")) -> str:
    if not config.SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Tool endpoints are disabled: no service token configured")
    if not hmac.compare_digest(x_service_token.encode(), config.SERVICE_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Invalid service token")
    return "service"


@router.get("/api/tools/openapi.json")
def tools_spec(caller: str = Depends(service_caller)):
    return {"openapi": "3.1.0", "info": {"title": "Mane Maarga tools", "version": "1"}, "tools": tool_specs()}


@router.post("/api/tools/{name}")
def run_tool(name: str, args: dict, caller: str = Depends(service_caller), db: Session = Depends(get_db)):
    if name not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"No tool named '{name}'")
    try:
        return {"tool": name, "result": call_tool(ToolContext(db=db, actor=caller), name, args)}
    except ToolError as exc:
        status = 404 if exc.code.endswith("not_found") else 422
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc
