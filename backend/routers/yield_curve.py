"""
Yield Curve Router

GET    /api/yield-curve            → active curve + freshness metadata
POST   /api/yield-curve/refresh    → force a live pull from FRED
POST   /api/yield-curve/override   → set a manual override
DELETE /api/yield-curve/override   → clear override, revert to FRED/embedded

All state lives in services.fred, which is also what the calculation engine
reads from — so what you see here is what the math actually uses.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional, List

from services import fred

router = APIRouter(tags=["Yield Curve"])

# Re-exported for backwards compatibility with older imports
EMBEDDED_REAL_YIELDS = fred.EMBEDDED_REAL_YIELDS
TERM_LABELS = fred.TERM_LABELS


class YieldCurveOverride(BaseModel):
    yields: Dict[int, float]          # {term_years: decimal_rate} e.g. {10: 0.022}
    note: Optional[str] = None


class YieldCurveResponse(BaseModel):
    source: str                       # "fred_live" | "override" | "embedded"
    as_of: Optional[str] = None
    note: Optional[str] = None
    yields: Dict[int, float]
    terms: List[dict]
    fred_available: bool = False
    fred_fetched_at: Optional[str] = None
    fred_observation_date: Optional[str] = None
    fred_error: Optional[str] = None
    is_stale: bool = False
    refresh_hours: int = 12


def get_active_yield_curve() -> Dict[int, float]:
    """Kept for backwards compatibility — delegates to the FRED service."""
    return fred.get_active_curve()


def _response() -> YieldCurveResponse:
    curve = fred.get_active_curve()
    status = fred.get_status()
    return YieldCurveResponse(
        yields=curve,
        terms=[
            {
                "term": t,
                "label": fred.TERM_LABELS.get(t, f"{t}-Year"),
                "yield": curve[t],
                "yield_pct": round(curve[t] * 100, 3),
            }
            for t in sorted(curve.keys())
        ],
        **status,
    )


@router.get("/yield-curve", response_model=YieldCurveResponse)
async def get_yield_curve():
    """
    Returns the real TIPS yield curve currently used in all calculations.
    Triggers a lazy re-fetch if the cached data has aged past its TTL.
    """
    if fred.has_api_key() and fred.is_stale():
        await fred.refresh(force=True)
    return _response()


@router.post("/yield-curve/refresh", response_model=YieldCurveResponse)
async def refresh_from_fred():
    """Force an immediate pull of the latest TIPS yields from FRED."""
    if not fred.has_api_key():
        raise HTTPException(
            status_code=400,
            detail=(
                "FRED_API_KEY is not set. Add it in your host's environment "
                "settings, then redeploy. Free key: "
                "https://fred.stlouisfed.org/docs/api/api_key.html"
            ),
        )
    ok = await fred.refresh(force=True)
    if not ok:
        raise HTTPException(
            status_code=502,
            detail=f"FRED fetch failed: {fred.get_status()['fred_error']}",
        )
    return _response()


@router.post("/yield-curve/override", response_model=YieldCurveResponse)
def set_yield_curve_override(body: YieldCurveOverride):
    """
    Set a manual yield curve override. Values as decimals (0.022 = 2.2%).
    Takes precedence over live FRED data until cleared.
    """
    if not (5 in body.yields or 10 in body.yields):
        raise HTTPException(
            status_code=422,
            detail="Override must include at least the 5-year or 10-year term.",
        )
    fred.set_override(body.yields, body.note)
    return _response()


@router.delete("/yield-curve/override", response_model=YieldCurveResponse)
def clear_yield_curve_override():
    """Clears any manual override, reverting to live FRED data."""
    fred.clear_override()
    return _response()
