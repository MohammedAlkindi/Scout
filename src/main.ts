import type { AppView, Coordinates, RecommendationResponse } from "./types.js";
import { renderLocationGrant } from "./views/locationGrant.js";
import { renderIntentInput } from "./views/intentInput.js";
import { renderResults } from "./views/results.js";

function getAppRoot(): HTMLElement {
  const root = document.getElementById("app");
  if (root === null) {
    throw new Error("Missing #app root element");
  }
  return root;
}

function renderView(root: HTMLElement, view: AppView): void {
  switch (view.kind) {
    case "location-grant":
      renderLocationGrant(root, {
        onGranted: (coordinates: Coordinates) => {
          renderView(root, { kind: "intent-input", coordinates });
        },
      });
      return;

    case "intent-input":
      renderIntentInput(root, view.coordinates, {
        onResults: (response: RecommendationResponse) => {
          renderView(root, { kind: "results", coordinates: view.coordinates, response });
        },
      });
      return;

    case "results":
      renderResults(root, view.response, {
        onBack: () => {
          renderView(root, { kind: "intent-input", coordinates: view.coordinates });
        },
      });
      return;
  }
}

function main(): void {
  const root = getAppRoot();
  renderView(root, { kind: "location-grant" });
}

main();
