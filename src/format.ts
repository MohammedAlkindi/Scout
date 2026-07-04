import type { LightPhase } from "./types.js";

const LIGHT_PHASE_LABELS: Record<LightPhase, string> = {
  golden_hour: "Golden hour",
  blue_hour: "Blue hour",
  daylight: "Daylight",
  night: "Night",
};

export function formatLightPhase(phase: LightPhase): string {
  return LIGHT_PHASE_LABELS[phase];
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** Formats a UTC start/end pair as a compact local time range, e.g. "7:42–8:21 PM". */
export function formatTimeWindow(startUtc: string, endUtc: string): string {
  const start = timeFormatter.format(new Date(startUtc));
  const end = timeFormatter.format(new Date(endUtc));
  return `${start}–${end}`;
}

export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}
