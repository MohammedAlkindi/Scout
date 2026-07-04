import { formatDistance, formatLightPhase, formatTimeWindow } from "../format.js";
import type { RecommendationItem, RecommendationResponse } from "../types.js";

export interface ResultsHandlers {
  onBack: () => void;
}

function buildCard(item: RecommendationItem): HTMLElement {
  const card = document.createElement("article");
  card.className = `card card--${item.light_phase}`;

  const top = document.createElement("div");
  top.className = "card__top";

  const rank = document.createElement("span");
  rank.className = "card__rank mono";
  rank.textContent = String(item.rank).padStart(2, "0");

  const phasePill = document.createElement("span");
  phasePill.className = "card__phase-pill";
  phasePill.textContent = formatLightPhase(item.light_phase);

  top.append(rank, phasePill);

  const name = document.createElement("h2");
  name.className = "card__name";
  name.textContent = item.location_name;

  const meta = document.createElement("p");
  meta.className = "card__meta";
  meta.textContent = `${item.terrain_type} · ${formatDistance(item.distance_miles)} away`;

  const windowBlock = document.createElement("div");
  const windowLabel = document.createElement("span");
  windowLabel.className = "card__window-label";
  windowLabel.textContent = "Best window";
  const windowValue = document.createElement("div");
  windowValue.className = "card__window";
  windowValue.textContent = formatTimeWindow(item.best_window.start_utc, item.best_window.end_utc);
  windowBlock.append(windowLabel, windowValue);

  const scoreRow = document.createElement("div");
  scoreRow.className = "card__score-row";
  const scoreTrack = document.createElement("div");
  scoreTrack.className = "card__score-track";
  const scoreFill = document.createElement("div");
  scoreFill.className = "card__score-fill";
  scoreFill.style.width = `${Math.max(0, Math.min(100, item.score))}%`;
  scoreTrack.appendChild(scoreFill);
  const scoreValue = document.createElement("span");
  scoreValue.className = "card__score-value mono";
  scoreValue.textContent = `${item.score}/100`;
  scoreRow.append(scoreTrack, scoreValue);

  const summary = document.createElement("p");
  summary.className = "card__summary";
  summary.textContent = item.conditions_summary;

  const advice = document.createElement("p");
  advice.className = "card__advice";
  advice.textContent = item.advice;

  card.append(top, name, meta, windowBlock, scoreRow, summary, advice);

  if (item.permit_required) {
    const permit = document.createElement("p");
    permit.className = "card__permit";
    permit.textContent = item.permit_notes ? `Permit: ${item.permit_notes}` : "A permit may be required here.";
    card.appendChild(permit);
  }

  return card;
}

export function renderResults(root: HTMLElement, response: RecommendationResponse, handlers: ResultsHandlers): void {
  root.textContent = "";

  const screen = document.createElement("div");
  screen.className = "screen";

  const header = document.createElement("div");
  header.className = "results-header";

  const headerText = document.createElement("div");
  const title = document.createElement("h1");
  title.className = "results-header__title";
  title.textContent = "Your light";
  const subtitle = document.createElement("p");
  subtitle.className = "results-header__subtitle";
  subtitle.textContent = `For "${response.intent}"`;
  headerText.append(title, subtitle);

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "link-button";
  backButton.textContent = "New search";
  backButton.addEventListener("click", handlers.onBack);

  header.append(headerText, backButton);
  screen.appendChild(header);

  if (response.recommendations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const message = document.createElement("p");
    message.textContent = "No matches nearby for that. Try a wider radius or a different description.";
    empty.appendChild(message);
    screen.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "card-list";
    for (const item of response.recommendations) {
      list.appendChild(buildCard(item));
    }
    screen.appendChild(list);
  }

  root.appendChild(screen);
}
