import type { Coordinates } from "../types.js";

export interface LocationGrantHandlers {
  onGranted: (coordinates: Coordinates) => void;
}

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
  panelTitle.textContent = "Set origin";
  const panelCopy = document.createElement("p");
  panelCopy.textContent = "Use browser location for your current position, or enter a destination coordinate.";
  panelHeader.append(panelTitle, panelCopy);

  const locate = document.createElement("button");
  locate.type = "button";
  locate.className = "button button--primary";
  locate.textContent = "Use my location";

  const divider = document.createElement("div");
  divider.className = "form-divider";
  divider.textContent = "Manual coordinate";

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

  panel.append(panelHeader, locate, divider, actions, status);
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
