"""HTTP routers, one module per area of the product."""

from . import audit, auth, cases, construction, documents, engine, finance, intelligence, system, tools

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
]
