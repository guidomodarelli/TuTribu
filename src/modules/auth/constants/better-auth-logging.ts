/** Defines safe provider diagnostics independently of SDK text, errors or auth payloads. @module better-auth-logging-constants */
export const BETTER_AUTH_LOG_CONTEXT = { feature: "auth", operation: "better_auth_provider", dependency: "better-auth" } as const;
/** Preserves the SDK's default warning threshold without disabling diagnostics. */
export const BETTER_AUTH_LOG_LEVEL = "warn";
/** Recognizes only the provider's stable internal-failure discriminator. */
export const BETTER_AUTH_LOG_SOURCE_INTERNAL_ERROR = "INTERNAL_SERVER_ERROR";
/** Keeps provider text and arbitrary identifiers out of diagnostic event codes. */
export const BETTER_AUTH_LOG_CODE = { internalError: "provider_internal_error", diagnostic: "provider_diagnostic" } as const;
/** Gives operators safe dependency and event context without the original SDK message or arguments. */
export const BETTER_AUTH_LOG_MESSAGE = {
  internalError: "Better Auth reported an internal authentication failure.",
  diagnostic: "Better Auth reported an authentication diagnostic.",
} as const;
