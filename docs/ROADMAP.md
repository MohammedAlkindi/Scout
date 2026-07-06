# Roadmap

Scout is already a strong technical prototype. The next work should focus on
trust, polish, and repeatability.

## Now

- Keep the map-first recommendation view stable across desktop and mobile.
- Run deployment smoke checks after production deploys.
- Keep the bundled Muscat demo flow healthy as the guaranteed walkthrough path.
- Treat structured recovery panels, trust badges, and report export as part of
  the public demo surface.

## Next

- Add provider abstraction for optional richer place imagery.
- Add visual regression screenshots for the main result page.
- Expand E2E coverage for settings, conditions, preferences, and empty states.
- Add durable observability for upstream latency, rate limits, empty searches,
  and error rates.
- Add structured recommendation telemetry that does not collect sensitive user
  location history by default.
- Add a shareable read-only scout result URL.
- Add stronger accessibility testing and keyboard navigation checks.

## Later

- Account-backed saved scouts.
- Team/shared scout boards.
- User feedback loop for recommendation quality.
- More activity modes beyond photography and hiking.
- Optional paid provider integrations for maps, places, imagery, or traffic.

## Product Principles

- Recommendations should explain themselves.
- Public data uncertainty should be visible to the user.
- The app should feel like a field tool, not a generic AI chat wrapper.
- The default version should run without API keys.
- The UI should make the best next action obvious.
