import { formatDistance, formatLightPhase, formatTimeWindow } from "../format.js";
import type { RecommendationItem, RecommendationResponse } from "../types.js";

export interface ResultsHandlers {
  onBack: () => void;
}

function buildMapUrl(item: RecommendationItem): string {
  const lat = encodeURIComponent(String(item.latitude));
  const lng = encodeURIComponent(String(item.longitude));
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

function buildMetric(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "metric";
  const metricValue = document.createElement("span");
  metricValue.className = "metric__value mono";
  metricValue.textContent = value;
  const metricLabel = document.createElement("span");
  metricLabel.className = "metric__label";
  metricLabel.textContent = label;
  item.append(metricValue, metricLabel);
  return item;
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

  const nameRow = document.createElement("div");
  nameRow.className = "card__name-row";
  const name = document.createElement("h2");
  name.className = "card__name";
  name.textContent = item.location_name;
  const scoreBadge = document.createElement("span");
  scoreBadge.className = "score-badge mono";
  scoreBadge.textContent = `${item.score}`;
  nameRow.append(name, scoreBadge);

  const meta = document.createElement("p");
  meta.className = "card__meta";
  meta.textContent = `${item.terrain_type} / ${formatDistance(item.distance_miles)} away`;

  const windowBlock = document.createElement("div");
  windowBlock.className = "time-block";
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

  const actions = document.createElement("div");
  actions.className = "card__actions";
  const mapLink = document.createElement("a");
  mapLink.className = "button button--secondary button--compact";
  mapLink.href = buildMapUrl(item);
  mapLink.target = "_blank";
  mapLink.rel = "noreferrer";
  mapLink.textContent = "Open map";
  actions.appendChild(mapLink);

  card.append(top, nameRow, meta, windowBlock, scoreRow, summary, advice, actions);

  if (item.permit_required) {
    const permit = document.createElement("p");
    permit.className = "card__permit";
    permit.textContent = item.permit_notes ? `Permit: ${item.permit_notes}` : "A permit may be required here.";
    card.appendChild(permit);
  }

  return card;
}

function buildLeadPanel(item: RecommendationItem): HTMLElement {
  const lead = document.createElement("section");
  lead.className = `lead-result card--${item.light_phase}`;

  const copy = document.createElement("div");
  copy.className = "lead-result__copy";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Best option";
  const title = document.createElement("h2");
  title.className = "lead-result__title";
  title.textContent = item.location_name;
  const body = document.createElement("p");
  body.className = "lead-result__body";
  body.textContent = item.advice;
  copy.append(eyebrow, title, body);

  const facts = document.createElement("div");
  facts.className = "lead-result__facts";
  facts.append(
    buildMetric("Score", `${item.score}/100`),
    buildMetric("Window", formatTimeWindow(item.best_window.start_utc, item.best_window.end_utc)),
    buildMetric("Distance", formatDistance(item.distance_miles)),
  );

  lead.append(copy, facts);
  return lead;
}

export function renderResults(root: HTMLElement, response: RecommendationResponse, handlers: ResultsHandlers): void {
  root.textContent = "";

  const screen = document.createElement("div");
  screen.className = "screen screen--wide";

  const header = document.createElement("div");
  header.className = "results-header";

  const headerText = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Recommendation set";
  const title = document.createElement("h1");
  title.className = "results-header__title";
  title.textContent = "Your light plan";
  const subtitle = document.createElement("p");
  subtitle.className = "results-header__subtitle";
  subtitle.textContent = `For "${response.intent}" / ${response.shot_type}`;
  headerText.append(eyebrow, title, subtitle);

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "button button--secondary button--compact";
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
    const top = response.recommendations[0];
    if (top === undefined) {
      return;
    }
    screen.appendChild(buildLeadPanel(top));

    const summary = document.createElement("section");
    summary.className = "result-summary";
    summary.setAttribute("aria-label", "Recommendation summary");
    summary.append(
      buildMetric("Places", String(response.recommendations.length)),
      buildMetric("Best phase", formatLightPhase(top.light_phase)),
      buildMetric("Generated", new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(response.generated_at))),
    );
    screen.appendChild(summary);

    const listHeader = document.createElement("div");
    listHeader.className = "section-heading";
    const listTitle = document.createElement("h2");
    listTitle.className = "section-heading__title";
    listTitle.textContent = "Ranked options";
    const listHint = document.createElement("p");
    listHint.className = "section-heading__hint";
    listHint.textContent = "Compare timing, travel distance, conditions, and access friction.";
    listHeader.append(listTitle, listHint);
    screen.appendChild(listHeader);

    const list = document.createElement("div");
    list.className = "card-list";
    for (const item of response.recommendations) {
      list.appendChild(buildCard(item));
    }
    screen.appendChild(list);
  }

  root.appendChild(screen);
}
