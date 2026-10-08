/** Owns supported execution profiles consumed by both guards and runtime cutover checks. @module admission-execution-capability-constants */
import type { AdmissionExecutionCapabilities } from "../domain/repositories/admission-execution-capabilities";
import { ADMISSION_REQUEST_SOURCE } from "./admission-request";
import { ADMISSION_POLICY_MODE } from "./admission-policy";

/** Current manual writer accepts common presentations with declared or owned local proof; other sources/modes keep full runtime cutover closed. */
export const MANUAL_ADMISSION_EXECUTION_CAPABILITIES: AdmissionExecutionCapabilities = {
  sources: [ADMISSION_REQUEST_SOURCE.common], policyModes: [ADMISSION_POLICY_MODE.manualReview], additionalVerification: true,
};
/** Full published admission scope requires every source, both evaluators and local verification. */
export const REQUIRED_ADMISSION_EXECUTION_SOURCES: readonly ("common" | "personal" | "legacy")[] = [ADMISSION_REQUEST_SOURCE.common, ADMISSION_REQUEST_SOURCE.personal, ADMISSION_REQUEST_SOURCE.legacy];
export const REQUIRED_ADMISSION_EXECUTION_MODES: readonly ("manual_review" | "allowlist")[] = [ADMISSION_POLICY_MODE.manualReview, ADMISSION_POLICY_MODE.allowlist];
