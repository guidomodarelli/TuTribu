/**
 * Closed platform-owned reason why the deployment cannot protect messaging and admission operations: its hosting
 * messaging security is missing, unusable or not enrolled (`security_unconfigured`), or the platform locked it while it
 * recovers a service (`recovery_locked`). Only the TuTribu team can resolve either one; a leader never can.
 * @module platform-security-requirement
 */
export type PlatformSecurityRequirement = "security_unconfigured" | "recovery_locked";
