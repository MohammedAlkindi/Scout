# Scout Architecture

Scout is built around one shared recommendation engine with two thin
transport layers:

- FastAPI for the browser application.
- MCP for agent/tool workflows.

The important rule is that recommendation logic does not live in either
transport layer. HTTP routes and MCP tools validate inputs, call
`server/orchestration.py`, and return typed responses.

## System Shape

```text
Browser UI
  src/*.ts
  public/index.html
  public/styles.css
        |
        v
FastAPI routes
  server/api.py
        |
        v
Shared orchestration
  server/orchestration.py
        |
        v
Service layer
  server/services/golden_hour.py
  server/services/weather.py
  server/services/locations.py
  server/services/scorer.py

MCP client
        |
        v
MCP tools
  server/mcp_server.py
        |
        v
Shared orchestration
```

## Backend Boundaries

`server/api.py`
: Defines the HTTP API, request models, rate limiting dependency, structured
error handlers, and static file mount. It should stay transport-focused.

`server/mcp_server.py`
: Registers MCP tools and returns the same typed schemas used by the HTTP API.
It should not duplicate recommendation logic.

`server/orchestration.py`
: Coordinates validation, caching, service calls, scoring, ranking, response
shaping, confidence labels, reason tags, caveats, and the narrow bundled demo
fallback for the Muscat sample flow.

`server/services/golden_hour.py`
: Pure solar-position math. No network calls, no cache, deterministic tests.

`server/services/weather.py`
: Open-Meteo integration. Handles provider response parsing and safe upstream
errors.

`server/services/locations.py`
: OpenStreetMap/Overpass integration. Converts tags into terrain, access,
permit, crowd, and image metadata signals.

`server/services/scorer.py`
: Pure scoring model. This is intentionally network-free so the ranking logic
can be tested without mocks.

`server/observability.py`
: Process-local structured telemetry. It records API outcomes, upstream
latency, Scout errors, and recommendation summaries using coarse coordinate
buckets rather than raw user intent or precise location history.

## Frontend Boundaries

`src/main.ts`
: Application bootstrap, session lifecycle, navigation, and top-level render
flow.

`src/api.ts`
: Typed fetch wrapper for the Scout HTTP API.

`src/storage.ts`
: Local browser persistence for sessions and preferences.

`src/share.ts`
: Read-only share-link encoding/decoding for recommendation responses. Shared
links hydrate into local sessions without a database.

`src/settings.ts`
: Preferences panel behavior and theme handling.

`src/views/*`
: UI rendering for the location, intent, and results screens. The location
view includes curated city, country, and place anchors so users can scout a
destination without expanding provider searches over huge radii.

`src/types.ts`
: Shared TypeScript types mirroring backend response contracts.

`public/styles.css`
: Design tokens, layout, states, and responsive behavior.

`public/dist/`
: TypeScript output. Do not edit this directory manually.

## Request Flow

1. The user chooses an origin from browser location, exact coordinates, or a
   curated destination anchor.
2. The browser sends a location, intent, radius, and optional shot type to
   `POST /api/recommendation`.
3. FastAPI validates the request and applies client-IP rate limiting.
4. Orchestration fetches candidate places from Overpass using an intent-derived
   tag query.
5. Orchestration fetches current and hourly weather from Open-Meteo.
6. Solar windows are computed locally using deterministic math.
7. Each candidate is scored against each upcoming light window.
8. The best window per candidate is ranked.
9. The response includes score breakdowns, confidence, reason tags, caveats,
   map coordinates, and image metadata when available.
10. The frontend renders a map-first overview and recommendation cards.
11. Users can copy a read-only share link for the result; opening that URL
    creates a local shared session and removes the share payload from the
    address bar to avoid duplicate imports on reload.

If the request matches the bundled Muscat sunset demo and a live provider fails,
orchestration returns a `demo_mode` response with static Muscat place candidates
and freshly calculated light windows. General user searches do not use this
fallback; they surface structured, recoverable errors.

## Caching And Rate Limiting

Scout uses in-process TTL caches:

- Weather: short TTL because conditions change quickly.
- Locations: longer TTL because geography changes slowly.

Scout also has token-bucket rate limiters:

- Inbound HTTP API rate limiting per client IP.
- Outbound weather rate limiting.
- Outbound location search rate limiting.

This is enough for a public prototype and small deployment. A multi-instance
production deployment would eventually move cache/rate-limit state to a shared
store.

## Data Sources

Scout deliberately uses keyless public data sources:

- Open-Meteo for weather.
- OpenStreetMap/Overpass for places.
- OSM `image` tags and Wikimedia Commons file metadata for place imagery.
- OpenStreetMap embeds and links for maps/directions.

This keeps local setup simple and avoids committed credentials. The tradeoff is
that place metadata quality varies by region.

## Error Handling

Raw provider errors should not reach the client. Service modules translate
network failures, malformed provider payloads, and empty result sets into
Scout-specific errors. The HTTP layer maps those to small JSON responses:

```json
{
  "error": "Location search is temporarily unavailable.",
  "code": "upstream_unavailable",
  "retryable": true,
  "recovery_hint": "Retry once. If it keeps failing, use the bundled Muscat demo scout for a guaranteed product walkthrough."
}
```

Unexpected exceptions are logged server-side and returned as a generic user-safe
message.

The API emits structured telemetry for HTTP requests, upstream calls, expected
Scout errors, and recommendations. Recommendation telemetry stores shot type,
result count, elapsed time, demo-mode usage, score, radius bucket, and coarse
coordinate bucket. It does not log raw provider payloads, raw intent text,
precise coordinates, or credentials. `GET /api/diagnostics` exposes the
process-local counters for smoke checks.

## Extension Points

Good next places to extend the architecture:

- Add a provider interface for paid place imagery while keeping OSM as the
  default.
- Export telemetry to a hosted sink when Scout needs multi-instance or
  long-retention observability.
- Add account-backed saved scouts behind a storage layer without changing the
  scoring model.
- Add snapshot-style visual regression testing around the map-first result page.
