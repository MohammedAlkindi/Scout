/**
 * Typed fetch wrapper for the Scout backend.
 *
 * The frontend's three-view flow only ever calls one endpoint
 * (POST /api/recommendation) -- the other four MCP tools are exposed over
 * HTTP for completeness (see server/api.py) but nothing in this
 * text-first, single-screen-result UI needs them directly.
 */
export class ApiRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
    }
}
function isApiErrorResponse(value) {
    return (typeof value === "object" &&
        value !== null &&
        "error" in value &&
        typeof value.error === "string");
}
async function extractErrorMessage(response) {
    try {
        const body = await response.json();
        if (isApiErrorResponse(body)) {
            return body.error;
        }
    }
    catch {
        // Response body wasn't valid JSON; fall through to the generic message.
    }
    return "Something went wrong reaching Scout. Please try again.";
}
export async function fetchRecommendation(request) {
    let response;
    try {
        response = await fetch("/api/recommendation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
    }
    catch {
        throw new ApiRequestError("Could not reach Scout. Check your connection and try again.", 0);
    }
    if (!response.ok) {
        throw new ApiRequestError(await extractErrorMessage(response), response.status);
    }
    // Trust boundary: server/api.py's response_model guarantees this shape;
    // we don't re-validate every field client-side (no schema-validation
    // library is in scope for this project).
    const data = await response.json();
    return data;
}
