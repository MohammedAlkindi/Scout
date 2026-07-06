/**
 * Typed fetch wrapper for the Scout backend.
 *
 * The frontend's three-view flow only ever calls one endpoint
 * (POST /api/recommendation) -- the other four MCP tools are exposed over
 * HTTP for completeness (see server/api.py) but nothing in this
 * text-first, single-screen-result UI needs them directly.
 */

import type { ApiErrorResponse, RecommendationRequest, RecommendationResponse } from "./types.js";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly recoveryHint: string | null;

  constructor(message: string, status: number, code = "network_error", retryable = true, recoveryHint: string | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.recoveryHint = recoveryHint;
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

async function extractErrorResponse(response: Response): Promise<ApiErrorResponse> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorResponse(body)) {
      return body;
    }
  } catch {
    // Response body wasn't valid JSON; fall through to the generic message.
  }
  return { error: "Something went wrong reaching Scout. Please try again." };
}

export async function fetchRecommendation(request: RecommendationRequest): Promise<RecommendationResponse> {
  let response: Response;
  try {
    response = await fetch("/api/recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiRequestError(
      "Could not reach Scout. Check your connection and try again.",
      0,
      "network_error",
      true,
      "Retry once. If you are demoing, open the bundled Muscat scout from the recovery action.",
    );
  }

  if (!response.ok) {
    const error = await extractErrorResponse(response);
    throw new ApiRequestError(
      error.error,
      response.status,
      error.code ?? "api_error",
      error.retryable ?? true,
      error.recovery_hint ?? null,
    );
  }

  // Trust boundary: server/api.py's response_model guarantees this shape;
  // we don't re-validate every field client-side (no schema-validation
  // library is in scope for this project).
  const data: unknown = await response.json();
  return data as RecommendationResponse;
}
