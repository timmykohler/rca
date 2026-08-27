"""
TIPS Yield Curve Updater
Fetches current real yields from the Federal Reserve (FRED) API.

Usage:
  python yield_curve.py              # prints current curve
  python yield_curve.py --save       # updates actuarial.py in-place

Schedule with cron for automatic updates:
  0 8 * * 1 cd /path/to/rca-tool/backend && python yield_curve.py --save
"""

import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import re
import sys
import os

# FRED series IDs for real TIPS yields
# See: https://fred.stlouisfed.org/categories/82
FRED_SERIES = {
    5:  "DFII5",   # 5-Year TIPS
    7:  "DFII7",   # 7-Year TIPS
    10: "DFII10",  # 10-Year TIPS
    20: "DFII20",  # 20-Year TIPS
    30: "DFII30",  # 30-Year TIPS
}

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


def fetch_yield(series_id: str, api_key: str) -> float | None:
    """Fetch the most recent observation for a FRED series."""
    today = datetime.today()
    start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    end = today.strftime("%Y-%m-%d")

    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
        "observation_end": end,
        "sort_order": "desc",
        "limit": "5",
    }

    url = FRED_BASE + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
            observations = data.get("observations", [])
            for obs in observations:
                val = obs.get("value", ".")
                if val != ".":
                    return float(val) / 100  # FRED returns as percent, convert to decimal
    except Exception as e:
        print(f"  Warning: Could not fetch {series_id}: {e}")
    return None


def get_current_real_yields(api_key: str) -> dict:
    """
    Returns dict of {term_years: real_yield} from FRED.
    Falls back to embedded estimates for any failed fetches.
    """
    # Fallback values (updated periodically)
    fallbacks = {
        1:  -0.005,
        2:  -0.002,
        3:   0.003,
        5:   0.018,
        7:   0.020,
        10:  0.022,
        15:  0.022,
        20:  0.023,
        25:  0.023,
        30:  0.023,
    }

    print("Fetching current TIPS yields from FRED...")
    fetched = {}
    for term, series_id in FRED_SERIES.items():
        val = fetch_yield(series_id, api_key)
        if val is not None:
            fetched[term] = val
            print(f"  {term:2d}-year TIPS: {val:.3%}")
        else:
            fetched[term] = fallbacks.get(term, 0.02)
            print(f"  {term:2d}-year TIPS: {fetched[term]:.3%} (fallback)")

    # Interpolate short-end (1, 2, 3 years) from 5-year
    five = fetched.get(5, 0.018)
    for t, bump in [(3, -0.005), (2, -0.008), (1, -0.013)]:
        fetched[t] = max(-0.02, five + bump)

    # Fill mid-range
    ten = fetched.get(10, 0.022)
    fetched[15] = (ten + fetched.get(20, 0.023)) / 2

    return fetched


def update_actuarial_file(yields: dict, actuarial_path: str):
    """Patch DEFAULT_REAL_YIELD_CURVE in actuarial.py in-place."""
    with open(actuarial_path) as f:
        content = f.read()

    # Build new curve block
    lines = ["DEFAULT_REAL_YIELD_CURVE = {"]
    for term in sorted(yields.keys()):
        lines.append(f"    {term}:  {yields[term]:.4f},")
    lines.append("}")
    new_block = "\n".join(lines)

    # Replace existing block
    pattern = r"DEFAULT_REAL_YIELD_CURVE\s*=\s*\{[^}]+\}"
    if re.search(pattern, content, re.DOTALL):
        updated = re.sub(pattern, new_block, content, flags=re.DOTALL)
        with open(actuarial_path, "w") as f:
            f.write(updated)
        print(f"\n✓ Updated DEFAULT_REAL_YIELD_CURVE in {actuarial_path}")
        print(f"  Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    else:
        print("  Warning: Could not locate DEFAULT_REAL_YIELD_CURVE pattern in file.")


if __name__ == "__main__":
    save_mode = "--save" in sys.argv

    api_key = os.environ.get("FRED_API_KEY", "")
    if not api_key:
        print("Error: FRED_API_KEY environment variable is not set.")
        print("Set it with: export FRED_API_KEY=your_key_here")
        sys.exit(1)
    yields = get_current_real_yields(api_key)

    print("\nCurrent Real TIPS Yield Curve:")
    for term in sorted(yields.keys()):
        print(f"  {term:2d}-year: {yields[term]:+.3%}")

    if save_mode:
        here = os.path.dirname(os.path.abspath(__file__))
        actuarial_path = os.path.join(here, "engine", "actuarial.py")
        update_actuarial_file(yields, actuarial_path)
    else:
        print("\nRun with --save to update actuarial.py")
