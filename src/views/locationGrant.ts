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

export function renderLocationGrant(root: HTMLElement, handlers: LocationGrantHandlers): void {
  const section = document.createElement("section");
  section.className = "location-state";

  const title = document.createElement("h1");
  title.textContent = "Start a scout from your location.";

  const body = document.createElement("p");
  body.textContent =
    "Use browser location or enter coordinates. Then describe what you want to shoot or do.";

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

  const locate = document.createElement("button");
  locate.type = "button";
  locate.className = "button button--primary";
  locate.textContent = "Use my location";

  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");

  section.append(title, body, locate, actions, status);
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
