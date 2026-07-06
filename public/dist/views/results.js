import { formatLightPhase } from "../format.js";
const timeFormatters = {
    "12h": new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
    "24h": new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
};
function formatTimeWindow(startUtc, endUtc, settings) {
    const formatter = timeFormatters[settings.timeFormat];
    return `${formatter.format(new Date(startUtc))} - ${formatter.format(new Date(endUtc))}`;
}
function formatDistance(miles, settings) {
    if (settings.units === "metric") {
        return `${(miles * 1.609344).toFixed(1)} km`;
    }
    return `${miles.toFixed(1)} mi`;
}
function scoreClass(score) {
    if (score >= 75) {
        return "result-card__score result-card__score--high";
    }
    if (score >= 50) {
        return "result-card__score result-card__score--mid";
    }
    return "result-card__score result-card__score--low";
}
function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isScoreBreakdown(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (isNumber(record.light) &&
        isNumber(record.weather) &&
        isNumber(record.crowd) &&
        isNumber(record.access));
}
function safeScoreBreakdown(item) {
    const value = item.score_breakdown;
    if (isScoreBreakdown(value)) {
        return value;
    }
    return {
        light: item.score,
        weather: item.score,
        crowd: item.score,
        access: item.score,
    };
}
function safeStringList(value) {
    return isStringArray(value) ? value : [];
}
function confidenceLabel(item) {
    if (item.confidence === "high" || item.confidence === "medium" || item.confidence === "low") {
        return item.confidence;
    }
    return "medium";
}
function escapeSvgText(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function phaseGradientClass(item) {
    if (item.light_phase === "golden_hour") {
        return "place-photo place-photo--golden";
    }
    if (item.light_phase === "blue_hour") {
        return "place-photo place-photo--blue";
    }
    return "place-photo place-photo--neutral";
}
function buildPlaceImage(item) {
    const imageUrl = item.image_url;
    if (typeof imageUrl === "string" && imageUrl.trim().length > 0) {
        const realImage = document.createElement("img");
        realImage.className = "place-photo place-photo--real";
        realImage.alt = `${item.location_name} location photo`;
        realImage.loading = "lazy";
        realImage.referrerPolicy = "no-referrer";
        realImage.src = imageUrl;
        return realImage;
    }
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
function buildBounds(response) {
    const latitudes = [response.latitude, ...response.recommendations.map((item) => item.latitude)];
    const longitudes = [response.longitude, ...response.recommendations.map((item) => item.longitude)];
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latPadding = Math.max(0.012, (maxLat - minLat) * 0.28);
    const lngPadding = Math.max(0.012, (maxLng - minLng) * 0.28);
    return {
        west: minLng - lngPadding,
        east: maxLng + lngPadding,
        south: minLat - latPadding,
        north: maxLat + latPadding,
    };
}
function clampPercent(value) {
    return Math.max(4, Math.min(96, value));
}
function mapPointStyle(item, bounds) {
    const lngSpan = bounds.east - bounds.west || 1;
    const latSpan = bounds.north - bounds.south || 1;
    return {
        left: `${clampPercent(((item.longitude - bounds.west) / lngSpan) * 100)}%`,
        top: `${clampPercent(((bounds.north - item.latitude) / latSpan) * 100)}%`,
    };
}
function buildOverviewMapUrl(bounds) {
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
}
function buildMapUrl(item) {
    const padding = 0.012;
    const west = item.longitude - padding;
    const east = item.longitude + padding;
    const south = item.latitude - padding;
    const north = item.latitude + padding;
    const bbox = `${west},${south},${east},${north}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`;
}
function buildOverviewMap(response, settings) {
    const section = document.createElement("section");
    section.className = "results-map";
    const header = document.createElement("div");
    header.className = "results-map__header";
    const text = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "label";
    eyebrow.textContent = "Map view";
    const title = document.createElement("h1");
    title.textContent = "Recommended scouting route";
    const body = document.createElement("p");
    body.textContent = "Ranked pins show where Scout would go first, with cards below for timing and condition details.";
    text.append(eyebrow, title, body);
    const openMap = document.createElement("a");
    openMap.className = "button";
    openMap.href = `https://www.openstreetmap.org/?mlat=${response.latitude}&mlon=${response.longitude}#map=13/${response.latitude}/${response.longitude}`;
    openMap.target = "_blank";
    openMap.rel = "noreferrer";
    openMap.textContent = "Open map";
    header.append(text, openMap);
    const bodyGrid = document.createElement("div");
    bodyGrid.className = "results-map__body";
    const bounds = buildBounds(response);
    const map = document.createElement("div");
    map.className = "overview-map";
    const frame = document.createElement("iframe");
    frame.title = "Scout recommendation map";
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer-when-downgrade";
    frame.src = buildOverviewMapUrl(bounds);
    map.appendChild(frame);
    for (const item of response.recommendations) {
        const pin = document.createElement("a");
        pin.className = "overview-map__pin";
        pin.href = `#recommendation-${item.rank}`;
        pin.textContent = String(item.rank);
        pin.setAttribute("aria-label", `${item.location_name}, rank ${item.rank}`);
        const position = mapPointStyle(item, bounds);
        pin.style.left = position.left;
        pin.style.top = position.top;
        map.appendChild(pin);
    }
    const list = document.createElement("ol");
    list.className = "route-list";
    for (const item of response.recommendations) {
        const row = document.createElement("li");
        const titleRow = document.createElement("div");
        titleRow.className = "route-list__top";
        const name = document.createElement("strong");
        name.textContent = item.location_name;
        const score = document.createElement("span");
        score.className = scoreClass(item.score);
        score.textContent = `${item.score}`;
        titleRow.append(name, score);
        const meta = document.createElement("p");
        meta.textContent = `${formatDistance(item.distance_miles, settings)} / ${formatTimeWindow(item.best_window.start_utc, item.best_window.end_utc, settings)}`;
        row.append(titleRow, meta);
        list.appendChild(row);
    }
    bodyGrid.append(map, list);
    section.append(header, bodyGrid);
    return section;
}
function buildMedia(item) {
    const media = document.createElement("div");
    media.className = "result-card__media";
    const photoWrap = document.createElement("figure");
    photoWrap.className = "media-panel media-panel--photo";
    const image = buildPlaceImage(item);
    const caption = document.createElement("figcaption");
    caption.textContent =
        typeof item.image_attribution === "string" && item.image_attribution.trim().length > 0
            ? item.image_attribution
            : "Visual scouting preview";
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
    const directionsLink = document.createElement("a");
    directionsLink.className = "map-link-secondary";
    directionsLink.href = `https://www.openstreetmap.org/directions?to=${item.latitude}%2C${item.longitude}`;
    directionsLink.target = "_blank";
    directionsLink.rel = "noreferrer";
    directionsLink.textContent = "Directions";
    const coordinateLabel = document.createElement("span");
    coordinateLabel.className = "map-coordinate data";
    coordinateLabel.textContent = `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`;
    mapWrap.append(map, coordinateLabel, mapLink, directionsLink);
    media.append(photoWrap, mapWrap);
    return media;
}
function tile(label, value) {
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
function buildReasonChips(item) {
    const tags = safeStringList(item.reason_tags);
    if (tags.length === 0) {
        return null;
    }
    const list = document.createElement("ul");
    list.className = "reason-chips";
    for (const tag of tags) {
        const chip = document.createElement("li");
        chip.textContent = tag;
        list.appendChild(chip);
    }
    return list;
}
function buildBreakdown(item) {
    const breakdown = safeScoreBreakdown(item);
    const rows = [
        ["Light", breakdown.light],
        ["Weather", breakdown.weather],
        ["Crowd", breakdown.crowd],
        ["Access", breakdown.access],
    ];
    const list = document.createElement("div");
    list.className = "score-breakdown";
    for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "score-breakdown__row";
        const rowLabel = document.createElement("span");
        rowLabel.textContent = label;
        const track = document.createElement("span");
        track.className = "score-breakdown__track";
        const fill = document.createElement("span");
        fill.className = "score-breakdown__fill";
        fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
        const score = document.createElement("span");
        score.className = "data";
        score.textContent = value.toFixed(0);
        track.appendChild(fill);
        row.append(rowLabel, track, score);
        list.appendChild(row);
    }
    return list;
}
function buildCaveats(item) {
    const caveats = safeStringList(item.caveats);
    if (caveats.length === 0) {
        return null;
    }
    const details = document.createElement("details");
    details.className = "caveats";
    const summary = document.createElement("summary");
    summary.textContent = "What to verify";
    const list = document.createElement("ul");
    for (const caveat of caveats) {
        const row = document.createElement("li");
        row.textContent = caveat;
        list.appendChild(row);
    }
    details.append(summary, list);
    return details;
}
function buildCard(item, index, settings) {
    const card = document.createElement("article");
    card.className = `result-card result-card--${item.light_phase}${index === 0 ? " result-card--primary" : ""}`;
    card.id = `recommendation-${item.rank}`;
    card.style.setProperty("--stagger-index", String(index));
    const top = document.createElement("div");
    top.className = "result-card__top";
    const titleBlock = document.createElement("div");
    const name = document.createElement("h2");
    name.className = "result-card__name";
    name.textContent = item.location_name;
    const meta = document.createElement("p");
    meta.className = "result-card__meta";
    meta.textContent = `${item.terrain_type} / ${formatLightPhase(item.light_phase)} / ${confidenceLabel(item)} confidence`;
    titleBlock.append(name, meta);
    const score = document.createElement("div");
    score.className = scoreClass(item.score);
    score.textContent = `${item.score}`;
    top.append(titleBlock, score);
    const media = buildMedia(item);
    const grid = document.createElement("div");
    grid.className = "result-card__grid";
    grid.append(tile("Best window", formatTimeWindow(item.best_window.start_utc, item.best_window.end_utc, settings)), tile("Distance", formatDistance(item.distance_miles, settings)), tile("Score", `${item.score}/100`));
    const reasonChips = buildReasonChips(item);
    const breakdown = buildBreakdown(item);
    const summary = document.createElement("p");
    summary.className = "result-card__summary";
    summary.textContent = item.conditions_summary;
    const advice = document.createElement("p");
    advice.textContent = item.advice;
    card.append(top, media, grid);
    if (reasonChips !== null) {
        card.appendChild(reasonChips);
    }
    card.append(breakdown, summary, advice);
    if (item.permit_required) {
        const permit = document.createElement("p");
        permit.className = "result-card__summary";
        permit.textContent = item.permit_notes ?? "A permit may be required here.";
        card.appendChild(permit);
    }
    const caveats = buildCaveats(item);
    if (caveats !== null) {
        card.appendChild(caveats);
    }
    return card;
}
export function renderResults(root, response, settings) {
    if (response.recommendations.length === 0) {
        const empty = document.createElement("section");
        empty.className = "workspace-panel";
        const title = document.createElement("h1");
        title.textContent = "No recommendations found";
        const body = document.createElement("p");
        body.textContent = "Try a wider radius or a different activity.";
        empty.append(title, body);
        root.appendChild(empty);
        return;
    }
    root.appendChild(buildOverviewMap(response, settings));
    const top = response.recommendations[0];
    if (top !== undefined) {
        const summary = document.createElement("section");
        summary.className = "results-summary";
        const title = document.createElement("h1");
        title.textContent = "Best scouting window found";
        const body = document.createElement("p");
        body.textContent = `${top.location_name} leads because it combines ${formatLightPhase(top.light_phase).toLowerCase()} timing, ${formatDistance(top.distance_miles, settings)} travel distance, and a ${top.score}/100 score.`;
        summary.append(title, body);
        root.appendChild(summary);
    }
    const list = document.createElement("section");
    list.className = "results-list";
    list.setAttribute("aria-label", "Scout recommendations");
    for (const [index, item] of response.recommendations.entries()) {
        list.appendChild(buildCard(item, index, settings));
    }
    root.appendChild(list);
}
