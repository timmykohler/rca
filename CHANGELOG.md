# Changelog

## v2.1.0

### Fixed — yield curve was disconnected from calculations
The app carried three separate yield curves. `calculate.py` imported
`DEFAULT_REAL_YIELD_CURVE` from `actuarial.py` (10yr = 0.9%) while the Settings
page displayed `EMBEDDED_REAL_YIELDS` from the router (10yr = 2.2%). The manual
override changed the display but never touched a single discount rate.

All calculations now read one source of truth via `services/fred.py`. Funded
ratios shift materially as a result — one sample plan crosses the 1.0 funding
threshold.

### Added — live FRED yields
- Concurrent fetch of DFII5/7/10/20/30 with a 30-day observation window
- Fetch on startup (background task, does not block health check)
- Background refresh every `FRED_REFRESH_HOURS` (default 12)
- Lazy re-fetch when a request arrives past TTL
- Disk cache so restarts don't have to re-hit FRED
- Graceful fallback to the embedded curve with the error surfaced, not swallowed
- `POST /api/yield-curve/refresh` and a Refresh button in Settings
- `/api/health` reports `yield_source` and `yield_stale`

### Fixed — stale results banner on first load
The active result was persisted to `localStorage`, so opening the tool fresh
showed "Results ready — <last client>" when no plan had been loaded. It now
lives in `sessionStorage`: it still survives a page refresh and tab navigation,
but is gone once the browser tab closes.

For an advisor running back-to-back client meetings this was both confusing and
a quiet privacy issue — one client's name and figures sitting in the header
while the next client looks at the screen.

Saved plans (History) are deliberate user actions and still persist in
localStorage. On first run the app also purges any result left in localStorage
by an earlier version, so old client data doesn't linger there.

Added a ✕ control on the header banner to clear the current result and return
to Manual Input.

### Fixed — waterfall chart (Compare tab)
- Domain now covers the full running path. Large negative drivers previously
  rendered bars that overflowed the axis into the label area.
- Category labels wrap onto multiple lines instead of truncating at 13 chars
  with an ellipsis. Full label text is always shown.
- Labels sit on a fixed baseline below a drawn axis; the gutter is sized to the
  tallest label so nothing is clipped.
- Value labels are clamped inside the plot so they can't collide with categories.

### Fixed — input readability
- Number spinners suppressed in table fields. They consumed 16–20px, which left
  roughly two visible characters in the Surv % column.
- Removed a nested border: `input-field-sm` was applying its own border, shadow
  and background inside the prefix/suffix wrapper's border.
- Widened Surv %, Surv., Start Age and Adj % columns; more row padding.

### Deployment
- `Dockerfile` honors `$PORT` (was hardcoded to 8000)
- Added `.dockerignore`, `docker-compose.yml`, `.env.example`, `render.yaml`
- Added `.gitignore` — `.env` is excluded so the FRED key can't be committed

### Tests
`test_calculate_pittman_dirk` was implicitly pinned to the old 0.9% curve and
broke once the curve was connected. It now pins the curve explicitly so it
won't drift with the market. 34/34 passing.
