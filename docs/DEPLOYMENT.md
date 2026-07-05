# Deployment

Scout is configured for Vercel with a static TypeScript frontend and a Python
FastAPI backend.

## Current Target

Production URL:

```text
https://scout-six-beta.vercel.app
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
curl https://scout-six-beta.vercel.app/api/health
curl https://scout-six-beta.vercel.app/index.html
```

Check recent server errors:

```bash
npx vercel logs scout-six-beta.vercel.app --since 10m --status-code 500 --limit 20 --expand
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

