/** Declares code-owned evaluator coverage, never browser or provider capability claims. @module admission-execution-capabilities */
export type AdmissionExecutionCapabilities = {
  sources: readonly ("common" | "personal" | "legacy")[];
  policyModes: readonly ("manual_review" | "allowlist")[];
  additionalVerification: boolean;
};
export interface AdmissionExecutionCapabilitiesReader {
  /** @returns Coverage actually enforced by this evaluator's execution guards. */
  getCapabilities(): AdmissionExecutionCapabilities;
}
