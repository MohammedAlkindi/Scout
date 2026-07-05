# Scout

Scout is a location-aware field planning app for photographers and outdoor
creators. It turns a current position and a plain-language intent into a short
ranked set of places, timing windows, maps, and condition notes.

Instead of returning a generic list of popular spots, Scout scores nearby
OpenStreetMap candidates against sunlight phase, weather, distance, terrain,
and access signals. The same recommendation engine is exposed through both a
FastAPI web app and an MCP server.

## What Scout Does

- Finds nearby candidate locations from OpenStreetMap/Overpass.
- Calculates sunrise, sunset, golden hour, blue hour, solar noon, and azimuth.
- Pulls current and hourly weather from Open-Meteo.
- Scores each place/time window with deterministic service-layer logic.
- Shows maps, directions, media previews, condition summaries, and ranked cards.
- Persists local sessions and preferences in the browser.
- Exposes the same core capabilities as MCP tools for agent workflows.

## Architecture

Scout uses one Python backend and one TypeScript frontend. The important design
choice is that business logic lives in the service/orchestration layer, not in
the transport layer.

```text
Frontend (TypeScript)
  public/index.html
  public/styles.css
  public/dist/*.js
        |
        v
FastAPI HTTP layer
  server/api.py
        |
        v
Shared orchestration
  server/orchestration.py
        |
        v
Services
  server/services/golden_hour.py
  server/services/weather.py
  server/services/locations.py
  server/services/scorer.py

MCP server
  server/mcp_server.py
        |
        v
Shared orchestration
```

Both `server/api.py` and `server/mcp_server.py` call
`server/orchestration.py`, which keeps the MCP and web experiences aligned.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `get_golden_hour` | Returns sun and light-phase windows for a location and date. |
| `get_conditions` | Returns current weather and a 24-hour forecast. |
| `get_locations` | Finds nearby location candidates for a scouting intent. |
| `score_window` | Scores a location/time window against conditions. |
| `build_recommendation` | Produces the ranked end-to-end recommendation set. |

## Data Sources

- Weather: Open-Meteo, no API key required.
- Places: OpenStreetMap through Overpass, no API key required.
- Media: OpenStreetMap image tags and Wikimedia Commons metadata when present.
- Maps: OpenStreetMap embed and direction links.

When a real place image is unavailable, the frontend renders a restrained
generated scouting preview so the layout remains useful without pretending to
have photographic evidence.

## Project Layout

```text
server/
  api.py                 FastAPI HTTP app and static frontend serving
  mcp_server.py          MCP tool registration
  orchestration.py       Shared tool/recommendation flow
  schemas.py             Pydantic request and response models
  cache.py               In-memory TTL cache
  rate_limiter.py        Inbound and outbound rate limiting
  errors.py              Structured application errors
  services/
    golden_hour.py       Sun position and light-window calculations
    weather.py           Open-Meteo integration
    locations.py         Overpass/OpenStreetMap integration
    scorer.py            Deterministic recommendation scoring
src/
  main.ts                App bootstrap and view routing
  types.ts               Shared frontend response types
  api.ts                 Typed fetch wrapper
  settings.ts            Preferences panel and theme handling
  views/                 Location, intent, and results views
public/
  index.html
  styles.css             Design tokens and app UI
  dist/                  TypeScript output from `npm run build`
tests/
  test_golden_hour.py
  test_scorer.py
```

## Running Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

npm install
npm run build

uvicorn server.api:app --reload --port 8420
```

Open `http://127.0.0.1:8420/`.

To run the MCP server directly:

```bash
python -m server.mcp_server
```

## Configuration

Scout runs without required secrets. Optional environment variables are defined
in `server/config.py` for upstream base URLs, timeouts, cache TTLs, and rate
limits.

Do not commit `.env` files or credentials.

## Verification

```bash
npm run typecheck
npm run build
pytest tests/test_scorer.py tests/test_golden_hour.py -q
```

The Python tests focus on the deterministic core: golden-hour calculations and
condition scoring. TypeScript runs in strict mode and the project does not use
`any` types.

## Product Status

Scout is a polished prototype moving toward production readiness. The core
technical shape is solid: transport layers are thin, scoring is deterministic,
external API concerns are isolated, and the frontend is TypeScript-first.

The next maturity steps are:

- Add end-to-end tests for the web recommendation flow.
- Add structured observability for upstream API latency and failures.
- Add optional provider abstraction for richer place imagery.
- Add deployment configuration and environment documentation.
- Add accessibility and responsive screenshot checks to CI.
