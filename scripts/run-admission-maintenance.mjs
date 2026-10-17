/** Invokes one explicitly enabled maintenance run, without retries or logging private response bodies. @module run-admission-maintenance */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ADMISSION_MAINTENANCE_TRIGGER, ADMISSION_MAINTENANCE_TRIGGER_ERROR } from "../src/modules/messaging/constants/admission-maintenance-trigger.mjs";
import { isAdmissionMaintenanceEnabled } from "../src/modules/messaging/infrastructure/config/admission-maintenance-config.mjs";
import { AdmissionMaintenanceTriggerError } from "../src/modules/messaging/infrastructure/errors/admission-maintenance-trigger-error.mjs";
import { ADMISSION_MAINTENANCE_CATCH_UP } from "./constants/admission-maintenance-catch-up.mjs";

/**
 * Resolves only a configured origin, before attaching a secret to its canonical route.
 * @param {string | undefined} value - Trusted host configuration; paths, credentials, query and fragments are forbidden.
 * @returns {URL} A secure remote origin or explicit loopback HTTP origin.
 * @throws {AdmissionMaintenanceTriggerError} When the origin is absent or unsafe.
 */
function readOrigin(value) {
  let origin;
  try { origin = new URL(value ?? ""); }
  catch (error) { throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.invalidOrigin, { cause: error }); }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.protocol !== "https:" && !(origin.protocol === "http:" && ADMISSION_MAINTENANCE_TRIGGER.loopbackHostnames.includes(origin.hostname))) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.invalidOrigin);
  return origin;
}

/**
 * Performs exactly one native HTTP request; an error cannot prove that maintenance effects did not commit.
 * @param {Record<string, string | undefined>} environment - Deliberately enabled target, prepared origin and server-only bearer.
 * @param {{ signal?: AbortSignal }} [options] - Optional caller cancellation, combined with the fixed outer request deadline.
 * @returns {Promise<{ status: number }>} HTTP success metadata only, never an upstream body or a delivery assertion.
 * @throws {AdmissionMaintenanceTriggerError} On closed configuration, nonterminal/bad HTTP status or ambiguous transport failure.
 */
export async function runAdmissionMaintenanceCatchUp(environment, options = {}) {
  if (!isAdmissionMaintenanceEnabled(environment)) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.disabled);
  const origin = readOrigin(environment[ADMISSION_MAINTENANCE_TRIGGER.baseUrlEnvironmentKey]);
  const secret = environment[ADMISSION_MAINTENANCE_TRIGGER.secretEnvironmentKey];
  if (!secret?.trim()) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.missingSecret);
  let response;
  try {
    const timeout = AbortSignal.timeout(ADMISSION_MAINTENANCE_TRIGGER.requestTimeoutMs);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    response = await fetch(new URL(ADMISSION_MAINTENANCE_TRIGGER.path, origin), { method: ADMISSION_MAINTENANCE_CATCH_UP.method, headers: { authorization: `${ADMISSION_MAINTENANCE_CATCH_UP.authorizationScheme} ${secret}` }, redirect: "error", signal });
  } catch (error) { throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestUnconfirmed, { cause: error }); }
  const status = response.status;
  try { await response.body?.cancel(); }
  catch (error) { throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestUnconfirmed, { status, cause: error }); }
  if (status !== ADMISSION_MAINTENANCE_TRIGGER.completedHttpStatus) throw new AdmissionMaintenanceTriggerError(status === ADMISSION_MAINTENANCE_TRIGGER.busyHttpStatus ? ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestUnconfirmed : ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestFailed, { status });
  return { status };
}

/**
 * Projects safe status diagnostics and an exit code for the actual Node workflow entrypoint.
 * @returns {Promise<void>} Completion after one invocation; failures never schedule another request.
 */
async function main() {
  try {
    const result = await runAdmissionMaintenanceCatchUp(process.env);
    process.stdout.write(`${JSON.stringify({ operation: ADMISSION_MAINTENANCE_CATCH_UP.operation, state: ADMISSION_MAINTENANCE_CATCH_UP.completed, status: result.status })}\n`);
  } catch (error) {
    const known = error instanceof AdmissionMaintenanceTriggerError;
    process.stderr.write(`${JSON.stringify({ operation: ADMISSION_MAINTENANCE_CATCH_UP.operation, code: known ? error.code : ADMISSION_MAINTENANCE_CATCH_UP.unexpectedFailure, ...(known && error.status !== undefined ? { status: error.status } : {}) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
