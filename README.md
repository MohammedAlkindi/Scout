# Scout

Scout is a location-aware field planning app for photographers and outdoor
creators. It turns a current position and a plain-language intent into a ranked
map of places, timing windows, condition notes, and local verification caveats.

Instead of returning a generic list of popular spots, Scout scores nearby
OpenStreetMap candidates against sunlight phase, weather, distance, terrain,
and access signals. The same recommendation engine is exposed through both a
FastAPI web app and an MCP server.

Live demo: [https://scoutphotography.vercel.app](https://scoutphotography.vercel.app)

## What Scout Does

- Finds nearby candidate locations from OpenStreetMap/Overpass.
- Starts scouts from current location, exact coordinates, or curated city,
  country, and place anchors.
- Calculates sunrise, sunset, golden hour, blue hour, solar noon, and azimuth.
- Pulls current and hourly weather from Open-Meteo.
- Scores each place/time window with deterministic service-layer logic.
- Shows a map-first result view with ranked pins, cards, directions, and media previews.
- Explains each recommendation with score breakdowns, confidence, reason tags, and caveats.
- Labels each card with trust badges for live, estimated, and fallback signals.
- Copies or downloads a shareable Markdown scout report for each recommended place.
- Creates read-only share links that rehydrate a scout result without requiring an account.
- Provides privacy-safe diagnostics for API, upstream, and recommendation outcomes.
- Persists local sessions and preferences in the browser.
- Filters local sessions from the sidebar search.
- Prevents duplicate untouched sessions when users repeatedly start a new scout.
- Includes a guaranteed Muscat demo flow for public walkthroughs when live providers are slow.
- Exposes the same core capabilities as MCP tools for agent workflows.

## Architecture

Scout uses one Python backend and one TypeScript frontend. The important design
choice is that business logic lives in the service/orchestration layer, not in
the transport layer.

For a deeper technical walkthrough, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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

## Demo Readiness

The live site includes a bundled `Try Muscat sunset scout` session. It is meant
to be the reliable public walkthrough path: if live map/weather providers are
slow during a Muscat-area coastal sunset request, Scout returns a `demo_mode`
recommendation using static Muscat places plus freshly calculated light
windows.

For normal user searches, provider failures are not hidden. The API returns
structured recovery metadata and the frontend shows retry plus demo actions.

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries, data flow, caching, and extension points. |
| [API](docs/API.md) | HTTP endpoints, request shapes, response notes, and enums. |
| [Scoring](docs/SCORING.md) | Recommendation model, weights, confidence, and caveats. |
| [MCP Setup](docs/MCP_SETUP.md) | Local MCP server setup and example tool prompts. |
| [Deployment](docs/DEPLOYMENT.md) | Vercel routing, build, environment variables, and verification. |
| [Development](docs/DEVELOPMENT.md) | Local setup, commands, tests, and contribution workflow. |
| [Roadmap](docs/ROADMAP.md) | Near-term maturity work and future product directions. |

## Project Layout

```text
server/
  api.py                 FastAPI HTTP app and static frontend serving
  observability.py       Privacy-safe structured telemetry and diagnostics
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
  e2e/
    scout.spec.ts        Browser smoke/regression tests
api/
  index.py               Vercel ASGI entrypoint
docs/
  ARCHITECTURE.md        System design and extension points
  API.md                 HTTP API reference
  SCORING.md             Recommendation model details
  MCP_SETUP.md           MCP setup guide
  DEPLOYMENT.md          Deployment guide
  DEVELOPMENT.md         Development guide
  ROADMAP.md             Product and technical roadmap
.github/workflows/
  ci.yml                 Python, TypeScript, build, and browser smoke tests
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

See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for client configuration and example prompts.

## Deployment

Scout includes a Vercel deployment configuration:

- `vercel.json` builds the TypeScript frontend, serves `public`, redirects `/` to `/index.html`, and routes `/api/*` to FastAPI.
- `api/index.py` exposes the FastAPI app as the ASGI entrypoint.
- `.vercelignore` excludes local secrets, virtualenvs, node modules, and test output.

The app does not require API keys for its default data sources.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment commands and smoke checks.

## Configuration

Scout runs without required secrets. Optional environment variables are defined
in `server/config.py` for upstream base URLs, timeouts, cache TTLs, and rate
limits.

Do not commit `.env` files or credentials.

## Verification

```bash
npm run typecheck
npm run build
npm run test:e2e
pytest tests/test_scorer.py tests/test_golden_hour.py tests/test_locations.py tests/test_demo_fallback.py tests/test_observability.py -q
```

The Python tests focus on the deterministic core: golden-hour calculations and
condition scoring, Overpass query shaping, and the bundled demo fallback.
TypeScript runs in strict mode and the project does not use `any` types.
Playwright covers the main UI flow, recovery UX, trust badges, export/share
controls, settings persistence, sidebar search, empty states, visual smoke, and
a regression for repeated New Scout clicks creating duplicate empty sessions.

GitHub Actions runs the full verification set on pushes to `main` and pull
requests.

## Product Status

Scout is a polished prototype moving toward production readiness. The core
technical shape is solid: transport layers are thin, scoring is deterministic,
external API concerns are isolated, CI is in place, and the frontend is
TypeScript-first.

Remaining maturity steps:

- Export telemetry to a durable hosted sink if traffic grows beyond one process.
- Add optional provider abstraction for richer place imagery.
- Add full WCAG audit and snapshot-style visual regression once the UI stabilizes.
- Add account-backed saved scouts if the product moves beyond local sessions.
