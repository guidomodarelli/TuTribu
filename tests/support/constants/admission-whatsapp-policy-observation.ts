/** Bounds real interaction observations without changing product limits. @module admission-whatsapp-policy-observation-constants */
export const ADMISSION_WHATSAPP_POLICY_OBSERVATION = {
  loads: 4,
  togglesPerLoad: 12,
  settleObservationMs: 320,
  maximumEvents: 512,
  motionPreferences: ["no-preference", "reduce"] satisfies Array<"no-preference" | "reduce">,
  timeoutMs: 600_000,
  securityEnvironment: "synthetic-whatsapp-policy",
  directoryEnvironment: "ADMISSION_WHATSAPP_POLICY_OBSERVATION_DIRECTORY",
} as const;
