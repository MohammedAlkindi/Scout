# Development Guide

This guide covers the local workflow for Scout.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

npm install
npm run build
```

Run the app:

```bash
uvicorn server.api:app --reload --port 8420
```

Open:

```text
http://127.0.0.1:8420/
```

## Frontend Workflow

Compile TypeScript:

```bash
npm run build
```

Watch TypeScript:

```bash
npm run watch
```

Typecheck without emitting files:

```bash
npm run typecheck
```

Rules:

- Keep frontend source in `src/`.
- Do not edit `public/dist/` manually.
- Do not use `any` in TypeScript.
- Keep response types in `src/types.ts` aligned with `server/schemas.py`.
- Use CSS variables from `:root` for design tokens.

## Backend Workflow

Run the FastAPI app:

```bash
uvicorn server.api:app --reload --port 8420
```

Run the MCP server:

```bash
python -m server.mcp_server
```

Rules:

- Keep HTTP concerns in `server/api.py`.
- Keep MCP registration in `server/mcp_server.py`.
- Put shared flow in `server/orchestration.py`.
- Put external API calls in `server/services/*`.
- Keep scoring pure and deterministic.
- Raise Scout-specific errors instead of exposing raw provider errors.

## Tests

Python unit tests:

```bash
pytest tests/test_scorer.py tests/test_golden_hour.py tests/test_locations.py tests/test_demo_fallback.py tests/test_observability.py -q
```

Browser regression tests:

```bash
npm run test:e2e
```

Full local verification:

```bash
npm run typecheck
npm run build
npm run test:e2e
pytest tests/test_scorer.py tests/test_golden_hour.py tests/test_locations.py tests/test_demo_fallback.py tests/test_observability.py -q
```

## Playwright

The Playwright config starts the FastAPI app on `127.0.0.1:8420`. Locally it
reuses an existing server if one is already running.

The current E2E coverage checks:

- repeated New Scout clicks do not create duplicate untouched sessions
- sidebar search filters saved sessions and shows an empty state
- manual location and activity submission renders map-first recommendations
- result pages expose a read-only share link and imported share links hydrate
  into local sessions
- settings changes persist and affect result units/time formatting
- settings drawer focus returns to the opener after close
- empty recommendation responses render a useful recovery state
- result cards expose trust badges and report export controls
- failed live scouting shows recovery actions and can open the bundled demo
- the main scouting flow remains usable at a 390px mobile viewport

## Useful Manual QA

Before sharing a build publicly, check:

- first-load empty state
- browser geolocation denial path
- manual coordinate path
- recommendation result cards
- map overview and embedded maps
- trust badges and report export buttons
- live-search failure recovery panel
- mobile sidebar behavior
- settings panel
- conditions and preferences sections
- repeated New Scout clicks

## Git Hygiene

Good commits are one logical change:

```text
Add map-first recommendation results
Fix duplicate empty scout sessions
Document Scout architecture and deployment
```

Avoid committing:

- `.env`
- `.env.local`
- `.venv/`
- `node_modules/`
- `playwright-report/`
- `test-results/`
