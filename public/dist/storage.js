const SESSIONS_KEY = "scout:sessions";
const SETTINGS_KEY = "scout:settings";
export const DEMO_SESSION_NAME = "Try Muscat sunset scout";
export const DEFAULT_SETTINGS = {
    units: "imperial",
    radiusMiles: 15,
    activityTypes: ["landscape", "portrait", "wildlife"],
    timeFormat: "12h",
    theme: "system",
};
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
function isSettings(value) {
    if (!isRecord(value)) {
        return false;
    }
    return ((value.units === "metric" || value.units === "imperial") &&
        isNumber(value.radiusMiles) &&
        isStringArray(value.activityTypes) &&
        (value.timeFormat === "12h" || value.timeFormat === "24h") &&
        (value.theme === "system" || value.theme === "dark" || value.theme === "light"));
}
function isSession(value) {
    if (!isRecord(value) || !isRecord(value.location)) {
        return false;
    }
    return (isString(value.id) &&
        isString(value.createdAt) &&
        isNumber(value.location.lat) &&
        isNumber(value.location.lng) &&
        isString(value.location.label) &&
        isString(value.intent) &&
        (value.results === null || isRecord(value.results)) &&
        isString(value.name));
}
function readJson(key) {
    const stored = localStorage.getItem(key);
    if (stored === null) {
        return null;
    }
    try {
        return JSON.parse(stored);
    }
    catch {
        return null;
    }
}
export function createSession() {
    const createdAt = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        createdAt,
        location: { lat: 0, lng: 0, label: "Location pending" },
        intent: "",
        results: null,
        name: "New Scout",
    };
}
export function createDemoSession() {
    const generatedAtDate = new Date();
    const generatedAt = generatedAtDate.toISOString();
    const windowStart = new Date(generatedAtDate.getTime() + 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(generatedAtDate.getTime() + 93 * 60 * 1000).toISOString();
    return {
        id: crypto.randomUUID(),
        createdAt: generatedAt,
        location: { lat: 23.5793, lng: 58.4025, label: "Muscat, Oman" },
        intent: "sunset landscape near the coast",
        name: DEMO_SESSION_NAME,
        results: {
            latitude: 23.5793,
            longitude: 58.4025,
            intent: "sunset landscape near the coast",
            shot_type: "landscape",
            generated_at: generatedAt,
            demo_mode: true,
            source_note: "Bundled demo plan using static Muscat places and fresh relative light windows.",
            recommendations: [
                {
                    rank: 1,
                    location_name: "Azaiba Beach Park",
                    latitude: 23.6019,
                    longitude: 58.3912,
                    distance_miles: 3.7,
                    terrain_type: "urban park",
                    best_window: { start_utc: windowStart, end_utc: windowEnd },
                    light_phase: "golden_hour",
                    score: 92,
                    score_breakdown: { light: 100, weather: 88, crowd: 100, access: 90 },
                    confidence: "medium",
                    reason_tags: ["Golden-hour timing", "Low wind", "Close to origin", "No permit flag"],
                    caveats: ["Crowd and access signals are inferred from public map tags; verify locally."],
                    conditions_summary: "Soft coastal light, light wind, and clear visibility.",
                    advice: "Azaiba Beach Park: falls within golden hour; open shoreline works well for landscape scouting.",
                    permit_required: false,
                    permit_notes: null,
                    image_url: null,
                    image_attribution: null,
                },
                {
                    rank: 2,
                    location_name: "Qurum Natural Park",
                    latitude: 23.6146,
                    longitude: 58.4892,
                    distance_miles: 5.9,
                    terrain_type: "urban park",
                    best_window: { start_utc: windowStart, end_utc: windowEnd },
                    light_phase: "golden_hour",
                    score: 88,
                    score_breakdown: { light: 100, weather: 84, crowd: 60, access: 88 },
                    confidence: "medium",
                    reason_tags: ["Golden-hour timing", "Clear visibility", "No permit flag", "Low access friction"],
                    caveats: ["Crowd and access signals are inferred from public map tags; verify locally."],
                    conditions_summary: "Warm light, accessible terrain, and moderate crowd risk.",
                    advice: "Qurum Natural Park: good golden-hour backup with varied foregrounds and easy access.",
                    permit_required: false,
                    permit_notes: null,
                    image_url: null,
                    image_attribution: null,
                },
                {
                    rank: 3,
                    location_name: "Mutrah Corniche",
                    latitude: 23.6217,
                    longitude: 58.5651,
                    distance_miles: 10.6,
                    terrain_type: "waterfront",
                    best_window: { start_utc: windowStart, end_utc: windowEnd },
                    light_phase: "golden_hour",
                    score: 84,
                    score_breakdown: { light: 100, weather: 86, crowd: 60, access: 78 },
                    confidence: "medium",
                    reason_tags: ["Golden-hour timing", "Clear visibility", "Waterfront foreground"],
                    caveats: [
                        "Demo fallback uses bundled place data for a reliable walkthrough.",
                        "Crowd and parking can vary around Mutrah; verify locally before leaving.",
                    ],
                    conditions_summary: "Warm reflected light, clear visibility, and higher evening crowd risk.",
                    advice: "Mutrah Corniche: strong fallback for waterfront leading lines if the nearby coast is crowded.",
                    permit_required: false,
                    permit_notes: null,
                    image_url: null,
                    image_attribution: null,
                },
            ],
        },
    };
}
export function loadSessions() {
    const value = readJson(SESSIONS_KEY);
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(isSession);
}
export function saveSessions(sessions) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
export function upsertSession(session) {
    const sessions = loadSessions();
    const index = sessions.findIndex((candidate) => candidate.id === session.id);
    if (index === -1) {
        const next = [session, ...sessions];
        saveSessions(next);
        return next;
    }
    const next = [...sessions];
    next[index] = session;
    saveSessions(next);
    return next;
}
export function deleteSession(sessionId) {
    const next = loadSessions().filter((session) => session.id !== sessionId);
    saveSessions(next);
    return next;
}
export function duplicateSession(session) {
    return {
        ...session,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name: `${session.name} copy`,
    };
}
export function loadSettings() {
    const value = readJson(SETTINGS_KEY);
    if (!isSettings(value)) {
        return DEFAULT_SETTINGS;
    }
    return {
        ...DEFAULT_SETTINGS,
        ...value,
        radiusMiles: Math.min(50, Math.max(1, value.radiusMiles)),
    };
}
export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
