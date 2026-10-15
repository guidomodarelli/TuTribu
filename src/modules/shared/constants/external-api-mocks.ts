/**
 * Settings that decide when the local server replaces external providers with mocks.
 *
 * @module external-api-mocks
 */

/** Environment variable that turns on the external provider mocks. */
export const EXTERNAL_API_MOCKS_FLAG_ENVIRONMENT_VARIABLE = "MOCK_EXTERNAL_APIS";

/** Flag values, compared after trimming and lowercasing, that turn the mocks on. */
export const EXTERNAL_API_MOCKS_ENABLED_FLAG_VALUES = ["1", "true"] as const;

/** `NODE_ENV` of the only server allowed to run the mocks. */
export const EXTERNAL_API_MOCKS_NODE_ENVIRONMENT = "development";

/** `NEXT_RUNTIME` that supports the Node.js request interceptor. */
export const EXTERNAL_API_MOCKS_NEXT_RUNTIME = "nodejs";

/** Log context shared by the startup logs of the mocks; there is no request at startup. */
export const EXTERNAL_API_MOCKS_LOG_CONTEXT = {
  feature: "dev-mocks",
  requestId: "server-startup",
} as const;

/** Possible results of evaluating the mock activation rule. */
export const EXTERNAL_API_MOCKS_ACTIVATION = {
  disabled: "disabled",
  enabled: "enabled",
  ignoredOutsideDevelopment: "ignored-outside-development",
} as const;
