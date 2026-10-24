/** Names the bounded readonly session recovery and its safe diagnostics. @module better-auth-session-constants */
export const BETTER_AUTH_DEPENDENCY = "better-auth";
/** Recognizes only the SDK's stable failed-session wrapper, independently of private causes. */
export const BETTER_AUTH_SESSION_FAILURE = { bodyCode: "FAILED_TO_GET_SESSION", message: "Failed to get session", numericStatus: 500, operation: "get_session", stringStatus: "INTERNAL_SERVER_ERROR" } as const;
/** Identifies the original server-session retry without exposing its native error. */
export const BETTER_AUTH_SESSION_LOG_CONTEXT = { feature: "auth", operation: "better_auth_session_lookup" } as const;
/** Records one known readonly retry with minimum fixed context. */
export const BETTER_AUTH_SESSION_LOG_MESSAGE = { retry: "Better Auth session lookup failed transiently; retrying once." } as const;
/** Avoids retry pressure when the actual node-postgres checkout deadline was exhausted. */
export const CONNECTION_TIMEOUT_ERROR_SIGNATURE = "timeout exceeded when trying to connect";
/** Bounds cause traversal even for a self-referential native failure. */
export const BETTER_AUTH_SESSION_ERROR_CAUSE_MAX_DEPTH = 5;
/** Server renders cannot update the browser cookie, so they must never renew the database session. */
export const SERVER_RENDER_SESSION_QUERY = { disableRefresh: true } as const;

/** Key of the one session lookup shared by the loaders of a single server render. */
export const SERVER_RENDER_SESSION_MEMO_KEY = "auth:server-render-session";
