# Recommendation And Scoring Model

Scout ranks candidate places by scoring each place against upcoming light
windows and live conditions.

The scoring model is intentionally deterministic. It does not call an LLM, does
not make network requests, and can be tested with fixed inputs.

## Inputs

The full recommendation flow uses:

- origin latitude and longitude
- free-text intent
- optional shot type
- nearby OpenStreetMap candidates
- upcoming golden-hour and blue-hour windows
- current and hourly weather
- inferred crowd, access, and permit signals

## Shot Type

Scout accepts these shot types:

```text
landscape, portrait, astro, wildlife, urban, hiking
```

If the API caller does not provide a shot type, Scout infers one from intent
keywords in `server/orchestration.py`.

## Light Windows

`server/services/golden_hour.py` computes:

- sunrise
- sunset
- solar noon
- morning golden hour
- evening golden hour
- morning blue hour
- evening blue hour

All returned timestamps are UTC.

Scout scores upcoming golden-hour and blue-hour windows first. If the current
day's windows have passed, it looks at the next morning's windows.

## Score Components

The final score is a weighted blend:

| Component | Weight | Meaning |
| --- | ---: | --- |
| Light | 35% | Best phase for the activity, with a small preference for the center of the window. |
| Weather | 30% | Cloud cover fit, wind, visibility, and precipitation probability. |
| Crowd | 20% | Lower expected crowding scores higher. |
| Access | 15% | Permits, terrain/access difficulty, and distance friction. |

The response exposes these sub-scores in `score_breakdown` so the UI can show
why a recommendation ranked well.

## Weather Model

Weather scoring uses:

- cloud cover
- wind speed
- visibility
- precipitation probability

Cloud cover is interpreted by shot type. For example:

- Astrophotography prefers clear sky.
- Portraits can benefit from more diffused cloud cover.
- Landscape and urban scenes can benefit from partial cloud cover during
  golden hour.

## Location Model

OpenStreetMap tags are mapped into planning signals:

- terrain type
- accessibility notes
- accessibility difficulty
- permit or fee warning
- inferred crowd level
- optional real image metadata

These are useful planning signals, not authoritative local guidance. The API
therefore returns caveats with each recommendation.

## Confidence Labels

Each recommendation gets one of:

```text
high, medium, low
```

Confidence is based on the score, weather stability, access detail quality, and
permit friction. A high score with poor metadata or risky weather should not be
presented as confidently as a high score with stable conditions and clear access
signals.

## Caveats

Caveats are a first-class part of the recommendation response. They explain
things such as:

- crowd and access signals are inferred from public tags
- accessibility detail is missing
- no verified place photo was found
- permit or fee requirements may apply
- rain or wind risk is material

The frontend should keep these visible or easily discoverable instead of hiding
them as developer-only metadata.

## Known Limitations

- Weather is fetched for the origin, not once per candidate. This is a deliberate
  tradeoff because candidates are inside a small radius by default.
- Crowd level is inferred from OSM notability tags, not live foot traffic.
- Place imagery depends on public map metadata and may be unavailable.
- Permit and access signals must be verified locally before visiting.

## Good Future Improvements

- Add optional live crowd or popularity signals.
- Add a richer imagery provider behind a provider interface.
- Tune scoring weights with real user feedback.
- Add telemetry around score distribution and empty-search causes.
- Add tests for recommendation ranking edge cases across shot types.

