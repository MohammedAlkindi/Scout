import { ApiRequestError, fetchRecommendation } from "../api.js";
import type { Coordinates, RecommendationRequest, RecommendationResponse, ShotType } from "../types.js";

export interface IntentInputHandlers {
  onResults: (response: RecommendationResponse) => void;
}

const SHOT_TYPE_CHIPS: ReadonlyArray<{ value: ShotType; label: string; hint: string }> = [
  { value: "landscape", label: "Landscape", hint: "color and distance" },
  { value: "portrait", label: "Portrait", hint: "soft, flattering light" },
  { value: "astro", label: "Astro", hint: "clear, dark skies" },
  { value: "wildlife", label: "Wildlife", hint: "quiet conditions" },
  { value: "urban", label: "Urban", hint: "streets and skyline" },
  { value: "hiking", label: "Hiking", hint: "access and comfort" },
];

const RADIUS_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 5, label: "5 mi" },
  { value: 15, label: "15 mi" },
  { value: 30, label: "30 mi" },
];

const EXAMPLES = [
  "sunset landscape viewpoint",
  "waterfall long exposure",
  "quiet morning hike",
  "blue hour skyline",
];

function setPressed(container: HTMLElement, selected: HTMLElement | null): void {
  for (const element of Array.from(container.children)) {
    element.setAttribute("aria-pressed", String(element === selected));
  }
}

export function renderIntentInput(root: HTMLElement, coordinates: Coordinates, handlers: IntentInputHandlers): void {
  root.textContent = "";

  let selectedShotType: ShotType | undefined;
  let selectedRadius = 15;
  let isSubmitting = false;

  const screen = document.createElement("div");
  screen.className = "screen screen--wide";

  const shell = document.createElement("div");
  shell.className = "planner-shell";

  const intro = document.createElement("aside");
  intro.className = "planner-intro";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Scout planner";

  const title = document.createElement("h1");
  title.className = "planner-title";
  title.textContent = "What are you trying to find?";

  const subtitle = document.createElement("p");
  subtitle.className = "planner-copy";
  subtitle.textContent =
    "Describe the scene or activity. Scout will find nearby candidates, score the next light windows, and return the best few options.";

  const locationBadge = document.createElement("div");
  locationBadge.className = "location-badge";
  const locationLabel = document.createElement("span");
  locationLabel.className = "eyebrow";
  locationLabel.textContent = "Origin";
  const locationValue = document.createElement("span");
  locationValue.className = "mono";
  locationValue.textContent = `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
  locationBadge.append(locationLabel, locationValue);

  const exampleList = document.createElement("div");
  exampleList.className = "example-list";
  const exampleLabel = document.createElement("p");
  exampleLabel.className = "eyebrow";
  exampleLabel.textContent = "Try";
  exampleList.appendChild(exampleLabel);

  intro.append(eyebrow, title, subtitle, locationBadge, exampleList);

  const form = document.createElement("form");
  form.className = "planner-form";
  form.noValidate = true;

  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "eyebrow";
  label.htmlFor = "intent-text";
  label.textContent = "Shot or activity";

  const textField = document.createElement("textarea");
  textField.id = "intent-text";
  textField.name = "intent";
  textField.className = "text-field text-area";
  textField.placeholder = "sunset over the bay, waterfall hike, night sky";
  textField.autocomplete = "off";
  textField.rows = 4;

  fieldGroup.append(label, textField);

  const examples = document.createElement("div");
  examples.className = "chip-row";
  for (const example of EXAMPLES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip--quiet";
    chip.textContent = example;
    chip.addEventListener("click", () => {
      textField.value = example;
      textField.focus();
    });
    examples.appendChild(chip);
  }
  exampleList.appendChild(examples);

  const shotGroup = document.createElement("section");
  shotGroup.className = "option-section";
  const shotHeader = document.createElement("div");
  shotHeader.className = "option-section__header";
  const shotTitle = document.createElement("h2");
  shotTitle.className = "option-section__title";
  shotTitle.textContent = "Optimize for";
  const shotHelp = document.createElement("p");
  shotHelp.className = "option-section__hint";
  shotHelp.textContent = "Optional. Scout can infer this from your description.";
  shotHeader.append(shotTitle, shotHelp);

  const chipRow = document.createElement("div");
  chipRow.className = "choice-grid";
  chipRow.setAttribute("role", "group");
  chipRow.setAttribute("aria-label", "Shot type");

  for (const { value, label: chipLabel, hint } of SHOT_TYPE_CHIPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "choice-card";
    chip.setAttribute("aria-pressed", "false");
    const chipName = document.createElement("span");
    chipName.className = "choice-card__label";
    chipName.textContent = chipLabel;
    const chipHint = document.createElement("span");
    chipHint.className = "choice-card__hint";
    chipHint.textContent = hint;
    chip.append(chipName, chipHint);
    chip.addEventListener("click", () => {
      const nowSelected = selectedShotType !== value;
      selectedShotType = nowSelected ? value : undefined;
      setPressed(chipRow, nowSelected ? chip : null);
    });
    chipRow.appendChild(chip);
  }
  shotGroup.append(shotHeader, chipRow);

  const radiusGroup = document.createElement("section");
  radiusGroup.className = "option-section";
  const radiusTitle = document.createElement("h2");
  radiusTitle.className = "option-section__title";
  radiusTitle.textContent = "Search radius";

  const radiusRow = document.createElement("div");
  radiusRow.className = "segmented-control";
  radiusRow.setAttribute("role", "group");
  radiusRow.setAttribute("aria-label", "Search radius");
  for (const option of RADIUS_OPTIONS) {
    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = "segment";
    segment.textContent = option.label;
    segment.setAttribute("aria-pressed", String(option.value === selectedRadius));
    segment.addEventListener("click", () => {
      selectedRadius = option.value;
      setPressed(radiusRow, segment);
    });
    radiusRow.appendChild(segment);
  }
  radiusGroup.append(radiusTitle, radiusRow);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button button--primary button--full";
  submitButton.textContent = "Find recommendations";

  const status = document.createElement("p");
  status.className = "status-line";
  status.setAttribute("role", "status");

  form.append(fieldGroup, shotGroup, radiusGroup, submitButton, status);
  shell.append(intro, form);
  screen.appendChild(shell);
  root.appendChild(screen);

  textField.focus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const intent = textField.value.trim();
    if (!intent) {
      status.classList.add("status-line--error");
      status.textContent = "Tell Scout what you are after first.";
      textField.focus();
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    status.classList.remove("status-line--error");
    status.replaceChildren();
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    const statusText = document.createElement("span");
    statusText.textContent = "Checking light, weather, and nearby places...";
    status.append(spinner, statusText);

    const request: RecommendationRequest = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      intent,
      radius_miles: selectedRadius,
    };
    if (selectedShotType !== undefined) {
      request.shot_type = selectedShotType;
    }

    fetchRecommendation(request)
      .then((response) => {
        handlers.onResults(response);
      })
      .catch((error: unknown) => {
        isSubmitting = false;
        submitButton.disabled = false;
        status.classList.add("status-line--error");
        const message = error instanceof ApiRequestError ? error.message : "Something went wrong. Try again.";
        status.replaceChildren(document.createTextNode(message));
      });
  });
}
