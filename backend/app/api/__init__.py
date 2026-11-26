"""HTTP routers, one module per area of the product."""

from . import (
    agent,
    approvals,
    audit,
    auth,
    cases,
    construction,
    documents,
    engine,
    finance,
    intelligence,
    speech,
    system,
    tools,
)

ROUTERS = [
    system.router,
    auth.router,
    cases.router,
    documents.router,
    finance.router,
    construction.router,
    intelligence.router,
    audit.router,
    engine.router,
    tools.router,
    approvals.router,
    agent.router,
    speech.router,
]
