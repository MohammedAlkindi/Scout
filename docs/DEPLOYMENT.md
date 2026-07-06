# Deployment

Scout is configured for Vercel with a static TypeScript frontend and a Python
FastAPI backend.

## Current Target

Production URL:

```text
https://scoutphotography.vercel.app
```

## Files

| File | Purpose |
| --- | --- |
| `vercel.json` | Builds the frontend, serves `public`, redirects `/` to `/index.html`, and routes `/api/*` to FastAPI. |
| `api/index.py` | ASGI entrypoint imported by Vercel's Python runtime. |
| `.vercelignore` | Excludes local secrets, virtualenvs, node modules, and test output. |
| `requirements.txt` | Python dependencies for the API runtime. |
| `package.json` | TypeScript build and browser test scripts. |

## Build

Vercel runs:

```bash
npm ci && npm run build
```

The TypeScript compiler writes browser JavaScript into `public/dist/`.

## Routing

Expected public routing:

```text
/              -> /index.html
/index.html    -> static frontend
/dist/*        -> static frontend assets
/api/*         -> FastAPI through api/index.py
```

The FastAPI application also mounts `public/` locally so the same backend can
serve the app during development.

## Environment Variables

Scout does not require API keys for its default providers.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `OPEN_METEO_BASE_URL` | Override weather provider endpoint. |
| `OVERPASS_BASE_URL` | Override Overpass endpoint. |
| `OVERPASS_BASE_URLS` | Optional comma-separated Overpass-compatible endpoint list for failover. Defaults to the primary Overpass endpoint plus a tested Overpass-compatible mirror. |
| `SCOUT_OVERPASS_QUERY_TIMEOUT_SECONDS` | Overpass query timeout embedded in the Overpass query. Defaults to `3`. |
| `SCOUT_OVERPASS_HTTP_TIMEOUT_SECONDS` | HTTP timeout for each Overpass request. Defaults to `3`. |
| `SCOUT_OVERPASS_MAX_ATTEMPTS` | Maximum focused Overpass attempts per location search. Defaults to `2`. |
| `SCOUT_OVERPASS_RATE_LIMIT_COOLDOWN_SECONDS` | In-process cooldown after an Overpass `429`. Defaults to `60`. |
| `SCOUT_HTTP_USER_AGENT` | User-Agent sent to Overpass. |
| `SCOUT_HTTP_TIMEOUT_SECONDS` | Outbound HTTP timeout. |
| `SCOUT_WEATHER_CACHE_TTL_SECONDS` | Weather cache TTL. |
| `SCOUT_LOCATIONS_CACHE_TTL_SECONDS` | Location cache TTL. |
| `SCOUT_API_CLIENT_RATE_LIMIT_MAX_CALLS` | Per-client API bucket size. |
| `SCOUT_API_CLIENT_RATE_LIMIT_PER_SECONDS` | Per-client API rate window. |

Do not commit `.env`, `.env.local`, provider credentials, or Vercel tokens.

## Deploy Commands

Link the project once:

```bash
npx vercel link --yes --project scout
```

Deploy production:

```bash
npx vercel deploy --prod --yes
```

Verify after deploy:

```bash
curl https://scoutphotography.vercel.app/api/health
curl https://scoutphotography.vercel.app/api/diagnostics
curl https://scoutphotography.vercel.app/index.html
```

Demo-day smoke check:

1. Open `https://scoutphotography.vercel.app`.
2. Confirm `Try Muscat sunset scout` appears in the sidebar.
3. Open the demo session and verify the map, ranked cards, trust badges, and
   report export buttons render.
4. Copy or open the read-only share link and verify it recreates the scout
   result without signing in.
5. Start a live scout with manual coordinates near Muscat
   (`23.5793, 58.4025`) and activity `Coastal sunset`.
6. If a provider is slow, the Muscat demo-style request should return
   `demo_mode: true` instead of leaving the user with a dead end.

Check recent server errors:

```bash
npx vercel logs scoutphotography.vercel.app --since 10m --status-code 500 --limit 20 --expand
```

## Common Issues

Root returns 404
: Confirm `vercel.json` redirects `/` to `/index.html`.

`/api/health` returns HTML
: Confirm only `/api/:path*` is rewritten to `api/index.py`; do not add a
catch-all rewrite for every path.

Static frontend works but API fails
: Check Vercel function logs and confirm `requirements.txt` includes the Python
runtime dependencies.

Local app works but deployed app cannot load assets
: Run `npm run build` and confirm `public/dist/` is generated before deploy.

Location search returns `Location provider is rate-limited`
: OpenStreetMap Overpass returned `429 Too Many Requests`. This usually means a
broad intent or dense-city radius produced an expensive location query. Scout
mitigates this by searching named features only, using narrower tags for generic
photo intents, and expanding from a small radius before trying the full radius.
If it still happens, retry with a more specific intent such as `sunset
landscape`, `beach portraits`, or `urban architecture`, or reduce the search
radius.

Location search returns `Location search is temporarily unavailable`
: The location provider timed out, failed, or returned an unexpected response.
Check recent function logs with:

```bash
npx vercel logs scoutphotography.vercel.app --since 15m --limit 100 --expand
```

For the bundled Muscat sunset demo, Scout should fall back to a static demo
plan if the live provider fails. For all other searches, the frontend should
show a structured recovery panel with retry and demo actions.

Demo session is missing
: Clear local storage or use the New Scout flow once. The frontend now ensures
the bundled `Try Muscat sunset scout` session exists on app startup without
creating duplicates.
