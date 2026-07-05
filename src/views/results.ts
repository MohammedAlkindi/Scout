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

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phaseGradientClass(item: RecommendationItem): string {
  if (item.light_phase === "golden_hour") {
    return "place-photo place-photo--golden";
  }
  if (item.light_phase === "blue_hour") {
    return "place-photo place-photo--blue";
  }
  return "place-photo place-photo--neutral";
}

function buildPlaceImage(item: RecommendationItem): HTMLImageElement {
  const title = escapeSvgText(item.location_name);
  const terrain = escapeSvgText(item.terrain_type);
  const phase = escapeSvgText(formatLightPhase(item.light_phase));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7efd9"/>
        <stop offset="0.48" stop-color="#d9c49a"/>
        <stop offset="1" stop-color="#191b16"/>
      </linearGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#383a32"/>
        <stop offset="1" stop-color="#191b16"/>
      </linearGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0.09"/></feComponentTransfer>
      </filter>
    </defs>
    <rect width="900" height="520" fill="url(#sky)"/>
    <circle cx="686" cy="142" r="52" fill="#f7efd9" opacity="0.82"/>
    <path d="M0 326 C160 278 282 312 420 268 C560 224 690 270 900 218 V520 H0Z" fill="url(#ground)" opacity="0.96"/>
    <path d="M0 382 C130 348 254 362 396 330 C548 296 676 330 900 286 V520 H0Z" fill="#25271f" opacity="0.88"/>
    <rect x="34" y="34" width="832" height="452" rx="16" fill="none" stroke="#f7efd9" stroke-opacity="0.28" stroke-width="2"/>
    <text x="56" y="72" fill="#f7efd9" font-family="system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="4">${phase}</text>
    <text x="56" y="410" fill="#f7efd9" font-family="system-ui, sans-serif" font-size="38" font-weight="700">${title}</text>
    <text x="56" y="448" fill="#d9c49a" font-family="ui-monospace, monospace" font-size="19">${terrain}</text>
    <rect width="900" height="520" filter="url(#grain)"/>
  </svg>`;
  const image = document.createElement("img");
  image.className = phaseGradientClass(item);
  image.alt = `${item.location_name} visual scouting preview`;
  image.loading = "lazy";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return image;
}

function buildMapUrl(item: RecommendationItem): string {
  const padding = 0.012;
  const west = item.longitude - padding;
  const east = item.longitude + padding;
  const south = item.latitude - padding;
  const north = item.latitude + padding;
  const bbox = `${west},${south},${east},${north}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(
    `${item.latitude},${item.longitude}`,
  )}`;
}

function buildMedia(item: RecommendationItem): HTMLElement {
  const media = document.createElement("div");
  media.className = "result-card__media";

  const photoWrap = document.createElement("figure");
  photoWrap.className = "media-panel media-panel--photo";
  const image = buildPlaceImage(item);
  const caption = document.createElement("figcaption");
  caption.textContent = "Visual scouting preview";
  photoWrap.append(image, caption);

  const mapWrap = document.createElement("div");
  mapWrap.className = "media-panel media-panel--map";
  const map = document.createElement("iframe");
  map.title = `${item.location_name} map`;
  map.loading = "lazy";
  map.referrerPolicy = "no-referrer-when-downgrade";
  map.src = buildMapUrl(item);
  const mapLink = document.createElement("a");
  mapLink.href = `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=15/${item.latitude}/${item.longitude}`;
  mapLink.target = "_blank";
  mapLink.rel = "noreferrer";
  mapLink.textContent = "Open map";
  mapWrap.append(map, mapLink);

  media.append(photoWrap, mapWrap);
  return media;
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

  const media = buildMedia(item);

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

  card.append(top, media, grid, summary, advice);

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
