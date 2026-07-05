# Scout MCP Setup

Scout exposes the same planning engine through MCP and the web API. Use the MCP
server when you want an AI client to call Scout as a tool for location-aware
photo or outdoor planning.

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

python -m server.mcp_server
```

The server runs over stdio, which is the expected transport for local MCP
clients.

## Tools

| Tool | Use it when |
| --- | --- |
| `get_golden_hour` | You need sunrise, sunset, golden hour, blue hour, solar noon, and sun azimuth for a location/date. |
| `get_conditions` | You need current weather and a 24-hour forecast for a location. |
| `get_locations` | You need nearby OSM-backed candidate places for a scouting intent. |
| `score_window` | You already have a place/time window and want a 0-100 condition score. |
| `build_recommendation` | You want the full ranked recommendation flow in one call. |

## Example Client Configuration

Add a local MCP server entry that runs Scout from this repository:

```json
{
  "mcpServers": {
    "scout": {
      "command": "python",
      "args": ["-m", "server.mcp_server"],
      "cwd": "C:\\Users\\alkin\\Github\\Scout"
    }
  }
}
```

Use the virtualenv Python path instead if your MCP client does not inherit your
activated environment:

```json
{
  "mcpServers": {
    "scout": {
      "command": "C:\\Users\\alkin\\Github\\Scout\\.venv\\Scripts\\python.exe",
      "args": ["-m", "server.mcp_server"],
      "cwd": "C:\\Users\\alkin\\Github\\Scout"
    }
  }
}
```

## Example Prompts

- "Use Scout to find three golden-hour portrait spots near 23.5791, 58.4026."
- "Check whether the next blue-hour window is good for an urban skyline shoot."
- "Find a low-crowd outdoor place near me for landscape photos today."
- "Score this location and time window for hiking photography."

## Response Notes

`build_recommendation` returns ranked places with:

- best light window
- score and score breakdown
- confidence level
- reason tags
- caveats to verify locally
- map coordinates
- image metadata when OSM/Wikimedia provides it

Crowd, permit, access, and media availability are inferred from public map tags.
Treat those fields as planning signals, not authoritative local guidance.
