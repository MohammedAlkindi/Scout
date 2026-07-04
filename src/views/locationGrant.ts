import type { Coordinates } from "../types.js";

export interface LocationGrantHandlers {
  onGranted: (coordinates: Coordinates) => void;
}

function describeGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. You can enter coordinates manually instead.";
    case error.POSITION_UNAVAILABLE:
      return "Scout could not determine your location. Try again or enter coordinates.";
    case error.TIMEOUT:
      return "Location lookup timed out. Try again or enter coordinates.";
    default:
      return "Something went wrong getting your location. Try again or enter coordinates.";
  }
}

function parseCoordinate(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function setStatus(status: HTMLElement, message: string, isError = false): void {
  status.classList.toggle("status-line--error", isError);
  status.textContent = message;
}

export function renderLocationGrant(root: HTMLElement, handlers: LocationGrantHandlers): void {
  root.textContent = "";

  const screen = document.createElement("div");
  screen.className = "screen screen--landing";

  const hero = document.createElement("section");
  hero.className = "landing-hero";
  hero.setAttribute("aria-labelledby", "landing-title");

  const heroCopy = document.createElement("div");
  heroCopy.className = "landing-hero__copy";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Location-aware field planning";

  const title = document.createElement("h1");
  title.id = "landing-title";
  title.className = "wordmark";
  title.textContent = "Scout";

  const tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent =
    "Pick a shooting intent and Scout ranks nearby places by light, weather, access, and timing.";

  const statGrid = document.createElement("div");
  statGrid.className = "landing-stats";
  const stats: ReadonlyArray<readonly [string, string]> = [
    ["3", "ranked spots"],
    ["24h", "forecast window"],
    ["0", "API keys"],
  ];
  for (const [value, label] of stats) {
    const item = document.createElement("div");
    item.className = "landing-stat";
    const statValue = document.createElement("span");
    statValue.className = "landing-stat__value mono";
    statValue.textContent = value;
    const statLabel = document.createElement("span");
    statLabel.className = "landing-stat__label";
    statLabel.textContent = label;
    item.append(statValue, statLabel);
    statGrid.appendChild(item);
  }

  heroCopy.append(eyebrow, title, tagline, statGrid);

  const panel = document.createElement("div");
  panel.className = "location-panel";

  const panelTitle = document.createElement("h2");
  panelTitle.className = "panel-title";
  panelTitle.textContent = "Start from a position";

  const panelText = document.createElement("p");
  panelText.className = "panel-copy";
  panelText.textContent = "Use browser location for the fastest path, or enter coordinates for another area.";

  const locateButton = document.createElement("button");
  locateButton.type = "button";
  locateButton.className = "button button--primary button--full";
  locateButton.textContent = "Use my location";

  const divider = document.createElement("div");
  divider.className = "divider";
  divider.textContent = "or";

  const manualForm = document.createElement("form");
  manualForm.className = "manual-location";
  manualForm.noValidate = true;

  const coordGrid = document.createElement("div");
  coordGrid.className = "coord-grid";

  const latLabel = document.createElement("label");
  latLabel.className = "field-group";
  const latText = document.createElement("span");
  latText.className = "eyebrow";
  latText.textContent = "Latitude";
  const latInput = document.createElement("input");
  latInput.className = "text-field";
  latInput.name = "latitude";
  latInput.inputMode = "decimal";
  latInput.placeholder = "37.77";
  latLabel.append(latText, latInput);

  const lngLabel = document.createElement("label");
  lngLabel.className = "field-group";
  const lngText = document.createElement("span");
  lngText.className = "eyebrow";
  lngText.textContent = "Longitude";
  const lngInput = document.createElement("input");
  lngInput.className = "text-field";
  lngInput.name = "longitude";
  lngInput.inputMode = "decimal";
  lngInput.placeholder = "-122.42";
  lngLabel.append(lngText, lngInput);

  coordGrid.append(latLabel, lngLabel);

  const manualButton = document.createElement("button");
  manualButton.type = "submit";
  manualButton.className = "button button--secondary button--full";
  manualButton.textContent = "Continue with coordinates";

  const status = document.createElement("p");
  status.className = "status-line";
  status.setAttribute("role", "status");

  manualForm.append(coordGrid, manualButton);
  panel.append(panelTitle, panelText, locateButton, divider, manualForm, status);
  hero.append(heroCopy, panel);

  const workflow = document.createElement("section");
  workflow.className = "workflow-strip";
  workflow.setAttribute("aria-label", "Scout workflow");
  const workflowSteps: ReadonlyArray<readonly [string, string]> = [
    ["Locate", "Start from your position or a destination coordinate."],
    ["Describe", "Tell Scout the shot, terrain, or activity you want."],
    ["Decide", "Compare ranked windows with conditions and map links."],
  ];
  for (const [label, body] of workflowSteps) {
    const step = document.createElement("div");
    step.className = "workflow-step";
    const stepLabel = document.createElement("h2");
    stepLabel.className = "workflow-step__label";
    stepLabel.textContent = label;
    const stepBody = document.createElement("p");
    stepBody.className = "workflow-step__body";
    stepBody.textContent = body;
    step.append(stepLabel, stepBody);
    workflow.appendChild(step);
  }

  screen.append(hero, workflow);
  root.appendChild(screen);

  if (!("geolocation" in navigator)) {
    locateButton.disabled = true;
    setStatus(status, "This browser does not support location access. Enter coordinates instead.", true);
  }

  locateButton.addEventListener("click", () => {
    locateButton.disabled = true;
    setStatus(status, "Locating...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlers.onGranted({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        locateButton.disabled = false;
        setStatus(status, describeGeolocationError(error), true);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });

  manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const latitude = parseCoordinate(latInput.value);
    const longitude = parseCoordinate(lngInput.value);

    if (latitude === null || latitude < -90 || latitude > 90) {
      setStatus(status, "Enter a latitude between -90 and 90.", true);
      latInput.focus();
      return;
    }

    if (longitude === null || longitude < -180 || longitude > 180) {
      setStatus(status, "Enter a longitude between -180 and 180.", true);
      lngInput.focus();
      return;
    }

    handlers.onGranted({ latitude, longitude });
  });
}
