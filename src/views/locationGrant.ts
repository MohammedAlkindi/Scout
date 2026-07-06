import type { Coordinates } from "../types.js";

export interface LocationGrantHandlers {
  onGranted: (coordinates: Coordinates) => void;
}

interface DestinationOption {
  kind: "City" | "Country" | "Place";
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  description: string;
  tags: readonly string[];
  featured: boolean;
}

const DESTINATIONS: ReadonlyArray<DestinationOption> = [
  {
    kind: "City",
    name: "Muscat",
    region: "Oman",
    latitude: 23.5793,
    longitude: 58.4025,
    description: "Coast, mountains, and sunset-friendly waterfronts.",
    tags: ["oman", "coast", "sunset", "middle east"],
    featured: true,
  },
  {
    kind: "City",
    name: "Dubai",
    region: "United Arab Emirates",
    latitude: 25.2048,
    longitude: 55.2708,
    description: "Skyline, beach, architecture, and desert edges.",
    tags: ["uae", "emirates", "skyline", "beach", "architecture"],
    featured: true,
  },
  {
    kind: "City",
    name: "Salalah",
    region: "Oman",
    latitude: 17.0194,
    longitude: 54.0897,
    description: "Cliffs, monsoon greenery, beaches, and viewpoints.",
    tags: ["oman", "khareef", "cliffs", "beach", "green"],
    featured: true,
  },
  {
    kind: "City",
    name: "Doha",
    region: "Qatar",
    latitude: 25.2854,
    longitude: 51.531,
    description: "Corniche, architecture, museums, and coastal light.",
    tags: ["qatar", "corniche", "architecture", "coast"],
    featured: true,
  },
  {
    kind: "City",
    name: "London",
    region: "United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    description: "Street, architecture, parks, and river viewpoints.",
    tags: ["uk", "england", "street", "architecture", "river"],
    featured: false,
  },
  {
    kind: "City",
    name: "Tokyo",
    region: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    description: "Urban layers, night scenes, parks, and skyline views.",
    tags: ["japan", "urban", "night", "street", "skyline"],
    featured: false,
  },
  {
    kind: "Country",
    name: "Oman",
    region: "Muscat anchor",
    latitude: 23.5793,
    longitude: 58.4025,
    description: "Start from Muscat for coast, mountain, and old-town scouting.",
    tags: ["country", "oman", "muscat", "coast", "mountain"],
    featured: false,
  },
  {
    kind: "Country",
    name: "United Arab Emirates",
    region: "Dubai anchor",
    latitude: 25.2048,
    longitude: 55.2708,
    description: "Start from Dubai for urban, coastal, and desert scouting.",
    tags: ["country", "uae", "emirates", "dubai", "desert"],
    featured: false,
  },
  {
    kind: "Country",
    name: "Japan",
    region: "Tokyo anchor",
    latitude: 35.6762,
    longitude: 139.6503,
    description: "Start from Tokyo for urban, park, and night-sky day trips.",
    tags: ["country", "japan", "tokyo", "urban", "mountain"],
    featured: false,
  },
  {
    kind: "Country",
    name: "South Africa",
    region: "Cape Town anchor",
    latitude: -33.9249,
    longitude: 18.4241,
    description: "Start from Cape Town for coast, mountain, and wildlife routes.",
    tags: ["country", "south africa", "cape town", "coast", "mountain"],
    featured: false,
  },
  {
    kind: "Place",
    name: "Yosemite Valley",
    region: "California, United States",
    latitude: 37.8651,
    longitude: -119.5383,
    description: "Granite walls, waterfalls, forest, and classic viewpoints.",
    tags: ["usa", "california", "national park", "waterfall", "landscape"],
    featured: false,
  },
  {
    kind: "Place",
    name: "Lake Louise",
    region: "Alberta, Canada",
    latitude: 51.4254,
    longitude: -116.1773,
    description: "Alpine lake, mountain light, trails, and winter scenes.",
    tags: ["canada", "banff", "lake", "mountain", "hiking"],
    featured: false,
  },
  {
    kind: "Place",
    name: "Oia",
    region: "Santorini, Greece",
    latitude: 36.4618,
    longitude: 25.3763,
    description: "Caldera views, blue hour, architecture, and sunset lanes.",
    tags: ["greece", "santorini", "sunset", "architecture", "coast"],
    featured: false,
  },
];

function describeGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Enter coordinates or allow location access in browser settings.";
    case error.POSITION_UNAVAILABLE:
      return "Could not reach location data. Check your connection and try again.";
    case error.TIMEOUT:
      return "Location lookup timed out. Check your connection and try again.";
    default:
      return "Could not reach location data. Check your connection and try again.";
  }
}

function parseCoordinate(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function createMetric(label: string, value: string): HTMLElement {
  const metric = document.createElement("div");
  metric.className = "onboarding-metric";
  const metricValue = document.createElement("span");
  metricValue.className = "onboarding-metric__value data";
  metricValue.textContent = value;
  const metricLabel = document.createElement("span");
  metricLabel.className = "onboarding-metric__label";
  metricLabel.textContent = label;
  metric.append(metricValue, metricLabel);
  return metric;
}

function destinationLabel(destination: DestinationOption): string {
  return `${destination.name}, ${destination.region}`;
}

function matchesDestination(destination: DestinationOption, query: string): boolean {
  if (!query) {
    return destination.featured;
  }
  const haystack = [
    destination.kind,
    destination.name,
    destination.region,
    destination.description,
    ...destination.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function destinationMatchRank(destination: DestinationOption, query: string): number {
  if (!query) {
    return destination.featured ? 0 : 1;
  }
  const name = destination.name.toLowerCase();
  const region = destination.region.toLowerCase();
  if (name === query) {
    return 0;
  }
  if (name.startsWith(query)) {
    return 1;
  }
  if (region === query || region.startsWith(query)) {
    return 2;
  }
  return 3;
}

export function renderLocationGrant(root: HTMLElement, handlers: LocationGrantHandlers): void {
  const section = document.createElement("section");
  section.className = "location-state";

  const brand = document.createElement("div");
  brand.className = "location-state__brand";
  const brandTitle = document.createElement("h1");
  brandTitle.textContent = "Scout";
  const brandCopy = document.createElement("p");
  brandCopy.textContent = "Plan outdoor shots from real light, weather, and place data.";
  brand.append(brandTitle, brandCopy);

  const intro = document.createElement("div");
  intro.className = "location-state__intro";

  const eyebrow = document.createElement("p");
  eyebrow.className = "label";
  eyebrow.textContent = "New scout";

  const title = document.createElement("h1");
  title.textContent = "Start with a precise field position.";

  const body = document.createElement("p");
  body.textContent =
    "Scout uses your origin to evaluate nearby places against light windows, weather, distance, and access friction.";

  const metrics = document.createElement("div");
  metrics.className = "onboarding-metrics";
  metrics.append(
    createMetric("Recommendations", "3"),
    createMetric("Forecast", "24h"),
    createMetric("Session store", "local"),
  );

  intro.append(eyebrow, title, body, metrics);

  const panel = document.createElement("div");
  panel.className = "location-panel";

  const panelHeader = document.createElement("div");
  panelHeader.className = "location-panel__header";
  const panelTitle = document.createElement("h2");
  panelTitle.textContent = "Choose origin";
  const panelCopy = document.createElement("p");
  panelCopy.textContent = "Pick a destination anchor, use browser location, or enter exact coordinates.";
  panelHeader.append(panelTitle, panelCopy);

  let selectedDestination: DestinationOption = DESTINATIONS[0] ?? {
    kind: "City",
    name: "Muscat",
    region: "Oman",
    latitude: 23.5793,
    longitude: 58.4025,
    description: "Coast, mountains, and sunset-friendly waterfronts.",
    tags: ["oman"],
    featured: true,
  };

  const destinationPicker = document.createElement("div");
  destinationPicker.className = "destination-picker";
  const destinationField = document.createElement("label");
  destinationField.className = "field";
  const destinationLabelText = document.createElement("span");
  destinationLabelText.className = "label";
  destinationLabelText.textContent = "Destination";
  const destinationSearch = document.createElement("input");
  destinationSearch.className = "input destination-picker__search";
  destinationSearch.type = "search";
  destinationSearch.placeholder = "Search cities, countries, places";
  destinationSearch.autocomplete = "off";
  destinationField.append(destinationLabelText, destinationSearch);

  const destinationGrid = document.createElement("div");
  destinationGrid.className = "destination-grid";
  destinationGrid.setAttribute("role", "list");

  const destinationSummary = document.createElement("p");
  destinationSummary.className = "destination-summary";

  const useDestination = document.createElement("button");
  useDestination.type = "button";
  useDestination.className = "button button--primary";

  function selectDestination(destination: DestinationOption): void {
    selectedDestination = destination;
    renderDestinations();
  }

  function renderDestinations(): void {
    const query = destinationSearch.value.trim().toLowerCase();
    const matches = DESTINATIONS.filter((destination) => matchesDestination(destination, query)).sort(
      (left, right) => destinationMatchRank(left, query) - destinationMatchRank(right, query),
    );
    if (query && !matches.includes(selectedDestination)) {
      selectedDestination = matches[0] ?? selectedDestination;
    }
    destinationGrid.textContent = "";

    for (const destination of matches) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `destination-card${
        destination === selectedDestination ? " destination-card--selected" : ""
      }`;
      option.setAttribute("aria-pressed", String(destination === selectedDestination));
      option.setAttribute("aria-label", `${destinationLabel(destination)} ${destination.kind}`);

      const kind = document.createElement("span");
      kind.className = "destination-card__kind";
      kind.textContent = destination.kind;
      const name = document.createElement("span");
      name.className = "destination-card__name";
      name.textContent = destination.name;
      const meta = document.createElement("span");
      meta.className = "destination-card__meta";
      meta.textContent = destination.region;
      const description = document.createElement("span");
      description.className = "destination-card__description";
      description.textContent = destination.description;
      option.append(kind, name, meta, description);
      option.addEventListener("click", () => selectDestination(destination));
      destinationGrid.appendChild(option);
    }

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "destination-picker__empty";
      empty.textContent = "No destination match. Try Muscat, Dubai, Oman, Japan, Yosemite, or lake.";
      destinationGrid.appendChild(empty);
    }

    destinationSummary.textContent = `${destinationLabel(selectedDestination)} / ${selectedDestination.latitude.toFixed(
      4,
    )}, ${selectedDestination.longitude.toFixed(4)}`;
    useDestination.textContent = `Scout ${selectedDestination.name}`;
  }

  destinationSearch.addEventListener("input", renderDestinations);
  useDestination.addEventListener("click", () => {
    handlers.onGranted({
      latitude: selectedDestination.latitude,
      longitude: selectedDestination.longitude,
      label: destinationLabel(selectedDestination),
    });
  });
  destinationPicker.append(destinationField, destinationGrid, destinationSummary, useDestination);
  renderDestinations();

  const quickActions = document.createElement("div");
  quickActions.className = "location-quick-actions";

  const locate = document.createElement("button");
  locate.type = "button";
  locate.className = "button";
  locate.textContent = "Use my location";
  quickActions.appendChild(locate);

  const divider = document.createElement("div");
  divider.className = "form-divider";
  divider.textContent = "Exact coordinate";

  const actions = document.createElement("form");
  actions.className = "location-actions";
  actions.noValidate = true;

  const latField = document.createElement("label");
  latField.className = "field";
  const latLabel = document.createElement("span");
  latLabel.className = "label";
  latLabel.textContent = "Latitude";
  const latInput = document.createElement("input");
  latInput.className = "input data";
  latInput.inputMode = "decimal";
  latInput.placeholder = "37.7749";
  latField.append(latLabel, latInput);

  const lngField = document.createElement("label");
  lngField.className = "field";
  const lngLabel = document.createElement("span");
  lngLabel.className = "label";
  lngLabel.textContent = "Longitude";
  const lngInput = document.createElement("input");
  lngInput.className = "input data";
  lngInput.inputMode = "decimal";
  lngInput.placeholder = "-122.4194";
  lngField.append(lngLabel, lngInput);

  const manual = document.createElement("button");
  manual.type = "submit";
  manual.className = "button";
  manual.textContent = "Use coordinates";

  actions.append(latField, lngField, manual);

  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");

  panel.append(panelHeader, destinationPicker, quickActions, divider, actions, status);
  section.append(brand, intro, panel);
  root.appendChild(section);

  if (!("geolocation" in navigator)) {
    locate.disabled = true;
    status.className = "status status--error";
    status.textContent = "This browser cannot access location. Enter coordinates to continue.";
  }

  locate.addEventListener("click", () => {
    locate.disabled = true;
    status.className = "status";
    status.textContent = "Reading browser location.";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlers.onGranted({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "Current location",
        });
      },
      (error) => {
        locate.disabled = false;
        status.className = "status status--error";
        status.textContent = describeGeolocationError(error);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });

  actions.addEventListener("submit", (event) => {
    event.preventDefault();
    const latitude = parseCoordinate(latInput.value);
    const longitude = parseCoordinate(lngInput.value);

    if (latitude === null || latitude < -90 || latitude > 90) {
      status.className = "status status--error";
      status.textContent = "Latitude must be between -90 and 90.";
      latInput.focus();
      return;
    }

    if (longitude === null || longitude < -180 || longitude > 180) {
      status.className = "status status--error";
      status.textContent = "Longitude must be between -180 and 180.";
      lngInput.focus();
      return;
    }

    handlers.onGranted({ latitude, longitude });
  });
}
