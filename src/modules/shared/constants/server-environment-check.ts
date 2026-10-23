/** Names the startup environment check, its severities and its fixed diagnostics. @module server-environment-check-constants */

/** `blocking`: the feature cannot work and local development stops at startup. `degraded`: the feature turns itself off. */
export type ServerEnvironmentSeverity = "blocking" | "degraded";
export const SERVER_ENVIRONMENT_SEVERITY = { blocking: "blocking", degraded: "degraded" } as const satisfies Record<string, ServerEnvironmentSeverity>;

/** Fixed logger context: the check runs once per server instance, outside any request. */
export const SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC = {
  feature: "server-environment",
  operation: "startup-check",
  requestId: "server-startup",
  message: "Server environment is incomplete: affected features fail until the listed variables are set",
} as const;

/** Thrown only in local development, where failing at startup beats a 500 in the middle of a flow. */
export const SERVER_ENVIRONMENT_BLOCKING_MESSAGE = "Server environment is incomplete; set the variables listed above (see .env.example) and restart";
