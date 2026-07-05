import type { Settings, Session } from "./types.js";

const SESSIONS_KEY = "scout:sessions";
const SETTINGS_KEY = "scout:settings";

export const DEFAULT_SETTINGS: Settings = {
  units: "imperial",
  radiusMiles: 15,
  activityTypes: ["landscape", "wildlife", "hiking"],
  timeFormat: "12h",
  theme: "system",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.units === "metric" || value.units === "imperial") &&
    isNumber(value.radiusMiles) &&
    isStringArray(value.activityTypes) &&
    (value.timeFormat === "12h" || value.timeFormat === "24h") &&
    (value.theme === "system" || value.theme === "dark" || value.theme === "light")
  );
}

function isSession(value: unknown): value is Session {
  if (!isRecord(value) || !isRecord(value.location)) {
    return false;
  }
  return (
    isString(value.id) &&
    isString(value.createdAt) &&
    isNumber(value.location.lat) &&
    isNumber(value.location.lng) &&
    isString(value.location.label) &&
    isString(value.intent) &&
    (value.results === null || isRecord(value.results)) &&
    isString(value.name)
  );
}

function readJson(key: string): unknown {
  const stored = localStorage.getItem(key);
  if (stored === null) {
    return null;
  }
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    return null;
  }
}

export function createSession(): Session {
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

export function loadSessions(): Session[] {
  const value = readJson(SESSIONS_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSession);
}

export function saveSessions(sessions: readonly Session[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function upsertSession(session: Session): Session[] {
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

export function deleteSession(sessionId: string): Session[] {
  const next = loadSessions().filter((session) => session.id !== sessionId);
  saveSessions(next);
  return next;
}

export function duplicateSession(session: Session): Session {
  return {
    ...session,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: `${session.name} copy`,
  };
}

export function loadSettings(): Settings {
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

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
