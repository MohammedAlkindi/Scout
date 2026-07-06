const SHARE_PARAM = "share";
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isString(value) {
    return typeof value === "string";
}
function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every(isString);
}
function isRecommendationItem(value) {
    if (!isRecord(value) || !isRecord(value.best_window) || !isRecord(value.score_breakdown)) {
        return false;
    }
    return (isNumber(value.rank) &&
        isString(value.location_name) &&
        isNumber(value.latitude) &&
        isNumber(value.longitude) &&
        isNumber(value.distance_miles) &&
        isString(value.terrain_type) &&
        isString(value.best_window.start_utc) &&
        isString(value.best_window.end_utc) &&
        isString(value.light_phase) &&
        isNumber(value.score) &&
        isNumber(value.score_breakdown.light) &&
        isNumber(value.score_breakdown.weather) &&
        isNumber(value.score_breakdown.crowd) &&
        isNumber(value.score_breakdown.access) &&
        isString(value.confidence) &&
        isStringArray(value.reason_tags) &&
        isStringArray(value.caveats) &&
        isString(value.conditions_summary) &&
        isString(value.advice) &&
        typeof value.permit_required === "boolean");
}
function isRecommendationResponse(value) {
    if (!isRecord(value) || !Array.isArray(value.recommendations)) {
        return false;
    }
    return (isNumber(value.latitude) &&
        isNumber(value.longitude) &&
        isString(value.intent) &&
        isString(value.shot_type) &&
        isString(value.generated_at) &&
        value.recommendations.every(isRecommendationItem));
}
function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    try {
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new TextDecoder().decode(bytes);
    }
    catch {
        return null;
    }
}
export function buildShareUrl(response) {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    url.searchParams.set(SHARE_PARAM, base64UrlEncode(JSON.stringify(response)));
    return url.toString();
}
export function readSharedRecommendationFromUrl() {
    const raw = new URL(window.location.href).searchParams.get(SHARE_PARAM);
    if (raw === null) {
        return null;
    }
    const decoded = base64UrlDecode(raw);
    if (decoded === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(decoded);
        return isRecommendationResponse(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
export function clearShareParamFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHARE_PARAM)) {
        return;
    }
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}
