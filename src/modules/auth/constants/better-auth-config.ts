/** Names hosting inputs and fixed native provider configuration without credential values. @module better-auth-config-constants */
export const BETTER_AUTH_ENV = { googleClientId: "GOOGLE_CLIENT_ID", googleClientSecret: "GOOGLE_CLIENT_SECRET", secret: "BETTER_AUTH_SECRET", url: "BETTER_AUTH_URL" } as const;
/** Provides safe startup instructions, never the rejected environment input. */
export const BETTER_AUTH_ERROR_MESSAGE = {
  googleProvider: "Better Auth Google provider environment is incomplete. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  secret: "Better Auth environment is incomplete. Set BETTER_AUTH_SECRET and BETTER_AUTH_URL.",
} as const;
/** Selects the existing native database and identity providers. */
export const BETTER_AUTH_PROVIDER = { database: "pg", google: "google" } as const;
/** Retains the existing consent/offline contract; it does not force recent authentication. */
export const GOOGLE_OFFLINE_ACCESS = { accessType: "offline", prompt: "consent" } as const;
/** Identifies the native auth pool's own idle-error operation. */
export const BETTER_AUTH_DATABASE_POOL_OPERATION = { idleError: "better_auth_database_pool_idle_error" } as const;
/** Provider tokens remain available to native server API calls, never the public HTTP router. */
export const BETTER_AUTH_SERVER_ONLY_HTTP_PATHS = ["/get-access-token","/refresh-token"] as const;
