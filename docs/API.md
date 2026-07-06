# Scout API

Scout exposes a small HTTP API from `server/api.py`. The same core logic is
also available through MCP tools in `server/mcp_server.py`.

Local base URL:

```text
http://127.0.0.1:8420
```

Production base URL:

```text
https://scoutphotography.vercel.app
```

## Error Shape

All expected errors return a small JSON object:

```json
{
  "error": "Too many requests. Please slow down and try again shortly.",
  "code": "rate_limited",
  "retryable": true,
  "recovery_hint": "Wait a minute, then retry. Scout protects the free map providers from repeated broad searches."
}
```

Raw upstream exceptions are not exposed to clients.

Common operational errors:

| Status | Example message | Meaning |
| --- | --- | --- |
| `404` | `No named locations found matching this description in the given radius.` | The provider responded, but Scout could not find named places for the intent/radius. |
| `429` | `Location provider is rate-limited. Try a more specific intent or smaller search radius.` | OpenStreetMap Overpass throttled the request. This is more likely for broad intents in dense cities. |
| `502` | `Location search is temporarily unavailable. Try a more specific intent or smaller search radius.` | The location provider timed out, returned an unexpected response, or failed. |

The browser uses `code`, `retryable`, and `recovery_hint` to show a recovery
panel with retry and demo actions instead of exposing provider jargon.

## `GET /api/health`

Health check for deployment and smoke tests.

Response:

```json
{
  "status": "ok"
}
```

## `GET /api/diagnostics`

Returns process-local, privacy-safe telemetry for smoke checks and operational
debugging. The response includes counters and recent structured events for API
requests, upstream calls, Scout errors, and completed recommendations.

The endpoint intentionally avoids raw intent text and precise location history.
Recommendation events use coarse coordinate and radius buckets.

Response shape:

```json
{
  "status": "ok",
  "generated_at": "2026-07-06T13:30:00.000000+00:00",
  "counters": {
    "http_request": 12,
    "upstream_call.open_meteo.success": 4
  },
  "recent_events": []
}
```

## `GET /api/golden-hour`

Returns sunrise, sunset, solar noon, golden-hour windows, blue-hour windows,
day length, and polar-day/polar-night flags.

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `lat` | number | Latitude, -90 to 90. |
| `lng` | number | Longitude, -180 to 180. |
| `date` | string | ISO date, for example `2026-07-05`. |

Example:

```bash
curl "http://127.0.0.1:8420/api/golden-hour?lat=23.5791&lng=58.4026&date=2026-07-05"
```

## `GET /api/conditions`

Returns current weather and the next 24 hourly forecast entries.

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `lat` | number | Latitude, -90 to 90. |
| `lng` | number | Longitude, -180 to 180. |

Example:

```bash
curl "http://127.0.0.1:8420/api/conditions?lat=23.5791&lng=58.4026"
```

## `GET /api/locations`

Finds named nearby candidate places from OpenStreetMap/Overpass.

Scout intentionally narrows Overpass queries before sending them:

- generic photo intents search named viewpoints and parks instead of broad
  unnamed map features
- broad searches start with a small radius and expand only if no named
  candidates are found
- dense-city searches start with a 1-mile pass to avoid expensive provider
  queries before expanding outward
- unnamed OSM features are filtered out at query time because they do not make
  useful user-facing recommendations
- multi-category intents are searched as focused tag groups instead of one
  large union query

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `lat` | number | Latitude, -90 to 90. |
| `lng` | number | Longitude, -180 to 180. |
| `intent` | string | Free-text scouting intent. |
| `radius_miles` | number | Optional. Defaults to `15`. |
| `limit` | number | Optional. Defaults to `10`. |

Example:

```bash
curl "http://127.0.0.1:8420/api/locations?lat=23.5791&lng=58.4026&intent=sunset%20landscape"
```

## `POST /api/score-window`

Scores one location and time window against live conditions.

Request body:

```json
{
  "latitude": 23.5791,
  "longitude": 58.4026,
  "window_start": "2026-07-05T14:25:00Z",
  "window_end": "2026-07-05T15:00:00Z",
  "location_name": "Mutrah Corniche",
  "shot_type": "landscape",
  "crowd_level": "medium",
  "permit_required": false,
  "accessibility_difficulty": 0.3
}
```

Response includes:

- `score`
- `explanation`
- `light_phase`
- `breakdown.light`
- `breakdown.weather`
- `breakdown.crowd`
- `breakdown.access`

## `POST /api/recommendation`

Runs the full scouting flow and returns ranked recommendations.

Request body:

```json
{
  "latitude": 23.5791,
  "longitude": 58.4026,
  "intent": "romantic golden hour portraits",
  "radius_miles": 15,
  "shot_type": "portrait"
}
```

`shot_type` is optional. If omitted, Scout infers it from the intent.

Response includes:

- origin coordinates
- resolved shot type
- generation timestamp
- `demo_mode` and `source_note` when Scout used its bundled fallback demo
- ranked recommendations
- best window per recommendation
- light phase
- score and score breakdown
- confidence label
- reason tags
- caveats
- map coordinates
- image URL and attribution when public map metadata provides it

## Demo Fallback

Scout includes a narrow, intentional fallback for the bundled
`Try Muscat sunset scout` flow. If a Muscat-area landscape/coastal sunset
request cannot reach live location or weather providers, orchestration returns
static Muscat place candidates with freshly calculated light windows and
`demo_mode: true`.

This fallback is not used for general user searches. Non-demo provider failures
still return structured errors so the UI can offer retry and recovery actions.

## Enumerations

Shot types:

```text
landscape, portrait, astro, wildlife, urban, hiking
```

Light phases:

```text
golden_hour, blue_hour, daylight, night
```

Crowd levels:

```text
low, medium, high
```

Recommendation confidence:

```text
high, medium, low
```

## Notes

- Weather is sourced from Open-Meteo.
- Places are sourced from OpenStreetMap/Overpass.
- Crowd, permit, access, and media fields are inferred from public map tags.
- Result cards expose trust badges for live, estimated, and fallback signals.
- The browser can create read-only share links by encoding one recommendation
  response into the URL. Shared links hydrate locally and do not require backend
  storage.
- Clients should treat caveats as part of the recommendation, not secondary
  metadata.
