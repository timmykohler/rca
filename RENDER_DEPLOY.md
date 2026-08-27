# Deploying to Render with live FRED yields

## 1. Set the API key (required)

Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html

Render Dashboard → your service → **Environment** → **Add Environment Variable**

| Key | Value |
|---|---|
| `FRED_API_KEY` | *your key* |
| `FRED_REFRESH_HOURS` | `12` (optional, default 12) |

Save. Render redeploys automatically.

## 2. Verify it worked

```
curl https://your-app.onrender.com/api/health
```

You want `"yield_source": "fred_live"` and `"yield_stale": false`.
If you see `"embedded"`, the key is missing or the fetch failed — check
`/api/yield-curve` for the `fred_error` field, or the Settings tab in the UI.

## 3. How refresh works now

- **On startup** — fetches FRED as a background task (does not block the health check)
- **Every 12 hours** — background loop re-fetches
- **On demand** — Settings tab → ↻ Refresh from FRED, or `POST /api/yield-curve/refresh`
- **Lazy** — a `GET /api/yield-curve` past the TTL triggers a re-fetch

## Note on the free tier

Free services spin down after ~15 min idle. Each cold start re-fetches FRED,
which adds ~1–2s to the first request but means the data is always current.
`/tmp` cache survives warm restarts only. Starter ($7/mo) avoids spin-down.

## Do not use `update_yields.sh`

That script rewrites `actuarial.py` on disk and calls `systemctl` — it was built
for a VM. On Render the filesystem is ephemeral and changes are lost on redeploy.
It has been left in the repo for the VM install path but is not used by the app.
