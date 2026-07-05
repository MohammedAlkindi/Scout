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

const STARTER_PROMPTS: ReadonlyArray<{ label: string; prompt: string; shotType: ShotType }> = [
  {
    label: "Coastal sunset",
    prompt: "Find a clean coastal sunset angle with foreground texture and low wind.",
    shotType: "landscape",
  },
  {
    label: "Quiet portrait",
    prompt: "Find a quiet portrait location with soft light, shade, and easy access.",
    shotType: "portrait",
  },
  {
    label: "Blue-hour skyline",
    prompt: "Find an urban blue-hour viewpoint with strong lines and visible city lights.",
    shotType: "urban",
  },
  {
    label: "Morning trail",
    prompt: "Find a short morning hike with good visibility and a scenic payoff.",
    shotType: "hiking",
  },
];

function inferInitialShotType(settings: Settings): ShotType | undefined {
  const preferred = settings.activityTypes.find((activity) =>
    SHOT_TYPES.some((shotType) => shotType.value === activity),
  );
  return preferred as ShotType | undefined;
}

function renderStarterWorkspace(
  root: HTMLElement,
  onPickPrompt: (prompt: string, shotType: ShotType) => void,
): void {
  const workspace = document.createElement("section");
  workspace.className = "starter-workspace";

  const eyebrow = document.createElement("p");
  eyebrow.className = "label";
  eyebrow.textContent = "Ready to scout";

  const title = document.createElement("h1");
  title.textContent = "Plan the shot before you leave.";

  const body = document.createElement("p");
  body.textContent =
    "Describe the subject, mood, terrain, or timing you want. Scout ranks nearby places against light, weather, distance, and access.";

  const grid = document.createElement("div");
  grid.className = "starter-grid";

  for (const starter of STARTER_PROMPTS) {
    const button = document.createElement("button");
    button.className = "starter-card";
    button.type = "button";
    button.addEventListener("click", () => {
      onPickPrompt(starter.prompt, starter.shotType);
    });

    const cardLabel = document.createElement("span");
    cardLabel.className = "starter-card__label";
    cardLabel.textContent = starter.label;
    const cardPrompt = document.createElement("span");
    cardPrompt.className = "starter-card__prompt";
    cardPrompt.textContent = starter.prompt;
    button.append(cardLabel, cardPrompt);
    grid.appendChild(button);
  }

  workspace.append(eyebrow, title, body, grid);
  root.appendChild(workspace);
}

export function renderIntentInput(
  root: HTMLElement,
  session: Session,
  settings: Settings,
  handlers: IntentInputHandlers,
): void {
  let selectedShotType = inferInitialShotType(settings);
  let isSubmitting = false;
  const isNewScout = session.results === null;

  const form = document.createElement("form");
  form.className = `composer${isNewScout ? " composer--command" : ""}`;
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
  if (isNewScout) {
    renderStarterWorkspace(root, (prompt, shotType) => {
      selectedShotType = shotType;
      intentInput.value = prompt;
      shotSelect.value = shotType;
      intentInput.focus();
    });
  }
  root.append(form, status);

  function renderSkeleton(): HTMLElement {
    const skeleton = document.createElement("section");
    skeleton.className = "results-skeleton";
    for (let index = 0; index < 3; index += 1) {
      const card = document.createElement("div");
      card.className = "skeleton-card";
      card.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
      skeleton.appendChild(card);
    }
    return skeleton;
  }

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
    const skeleton = renderSkeleton();
    root.appendChild(skeleton);

    handlers
      .onSubmit(intent, selectedShotType)
      .catch((error: unknown) => {
        isSubmitting = false;
        submit.disabled = false;
        skeleton.remove();
        status.className = "status status--error";
        status.textContent =
          error instanceof ApiRequestError
            ? error.message
            : "Could not reach location data. Check your connection and try again.";
      });
  });
}
