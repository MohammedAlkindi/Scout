/**
 * Shared types for the Scout frontend.
 *
 * Field names deliberately mirror the backend's JSON output exactly
 * (snake_case, matching server/schemas.py) rather than being remapped to
 * camelCase. That keeps `fetch` responses assignable to these interfaces
 * with zero transformation code -- one less place for a silent mismatch
 * between frontend and backend to hide.
 */

export type LightPhase = "golden_hour" | "blue_hour" | "daylight" | "night";

export type ShotType = "landscape" | "portrait" | "astro" | "wildlife" | "urban" | "hiking";

/** An ISO 8601 UTC timestamp string, e.g. "2026-07-05T02:57:26.713324Z". */
export type IsoDateTimeString = string;

export interface TimeWindow {
  start_utc: IsoDateTimeString;
  end_utc: IsoDateTimeString;
}

export interface RecommendationItem {
  rank: number;
  location_name: string;
  latitude: number;
  longitude: number;
  distance_miles: number;
  terrain_type: string;
  best_window: TimeWindow;
  light_phase: LightPhase;
  score: number;
  conditions_summary: string;
  advice: string;
  permit_required: boolean;
  permit_notes: string | null;
}

export interface RecommendationResponse {
  latitude: number;
  longitude: number;
  intent: string;
  shot_type: ShotType;
  generated_at: IsoDateTimeString;
  recommendations: RecommendationItem[];
}

export interface RecommendationRequest {
  latitude: number;
  longitude: number;
  intent: string;
  radius_miles?: number;
  shot_type?: ShotType;
}

/** Shape of every error response body the backend returns (never a raw exception). */
export interface ApiErrorResponse {
  error: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Discriminated union of the app's three top-level screens. */
export type AppView =
  | { readonly kind: "location-grant" }
  | { readonly kind: "intent-input"; readonly coordinates: Coordinates }
  | { readonly kind: "results"; readonly coordinates: Coordinates; readonly response: RecommendationResponse };
