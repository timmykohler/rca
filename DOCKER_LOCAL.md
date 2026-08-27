# Running locally with Docker

## Quick start

```bash
# 1. Add your FRED key (free: https://fred.stlouisfed.org/docs/api/api_key.html)
cp .env.example .env
#    then edit .env and paste the key in

# 2. Build and run
docker compose up --build
```

Open **http://localhost:8000**

That's it. The app fetches live TIPS yields on startup and re-fetches every
12 hours while it's running.

## Verify the yields are live

```bash
curl http://localhost:8000/api/health
```

Look for `"yield_source": "fred_live"`. If it says `"embedded"`, the key is
missing or the fetch failed — open the **Settings** tab, which shows the exact
error and a ↻ Refresh from FRED button.

## Everyday commands

```bash
docker compose up -d        # run in the background
docker compose logs -f      # watch what it's doing
docker compose down         # stop
docker compose up --build   # rebuild after pulling a new version
```

## Without compose

```bash
docker build -t rca-tool .
docker run -d -p 8000:8000 -e FRED_API_KEY=your_key_here --name rca rca-tool
```

## Running without a FRED key

The app still works — it falls back to the embedded January 2025 curve and
shows a red banner in Settings saying so. Fine for testing the UI, not for
client work.

## Sharing on your office network

```bash
ipconfig        # Windows — find the IPv4 Address, e.g. 192.168.1.45
ifconfig        # macOS / Linux
```

Others on the same network open `http://192.168.1.45:8000`.

## Notes

- The `yield-cache` volume keeps the last good curve across restarts, so a
  `docker compose restart` doesn't have to wait on FRED before calculating.
- Port 8000 is the default. To use a different one, change the left side of
  the `ports` mapping in `docker-compose.yml` (e.g. `"9000:8000"`).
- `update_yields.sh` is for the bare-metal VM install path only. Don't run it
  against a container — it rewrites source files that get discarded on rebuild.
