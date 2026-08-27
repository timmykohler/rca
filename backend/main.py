from contextlib import asynccontextmanager
import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routers import calculate, xml_import, report, yield_curve
from services import fred

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pull live TIPS yields on boot, then keep them fresh in the background.

    This matters on hosts that spin down (Render free tier, Railway): every
    cold start rebuilds the curve, so the app never silently serves the
    stale embedded fallback. The startup fetch runs as a background task so
    it can't delay the health check.
    """
    task = asyncio.create_task(fred.startup_refresh())
    loop_task = asyncio.create_task(fred.refresh_loop())
    yield
    for t in (task, loop_task):
        t.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="Resources & Claims Analysis Tool",
    version="2.1.0",
    description=(
        "Funded ratio analysis for retirement planning. "
        "Based on Pittman, S. (2015), The Journal of Retirement."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calculate.router, prefix="/api")
app.include_router(xml_import.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(yield_curve.router, prefix="/api")


@app.get("/api/health")
def health():
    """Health check — also reports yield curve freshness for monitoring."""
    status = fred.get_status()
    return {
        "status": "ok",
        "version": app.version,
        "yield_source": status["source"],
        "yield_as_of": status["as_of"],
        "yield_stale": status["is_stale"],
    }


# Serve React frontend in production
_here = os.path.dirname(__file__)
frontend_dist = os.path.join(_here, "..", "frontend", "dist")

# Serve sample plans JSON files
# Sample plans — try multiple possible paths (works both locally and in Docker)
for _sp_candidate in [
    os.path.join(_here, "..", "sample_plans"),       # local: backend/../sample_plans
    os.path.join(_here, "..", "..", "sample_plans"),  # docker: /app/backend/../../sample_plans
    "/app/sample_plans",                              # docker explicit
]:
    _sp_candidate = os.path.normpath(_sp_candidate)
    if os.path.exists(_sp_candidate) and os.path.isdir(_sp_candidate):
        app.mount("/sample_plans", StaticFiles(directory=_sp_candidate), name="sample_plans")
        break

if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_file = os.path.join(frontend_dist, "index.html")
        return FileResponse(index_file)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
