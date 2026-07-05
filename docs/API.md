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
  "error": "Too many requests. Please slow down and try again shortly."
}
```

Raw upstream exceptions are not exposed to clients.

## `GET /api/health`

Health check for deployment and smoke tests.

Response:

```json
{
  "status": "ok"
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
- ranked recommendations
- best window per recommendation
- light phase
- score and score breakdown
- confidence label
- reason tags
- caveats
- map coordinates
- image URL and attribution when public map metadata provides it

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
- Clients should treat caveats as part of the recommendation, not secondary
  metadata.
