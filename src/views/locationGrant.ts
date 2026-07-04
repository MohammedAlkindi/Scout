import type { Coordinates } from "../types.js";

export interface LocationGrantHandlers {
  onGranted: (coordinates: Coordinates) => void;
}

function describeGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Allow it in your browser's site settings, then try again.";
    case error.POSITION_UNAVAILABLE:
      return "Couldn't determine your location. Try again.";
    case error.TIMEOUT:
      return "That took too long. Try again.";
    default:
      return "Something went wrong getting your location. Try again.";
  }
}

export function renderLocationGrant(root: HTMLElement, handlers: LocationGrantHandlers): void {
  root.textContent = "";

  const screen = document.createElement("div");
  screen.className = "screen screen--centered";

  const icon = document.createElement("div");
  icon.className = "grant-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "◎";

  const wordmark = document.createElement("h1");
  wordmark.className = "wordmark";
  wordmark.textContent = "Scout";

  const tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent = "Point Scout at where you are, and it reasons over real light and weather to tell you where to go and when.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--primary button--full";
  button.textContent = "Use my location";

  const status = document.createElement("p");
  status.className = "status-line";
  status.setAttribute("role", "status");

  screen.append(icon, wordmark, tagline, button, status);
  root.appendChild(screen);

  if (!("geolocation" in navigator)) {
    status.classList.add("status-line--error");
    status.textContent = "This browser doesn't support location access.";
    button.disabled = true;
    return;
  }

  button.addEventListener("click", () => {
    button.disabled = true;
    status.classList.remove("status-line--error");
    status.textContent = "Locating…";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlers.onGranted({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        button.disabled = false;
        status.classList.add("status-line--error");
        status.textContent = describeGeolocationError(error);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
