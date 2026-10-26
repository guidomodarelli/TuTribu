/** Reads only the explicit host trigger switch, without constructing database or provider dependencies. @module admission-maintenance-config */
import { ADMISSION_MAINTENANCE_TRIGGER } from "../../constants/admission-maintenance-trigger.mjs";

/**
 * Checks the deployment's deliberate activation value; missing and other values stay closed.
 * @param {{ ADMISSION_MESSAGING_MAINTENANCE_ENABLED?: string }} environment - Native host bindings, never browser input.
 * @returns {boolean} Whether this host may invoke the separately authorized maintenance route.
 */
export function isAdmissionMaintenanceEnabled(environment) {
  return environment[ADMISSION_MAINTENANCE_TRIGGER.enabledEnvironmentKey] === ADMISSION_MAINTENANCE_TRIGGER.enabledValue;
}
