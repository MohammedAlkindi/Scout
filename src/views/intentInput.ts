import { ApiRequestError } from "../api.js";
import type { Session, Settings, ShotType } from "../types.js";

export interface IntentInputHandlers {
  onSubmit: (intent: string, shotType: ShotType | undefined) => Promise<void>;
}

const SHOT_TYPES: ReadonlyArray<{ value: ShotType; label: string }> = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "astro", label: "Astro" },
  { value: "wildlife", label: "Wildlife" },
  { value: "urban", label: "Urban" },
  { value: "hiking", label: "Hiking" },
];

function inferInitialShotType(settings: Settings): ShotType | undefined {
  const preferred = settings.activityTypes.find((activity) =>
    SHOT_TYPES.some((shotType) => shotType.value === activity),
  );
  return preferred as ShotType | undefined;
}

export function renderIntentInput(
  root: HTMLElement,
  session: Session,
  settings: Settings,
  handlers: IntentInputHandlers,
): void {
  let selectedShotType = inferInitialShotType(settings);
  let isSubmitting = false;

  const form = document.createElement("form");
  form.className = "composer";
  form.noValidate = true;

  const fields = document.createElement("div");
  fields.className = "composer__fields";

  const locationField = document.createElement("label");
  locationField.className = "field";
  const locationLabel = document.createElement("span");
  locationLabel.className = "label";
  locationLabel.textContent = "Location";
  const locationInput = document.createElement("input");
  locationInput.className = "input data";
  locationInput.value = session.location.label;
  locationInput.readOnly = true;
  locationField.append(locationLabel, locationInput);

  const intentField = document.createElement("label");
  intentField.className = "field";
  const intentLabel = document.createElement("span");
  intentLabel.className = "label";
  intentLabel.textContent = "Intent";
  const intentInput = document.createElement("textarea");
  intentInput.className = "textarea";
  intentInput.placeholder = "Describe what you want to shoot or do.";
  intentInput.value = session.intent;
  intentInput.rows = 2;
  intentField.append(intentLabel, intentInput);

  fields.append(locationField, intentField);

  const controls = document.createElement("div");
  controls.className = "field";

  const shotLabel = document.createElement("span");
  shotLabel.className = "label";
  shotLabel.textContent = "Activity";
  const shotSelect = document.createElement("select");
  shotSelect.className = "select";
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto";
  shotSelect.appendChild(autoOption);
  for (const shotType of SHOT_TYPES) {
    const option = document.createElement("option");
    option.value = shotType.value;
    option.textContent = shotType.label;
    option.selected = shotType.value === selectedShotType;
    shotSelect.appendChild(option);
  }
  shotSelect.addEventListener("change", () => {
    selectedShotType = shotSelect.value === "" ? undefined : (shotSelect.value as ShotType);
  });

  const submit = document.createElement("button");
  submit.className = "button button--primary";
  submit.type = "submit";
  submit.textContent = "Scout";

  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");

  controls.append(shotLabel, shotSelect, submit);
  form.append(fields, controls);
  root.append(form, status);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const intent = intentInput.value.trim();
    if (!intent) {
      status.className = "status status--error";
      status.textContent = "Describe what you want to shoot or do. Scout will find the right place and time.";
      intentInput.focus();
      return;
    }

    isSubmitting = true;
    submit.disabled = true;
    status.className = "status";
    status.textContent = "Checking location data, light, and weather.";

    handlers
      .onSubmit(intent, selectedShotType)
      .catch((error: unknown) => {
        isSubmitting = false;
        submit.disabled = false;
        status.className = "status status--error";
        status.textContent =
          error instanceof ApiRequestError
            ? error.message
            : "Could not reach location data. Check your connection and try again.";
      });
  });
}
