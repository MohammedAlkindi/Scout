/**
 * Shared types for the Scout frontend.
 *
 * Field names deliberately mirror the backend's JSON output exactly
 * (snake_case, matching server/schemas.py) rather than being remapped to
 * camelCase. That keeps `fetch` responses assignable to these interfaces
 * with zero transformation code -- one less place for a silent mismatch
 * between frontend and backend to hide.
 */
export {};
