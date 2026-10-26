/** Checks at startup that every feature has the environment it needs. @module server-environment-check */
import { SERVER_ENVIRONMENT_BLOCKING_MESSAGE, SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC, SERVER_ENVIRONMENT_SEVERITY, type ServerEnvironmentSeverity } from "@/src/modules/shared/constants/server-environment-check";
import { summarizeErrorCauses, type ErrorCauseSummary } from "@/src/modules/shared/infrastructure/observability/error-cause-summary";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Read-only view of the process environment. */
export type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/** One feature's requirement: the variables it needs and, optionally, a deeper parse of their values. */
export type ServerEnvironmentRequirement = {
  feature: string;
  severity: ServerEnvironmentSeverity;
  variables: readonly string[];
  /** Validates the values once all variables are present; it throws a typed error when they are unusable. */
  validate?: (environment: ServerEnvironment) => Promise<unknown>;
};

/** A requirement that is not met: names and closed codes only, never values. */
export type ServerEnvironmentProblem = { feature: string; severity: ServerEnvironmentSeverity; missing: string[]; invalid?: ErrorCauseSummary[] };

/**
 * @param environment - Current process environment.
 * @param requirements - Feature requirements composed by the server entrypoint.
 * @returns The unmet requirements, in the given order.
 */
export async function inspectServerEnvironment(environment: ServerEnvironment, requirements: readonly ServerEnvironmentRequirement[]): Promise<ServerEnvironmentProblem[]> {
  const problems: ServerEnvironmentProblem[] = [];
  for (const requirement of requirements) {
    const missing = requirement.variables.filter((name) => !environment[name]?.trim());
    if (missing.length > 0) {
      problems.push({ feature: requirement.feature, severity: requirement.severity, missing });
      continue;
    }
    try { await requirement.validate?.(environment); }
    catch (error) { problems.push({ feature: requirement.feature, severity: requirement.severity, missing: [], invalid: summarizeErrorCauses(error) }); }
  }
  return problems;
}

/**
 * Logs every unmet requirement and, only when `failOnBlocking` is set (local development), stops the server for blocking ones.
 * Production never stops here: the affected feature keeps failing closed on its own, and this log says why.
 * @param environment - Current process environment.
 * @param requirements - Feature requirements composed by the server entrypoint.
 * @param options - `failOnBlocking` throws after logging when a blocking requirement is unmet.
 * @returns The unmet requirements.
 * @throws Error in local development when a blocking requirement is unmet.
 */
export async function checkServerEnvironment(environment: ServerEnvironment, requirements: readonly ServerEnvironmentRequirement[], options: { failOnBlocking: boolean }): Promise<ServerEnvironmentProblem[]> {
  const problems = await inspectServerEnvironment(environment, requirements);
  if (problems.length === 0) return problems;
  const blocking = problems.some((problem) => problem.severity === SERVER_ENVIRONMENT_SEVERITY.blocking);
  createServerLogger({ feature: SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC.feature, operation: SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC.operation, requestId: SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC.requestId })[blocking ? "error" : "warn"]({
    message: SERVER_ENVIRONMENT_CHECK_DIAGNOSTIC.message,
    metadata: { problems },
  });
  if (blocking && options.failOnBlocking) throw new Error(SERVER_ENVIRONMENT_BLOCKING_MESSAGE);
  return problems;
}
