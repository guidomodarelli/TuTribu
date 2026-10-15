/**
 * Decides whether the development server must intercept external provider calls.
 *
 * @module external-api-mocks-activation
 */

import {
  EXTERNAL_API_MOCKS_ACTIVATION,
  EXTERNAL_API_MOCKS_ENABLED_FLAG_VALUES,
  EXTERNAL_API_MOCKS_FLAG_ENVIRONMENT_VARIABLE,
  EXTERNAL_API_MOCKS_LOG_CONTEXT,
  EXTERNAL_API_MOCKS_NEXT_RUNTIME,
  EXTERNAL_API_MOCKS_NODE_ENVIRONMENT,
} from "@/src/modules/shared/constants/external-api-mocks";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const IGNORED_FLAG_LOG = {
  message:
    "MOCK_EXTERNAL_APIS is set outside next dev and was ignored; real providers stay in use",
  operation: "resolve-external-api-mocks-activation",
} as const;

/**
 * Warns that the mock flag was set on a server where it never applies, so a
 * misconfigured deployment is visible in the logs instead of silently ignored.
 *
 * @returns Nothing.
 */
export function reportIgnoredExternalApiMocksFlag(): void {
  createServerLogger({
    ...EXTERNAL_API_MOCKS_LOG_CONTEXT,
    operation: IGNORED_FLAG_LOG.operation,
  }).warn({ message: IGNORED_FLAG_LOG.message });
}

/** Outcome of the activation rule; `ignored-outside-development` means the flag was set where it is not allowed. */
export type ExternalApiMocksActivation =
  | "disabled"
  | "enabled"
  | "ignored-outside-development";

/** Environment values read by the activation rule. */
export type ExternalApiMocksEnvironment = Partial<
  Record<string, string | undefined>
>;

/**
 * Resolves whether the external provider mocks must start.
 *
 * The mocks only run on the Node.js runtime of `next dev` with the flag set;
 * a flag set in any other environment is reported so it can be logged and ignored.
 *
 * @param environment - Process environment values.
 * @returns The activation outcome.
 */
export function resolveExternalApiMocksActivation(
  environment: ExternalApiMocksEnvironment
): ExternalApiMocksActivation {
  const flagValue = environment[EXTERNAL_API_MOCKS_FLAG_ENVIRONMENT_VARIABLE]
    ?.trim()
    .toLowerCase();
  const isFlagOn = EXTERNAL_API_MOCKS_ENABLED_FLAG_VALUES.some(
    (enabledValue) => enabledValue === flagValue
  );

  if (!isFlagOn || environment.NEXT_RUNTIME !== EXTERNAL_API_MOCKS_NEXT_RUNTIME) {
    return EXTERNAL_API_MOCKS_ACTIVATION.disabled;
  }

  return environment.NODE_ENV === EXTERNAL_API_MOCKS_NODE_ENVIRONMENT
    ? EXTERNAL_API_MOCKS_ACTIVATION.enabled
    : EXTERNAL_API_MOCKS_ACTIVATION.ignoredOutsideDevelopment;
}
