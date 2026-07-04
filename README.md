# Scout

Scout is a location-aware photography and outdoor activity recommendation
tool. Grant it your location, describe what you want to shoot or do, and it
reasons over live sun position, weather, and place data to hand back a small
number of specific, timing-aware recommendations — not a static "top 10
spots" list.

> "Golden hour at Inspiration Point, 7:42–8:21 PM. 20% cloud cover, light
> wind, no rain expected. Falls within golden hour; skies suit landscape
> work; medium crowds expected."

## Architecture

Scout is one Python backend serving both an MCP server and an HTTP API, and
one vanilla-TypeScript frontend, all built around a strict layering rule:
**business logic lives in one place and both interfaces call it.**

```
                       ┌─────────────────────────┐
                       │  server/orchestration.py │   <- the 5 tools' logic,
                       │  (caching, scoring glue) │      shared by both layers
                       └───────────┬─────────────┘
                    ┌──────────────┴──────────────┐
          ┌─────────▼─────────┐         ┌─────────▼─────────┐
          │ server/mcp_server │         │    server/api.py   │
          │  (FastMCP tools)  │         │  (FastAPI routes)  │
          └────────────────────┘        └──────────┬─────────┘
                                                     │ serves
                                          ┌──────────▼─────────┐
                                          │   public/ (built    │
                                          │   from src/*.ts)    │
                                          └─────────────────────┘

server/services/          <- pure logic + external API integrations,
  golden_hour.py             called by orchestration.py, never by the
  scorer.py                  MCP/HTTP layers directly
  weather.py
  locations.py
```

- **`server/services/golden_hour.py`** and **`server/services/scorer.py`**
  are pure, deterministic, network-free functions — no I/O, fully unit
  tested (`tests/`).
- **`server/services/weather.py`** and **`server/services/locations.py`**
  wrap the two external APIs. Both are rate-limited (`server/rate_limiter.py`)
  and every failure is translated into a `ScoutError` subclass
  (`server/errors.py`) before it leaves the service layer — a raw `httpx`
  exception or an upstream HTML error page never reaches a caller.
- **`server/cache.py`** is a small in-memory, per-key-locked TTL cache.
  Weather is cached 10 minutes (it drifts fast); locations are cached 24
  hours (geography doesn't).
- **`server/orchestration.py`** implements the five tools end to end
  (translating between service-layer dataclasses and the shared Pydantic
  schemas in `server/schemas.py`) and is the *only* place that calls the
  service layer. Both `mcp_server.py` and `api.py` are thin: they parse
  transport-specific input, call orchestration, and translate errors.
- **`server/mcp_server.py`** registers the five MCP tools with
  [FastMCP](https://github.com/modelcontextprotocol/python-sdk).
- **`server/api.py`** is a FastAPI app exposing the same five operations as
  REST endpoints under `/api/*`, plus per-client-IP rate limiting and a
  structured-error-response middleware. It also serves the compiled
  frontend as static files, so there's one process and no CORS to configure
  in production.

### The five MCP tools

| Tool | What it does |
|---|---|
| `get_golden_hour` | Sunrise, sunset, golden hour, blue hour, solar noon, and sun azimuth for a location + date |
| `get_conditions` | Current weather + 24h hourly forecast (cloud cover, wind, visibility, precipitation) |
| `get_locations` | Candidate locations near a point matching a free-text shot/activity description, with distance, terrain, accessibility, and permit notes |
| `score_window` | Scores a location + time window 0–100 against live conditions, with a plain-English explanation |
| `build_recommendation` | Orchestrates all four above into the top 3 location + time-window recommendations |

## Key design decisions

These are deliberate, documented tradeoffs — not oversights:

- **No API keys, anywhere.** Weather comes from
  [Open-Meteo](https://open-meteo.com) and locations from OpenStreetMap's
  [Overpass API](https://overpass-api.de) — both free and keyless. This was
  a scope decision, not a limitation: the project runs with zero signup
  friction. See `server/config.py` for the (non-secret) environment
  variables that *do* exist — base URLs, timeouts, cache TTLs, rate limits.
- **All timestamps are UTC.** `golden_hour.py` has no timezone database
  (no `timezonefinder`/`pytz` dependency) to derive a location's IANA zone
  from lat/lng alone. The frontend already has the user's local clock via
  the browser, so it converts UTC → local for display (`src/format.ts`).
- **Azimuth is a compass bearing (0=N, 90=E, 180=S, 270=W).** The underlying
  solar-position formulas naturally produce azimuth from South; Scout
  rotates it for the more common photography/navigation convention.
- **"Permit required" and "crowd level" are best-effort heuristics** inferred
  from OpenStreetMap tags (`access`, `fee`, `protect_class`, notability tags
  like `wikidata`). OSM has no real foot-traffic or permit-office data —
  every candidate should be read as "worth checking," not "verified."
  (`server/services/locations.py`)
- **Recommendation scoring is capacity-scoped, not location-scoped:**
  `build_recommendation` scores every nearby candidate against the
  *origin's* weather rather than fetching per-candidate forecasts, since
  cloud cover/wind don't meaningfully vary across a ~15 mile radius.
- **A time window's light phase is classified by its midpoint**
  (`golden_hour.classify_window`), not as a blend of overlapping phases —
  a deliberate simplification documented in code.

## Setup

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

# Run the HTTP API + frontend (build the frontend first, see below)
uvicorn server.api:app --reload --port 8420

# ...or run the MCP server standalone over stdio
python -m server.mcp_server
```

No environment variables are required to run Scout — see
`server/config.py` for the optional ones (timeouts, cache TTLs, rate
limits, alternate base URLs for the two upstream APIs).

### Frontend

```bash
npm install
npm run build      # tsc -> public/dist/*.js
npm run watch       # or: rebuild on change during development
```

Then open `http://127.0.0.1:8420/` (served by the FastAPI app above) — no
separate frontend server or bundler.

## Tests

```bash
pytest tests/ -v
pytest tests/ --cov=server.services.scorer --cov=server.services.golden_hour --cov-report=term-missing

npm run typecheck   # tsc --noEmit, strict mode, zero `any`
```

`test_golden_hour.py` and `test_scorer.py` cover the two pure-logic modules
at ~98% line coverage using two kinds of assertions: internal invariants
that hold regardless of any specific reference value (sunrise-before-noon-
before-sunset, symmetry around solar noon, azimuth ranges, deterministic
scoring), and a few broad sanity bounds against widely-known facts (e.g.
"London's midsummer sunrise is pre-dawn UTC") since exact minute-level
reference values can't be independently verified without network access
while writing the tests.

## Project layout

```
server/
  mcp_server.py          MCP tool definitions (FastMCP)
  api.py                 HTTP API (FastAPI), serves public/ as static files
  orchestration.py        shared logic for all 5 tools; both layers call this
  schemas.py              Pydantic request/response models (shared)
  cache.py                TTL cache
  rate_limiter.py         token-bucket rate limiting (outbound + inbound)
  errors.py               structured error types
  config.py               environment variable configuration
  services/
    golden_hour.py        sun position math (pure, no deps)
    scorer.py              condition scoring (pure)
    weather.py              Open-Meteo integration
    locations.py            Overpass/OSM integration
tests/
  test_golden_hour.py
  test_scorer.py
src/
  types.ts                shared TypeScript interfaces (mirror schemas.py)
  api.ts                  typed fetch wrapper
  format.ts               time/phase/distance formatting helpers
  main.ts                 entry point / view router
  views/
    locationGrant.ts
    intentInput.ts
    results.ts
public/
  index.html
  styles.css              design tokens + component styles
  dist/                   compiled output (npm run build; gitignored)
```
