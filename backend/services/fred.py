"""
FRED Live Yield Service
=======================

Single source of truth for the real (TIPS) yield curve used in all calculations.

Priority order:
    1. Manual override   (set via POST /api/yield-curve/override)
    2. Live FRED data    (fetched at startup + on a background schedule)
    3. Embedded fallback (hardcoded, only used if FRED is unreachable)

Designed for ephemeral hosts (Render / Railway / Fly): state is rebuilt on every
cold start by fetching FRED during app startup, so the curve is never silently
stale after a spin-down.

Environment variables:
    FRED_API_KEY        required for live data. Free: https://fred.stlouisfed.org/docs/api/api_key.html
    FRED_REFRESH_HOURS  how often the background loop re-fetches (default 12)
    FRED_CACHE_PATH     where to persist the last good curve (default /tmp/rca_yield_cache.json)
    FRED_TIMEOUT        per-request timeout in seconds (default 10)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

log = logging.getLogger("rca.fred")

# ── FRED series IDs for real TIPS constant-maturity yields ────────────────────
# https://fred.stlouisfed.org/categories/82
FRED_SERIES: Dict[int, str] = {
    5:  "DFII5",
    7:  "DFII7",
    10: "DFII10",
    20: "DFII20",
    30: "DFII30",
}

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# ── Embedded fallback ─────────────────────────────────────────────────────────
# Only used when FRED has never succeeded. Keep roughly current so a failed
# fetch degrades gracefully rather than throwing the math off a cliff.
EMBEDDED_REAL_YIELDS: Dict[int, float] = {
    1:  0.019,
    2:  0.020,
    3:  0.020,
    5:  0.021,
    7:  0.022,
    10: 0.022,
    15: 0.022,
    20: 0.023,
    25: 0.023,
    30: 0.023,
}
EMBEDDED_AS_OF = "2025-01"

TERM_LABELS = {
    1: "1-Year", 2: "2-Year", 3: "3-Year", 5: "5-Year", 7: "7-Year",
    10: "10-Year", 15: "15-Year", 20: "20-Year", 25: "25-Year", 30: "30-Year",
}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


REFRESH_HOURS = _env_int("FRED_REFRESH_HOURS", 12)
FRED_TIMEOUT = _env_int("FRED_TIMEOUT", 10)
CACHE_PATH = os.environ.get("FRED_CACHE_PATH", "/tmp/rca_yield_cache.json")


# ── Module state ──────────────────────────────────────────────────────────────
class _State:
    curve: Optional[Dict[int, float]] = None      # last good FRED curve
    fetched_at: Optional[str] = None              # ISO8601 UTC
    observation_date: Optional[str] = None        # FRED's own date for the data
    error: Optional[str] = None                   # last failure message
    override: Optional[Dict[int, float]] = None
    override_set_at: Optional[str] = None
    override_note: Optional[str] = None


_state = _State()
_lock = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def has_api_key() -> bool:
    return bool(os.environ.get("FRED_API_KEY", "").strip())


# ── Curve construction ────────────────────────────────────────────────────────
def _build_full_curve(fetched: Dict[int, float]) -> Dict[int, float]:
    """
    FRED only publishes 5/7/10/20/30-year TIPS constant maturities, and any
    individual series can come back empty. Rebuild the full 1-30yr curve by
    interpolating between whatever anchors we actually got, so a missing
    series never leaves a non-monotonic kink in the curve.
    """
    anchors = sorted(fetched.items())
    if not anchors:
        return dict(EMBEDDED_REAL_YIELDS)

    def at(term: int) -> float:
        # Flat extrapolation beyond the ends, linear interpolation between
        if term <= anchors[0][0]:
            lo_t, lo_v = anchors[0]
            if term == lo_t:
                return lo_v
            # Short end: TIPS curves slope up at the front. Apply a modest
            # downward spread rather than extrapolating a steep line.
            spread = {3: -0.005, 2: -0.008, 1: -0.013}.get(term, 0.0)
            return max(-0.02, lo_v + spread)
        if term >= anchors[-1][0]:
            return anchors[-1][1]
        for (t0, v0), (t1, v1) in zip(anchors, anchors[1:]):
            if t0 <= term <= t1:
                if t1 == t0:
                    return v0
                w = (term - t0) / (t1 - t0)
                return v0 + w * (v1 - v0)
        return anchors[-1][1]

    curve = {t: round(at(t), 5) for t in EMBEDDED_REAL_YIELDS}
    curve.update({t: round(v, 5) for t, v in fetched.items()})
    return dict(sorted(curve.items()))


async def _fetch_series(client, term: int, series_id: str, api_key: str):
    """Fetch the most recent non-missing observation for one FRED series."""
    # 30-day window gives plenty of padding around holidays and long weekends.
    start = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
        "sort_order": "desc",
        "limit": "30",
    }
    try:
        resp = await client.get(FRED_BASE, params=params)
        resp.raise_for_status()
        for obs in resp.json().get("observations", []):
            val = obs.get("value", ".")
            if val not in (".", "", None):
                # FRED publishes these as percent (e.g. 2.21 → 0.0221)
                return term, float(val) / 100.0, obs.get("date"), None
        return term, None, None, f"{series_id}: no valid observation in window"
    except Exception as e:  # noqa: BLE001 - surfaced to the UI, not swallowed
        return term, None, None, f"{series_id}: {type(e).__name__}: {e}"


async def fetch_fred_curve() -> Dict:
    """
    Pull all TIPS series from FRED concurrently.
    Raises RuntimeError if too few series come back to trust the result.
    """
    api_key = os.environ.get("FRED_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "FRED_API_KEY is not set. Add it as an environment variable. "
            "Free key: https://fred.stlouisfed.org/docs/api/api_key.html"
        )

    import httpx  # imported lazily so the app boots even if httpx is missing

    async with httpx.AsyncClient(timeout=FRED_TIMEOUT) as client:
        results = await asyncio.gather(*[
            _fetch_series(client, term, sid, api_key)
            for term, sid in FRED_SERIES.items()
        ])

    fetched: Dict[int, float] = {}
    dates, errors = [], []
    for term, val, obs_date, err in results:
        if val is not None:
            fetched[term] = val
            if obs_date:
                dates.append(obs_date)
        if err:
            errors.append(err)

    if len(fetched) < 3:
        raise RuntimeError(
            f"FRED returned only {len(fetched)}/{len(FRED_SERIES)} series. "
            + ("; ".join(errors) if errors else "")
        )

    return {
        "curve": _build_full_curve(fetched),
        "observation_date": max(dates) if dates else None,
        "partial": errors or None,
    }


# ── Cache persistence ─────────────────────────────────────────────────────────
def _save_cache() -> None:
    if not _state.curve:
        return
    try:
        with open(CACHE_PATH, "w") as f:
            json.dump({
                "curve": {str(k): v for k, v in _state.curve.items()},
                "fetched_at": _state.fetched_at,
                "observation_date": _state.observation_date,
            }, f)
    except Exception as e:  # noqa: BLE001
        log.warning("Could not write yield cache to %s: %s", CACHE_PATH, e)


def _load_cache() -> bool:
    """Load a previously cached curve if it is still within TTL. Returns success."""
    try:
        with open(CACHE_PATH) as f:
            data = json.load(f)
        fetched_at = data.get("fetched_at")
        if not fetched_at:
            return False
        age = datetime.now(timezone.utc) - datetime.strptime(
            fetched_at, "%Y-%m-%d %H:%M UTC"
        ).replace(tzinfo=timezone.utc)
        if age > timedelta(hours=REFRESH_HOURS):
            return False
        _state.curve = {int(k): float(v) for k, v in data["curve"].items()}
        _state.fetched_at = fetched_at
        _state.observation_date = data.get("observation_date")
        log.info("Loaded cached yield curve from %s", CACHE_PATH)
        return True
    except FileNotFoundError:
        return False
    except Exception as e:  # noqa: BLE001
        log.warning("Could not read yield cache: %s", e)
        return False


# ── Refresh orchestration ─────────────────────────────────────────────────────
async def refresh(force: bool = False) -> bool:
    """Fetch from FRED and update state. Returns True on success."""
    async with _lock:
        if not force and not is_stale():
            return True
        try:
            result = await fetch_fred_curve()
            _state.curve = result["curve"]
            _state.observation_date = result["observation_date"]
            _state.fetched_at = _now_iso()
            _state.error = None
            _save_cache()
            log.info(
                "FRED yield curve refreshed (obs date %s, 10yr %.3f%%)",
                _state.observation_date, _state.curve.get(10, 0) * 100,
            )
            return True
        except Exception as e:  # noqa: BLE001
            _state.error = str(e)
            log.warning("FRED refresh failed: %s", e)
            return False


def is_stale() -> bool:
    if _state.curve is None or _state.fetched_at is None:
        return True
    age = datetime.now(timezone.utc) - datetime.strptime(
        _state.fetched_at, "%Y-%m-%d %H:%M UTC"
    ).replace(tzinfo=timezone.utc)
    return age > timedelta(hours=REFRESH_HOURS)


async def startup_refresh() -> None:
    """Called once at app startup. Uses cache if warm, otherwise hits FRED."""
    if not has_api_key():
        _state.error = "FRED_API_KEY not set — using embedded fallback curve."
        log.warning(_state.error)
        return
    if _load_cache():
        return
    await refresh(force=True)


async def refresh_loop() -> None:
    """Background task: re-fetch on a schedule for as long as the app lives."""
    interval = max(1, REFRESH_HOURS) * 3600
    while True:
        try:
            await asyncio.sleep(interval)
            if has_api_key():
                await refresh(force=True)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("Yield refresh loop error: %s", e)


# ── Public accessors ──────────────────────────────────────────────────────────
def get_active_curve() -> Dict[int, float]:
    """The curve every calculation should use. Never raises."""
    if _state.override is not None:
        return _state.override
    if _state.curve is not None:
        return _state.curve
    return EMBEDDED_REAL_YIELDS


def get_status() -> Dict:
    """Metadata for the Settings UI so staleness is visible, not silent."""
    if _state.override is not None:
        source, as_of = "override", _state.override_set_at
        note = _state.override_note or "Manual override active."
    elif _state.curve is not None:
        source, as_of = "fred_live", _state.observation_date or _state.fetched_at
        note = f"Live TIPS yields from FRED. Last fetched {_state.fetched_at}."
    else:
        source, as_of = "embedded", EMBEDDED_AS_OF
        note = (
            f"Embedded fallback curve from {EMBEDDED_AS_OF}. "
            "Set FRED_API_KEY and refresh to pull live yields."
        )
    return {
        "source": source,
        "as_of": as_of,
        "note": note,
        "fred_available": has_api_key(),
        "fred_fetched_at": _state.fetched_at,
        "fred_observation_date": _state.observation_date,
        "fred_error": _state.error,
        "is_stale": is_stale() and _state.override is None,
        "refresh_hours": REFRESH_HOURS,
    }


def set_override(yields: Dict[int, float], note: Optional[str] = None) -> Dict[int, float]:
    merged = dict(get_active_curve())
    merged.update({int(k): float(v) for k, v in yields.items()})
    _state.override = merged
    _state.override_set_at = _now_iso()
    _state.override_note = note
    return merged


def clear_override() -> None:
    _state.override = None
    _state.override_set_at = None
    _state.override_note = None
