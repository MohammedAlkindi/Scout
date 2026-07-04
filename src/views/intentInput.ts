import { ApiRequestError, fetchRecommendation } from "../api.js";
import type { Coordinates, RecommendationRequest, RecommendationResponse, ShotType } from "../types.js";

export interface IntentInputHandlers {
  onResults: (response: RecommendationResponse) => void;
}

const SHOT_TYPE_CHIPS: ReadonlyArray<{ value: ShotType; label: string }> = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "astro", label: "Astro" },
  { value: "wildlife", label: "Wildlife" },
  { value: "urban", label: "Urban" },
  { value: "hiking", label: "Hiking" },
];

export function renderIntentInput(root: HTMLElement, coordinates: Coordinates, handlers: IntentInputHandlers): void {
  root.textContent = "";

  let selectedShotType: ShotType | undefined;
  let isSubmitting = false;

  const screen = document.createElement("div");
  screen.className = "screen";

  const form = document.createElement("form");
  form.className = "intent-form";
  form.noValidate = true;

  const header = document.createElement("div");
  header.className = "intent-form__header";

  const title = document.createElement("h1");
  title.className = "intent-form__title";
  title.textContent = "What are you after?";

  const subtitle = document.createElement("p");
  subtitle.className = "eyebrow mono";
  subtitle.textContent = `USING YOUR LOCATION · ${coordinates.latitude.toFixed(2)}, ${coordinates.longitude.toFixed(2)}`;

  header.append(title, subtitle);

  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "eyebrow";
  label.htmlFor = "intent-text";
  label.textContent = "Describe the shot or activity";

  const textField = document.createElement("input");
  textField.id = "intent-text";
  textField.name = "intent";
  textField.type = "text";
  textField.className = "text-field";
  textField.placeholder = "sunset over the bay, waterfall hike, night sky…";
  textField.autocomplete = "off";

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  chipRow.setAttribute("role", "group");
  chipRow.setAttribute("aria-label", "Shot type (optional)");

  for (const { value, label: chipLabel } of SHOT_TYPE_CHIPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = chipLabel;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      const nowSelected = selectedShotType !== value;
      selectedShotType = nowSelected ? value : undefined;
      for (const otherChip of Array.from(chipRow.children)) {
        otherChip.setAttribute("aria-pressed", String(otherChip === chip && nowSelected));
      }
    });
    chipRow.appendChild(chip);
  }

  fieldGroup.append(label, textField, chipRow);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button button--primary button--full";
  submitButton.textContent = "Find light";

  const status = document.createElement("p");
  status.className = "status-line";
  status.setAttribute("role", "status");

  form.append(header, fieldGroup, submitButton, status);
  screen.appendChild(form);
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
      status.textContent = "Tell Scout what you're after first.";
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
    statusText.textContent = "Reading the sky…";
    status.append(spinner, statusText);

    const request: RecommendationRequest = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      intent,
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
