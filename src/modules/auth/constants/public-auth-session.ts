/** Selects native session endpoints whose HTTP DTO must omit server-only token material. @module public-auth-session-constants */
export const PUBLIC_AUTH_SESSION_ENDPOINT = { current: "/get-session", list: "/list-sessions" } as const;
/** Separator whose optional native endpoint trailing repetitions are mirrored without accepting caller-selected authority. */
export const PUBLIC_AUTH_SESSION_PATH_SEPARATOR = "/";
/** Identifies only a failed own public projection, without reclassifying native auth failures. */
export const PUBLIC_AUTH_SESSION_DIAGNOSTIC = { feature: "auth", operation: "project_public_auth_session", code: "public_contract_unusable", message: "Native authentication session could not be projected safely." } as const;
/** Keeps public projection recovery separate from an expired or unauthenticated session. */
export const PUBLIC_AUTH_SESSION_FAILURE_MESSAGE = "No pudimos consultar tu sesión. Intentá nuevamente.";
/** Native body validators/lengths cannot describe the newly minimized JSON. */
export const PUBLIC_AUTH_SESSION_REPLACED_HEADERS = ["content-length","etag"] as const;
