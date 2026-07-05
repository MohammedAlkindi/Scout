import { formatLightPhase } from "../format.js";
import type { RecommendationItem, RecommendationResponse, Settings } from "../types.js";

const timeFormatters: Record<Settings["timeFormat"], Intl.DateTimeFormat> = {
  "12h": new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
  "24h": new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
};

function formatTimeWindow(startUtc: string, endUtc: string, settings: Settings): string {
  const formatter = timeFormatters[settings.timeFormat];
  return `${formatter.format(new Date(startUtc))} - ${formatter.format(new Date(endUtc))}`;
}

function formatDistance(miles: number, settings: Settings): string {
  if (settings.units === "metric") {
    return `${(miles * 1.609344).toFixed(1)} km`;
  }
  return `${miles.toFixed(1)} mi`;
}

function scoreClass(score: number): string {
  if (score >= 75) {
    return "result-card__score result-card__score--high";
  }
  if (score >= 50) {
    return "result-card__score result-card__score--mid";
  }
  return "result-card__score result-card__score--low";
}

function tile(label: string, value: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "data-tile";
  const tileLabel = document.createElement("span");
  tileLabel.className = "data-tile__label";
  tileLabel.textContent = label;
  const tileValue = document.createElement("span");
  tileValue.className = "data-tile__value";
  tileValue.textContent = value;
  element.append(tileLabel, tileValue);
  return element;
}

function buildCard(item: RecommendationItem, index: number, settings: Settings): HTMLElement {
  const card = document.createElement("article");
  card.className = `result-card result-card--${item.light_phase}`;
  card.style.setProperty("--stagger-index", String(index));

  const top = document.createElement("div");
  top.className = "result-card__top";

  const titleBlock = document.createElement("div");
  const name = document.createElement("h2");
  name.className = "result-card__name";
  name.textContent = item.location_name;
  const meta = document.createElement("p");
  meta.className = "result-card__meta";
  meta.textContent = `${item.terrain_type} / ${formatLightPhase(item.light_phase)}`;
  titleBlock.append(name, meta);

  const score = document.createElement("div");
  score.className = scoreClass(item.score);
  score.textContent = `${item.score}`;

  top.append(titleBlock, score);

  const grid = document.createElement("div");
  grid.className = "result-card__grid";
  grid.append(
    tile("Best window", formatTimeWindow(item.best_window.start_utc, item.best_window.end_utc, settings)),
    tile("Distance", formatDistance(item.distance_miles, settings)),
    tile("Score", `${item.score}/100`),
  );

  const summary = document.createElement("p");
  summary.className = "result-card__summary";
  summary.textContent = item.conditions_summary;

  const advice = document.createElement("p");
  advice.textContent = item.advice;

  card.append(top, grid, summary, advice);

  if (item.permit_required) {
    const permit = document.createElement("p");
    permit.className = "result-card__summary";
    permit.textContent = item.permit_notes ?? "A permit may be required here.";
    card.appendChild(permit);
  }

  return card;
}

export function renderResults(root: HTMLElement, response: RecommendationResponse, settings: Settings): void {
  const list = document.createElement("section");
  list.className = "results-list";
  list.setAttribute("aria-label", "Scout recommendations");

  for (const [index, item] of response.recommendations.entries()) {
    list.appendChild(buildCard(item, index, settings));
  }

  root.appendChild(list);
}
