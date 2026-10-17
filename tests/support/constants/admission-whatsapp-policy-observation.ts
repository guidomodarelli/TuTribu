/** Bounds real interaction observations without changing product limits. @module admission-whatsapp-policy-observation-constants */
export const ADMISSION_WHATSAPP_POLICY_OBSERVATION = {
  loads: 4,
  togglesPerLoad: 12,
  settleObservationMs: 320,
  maximumEvents: 512,
  profiles: [
    { name: "browser-default", reducedMotion: null },
    { name: "normal-motion", reducedMotion: "no-preference" },
    { name: "reduced-motion", reducedMotion: "reduce" },
  ] satisfies Array<{ name: string; reducedMotion: "no-preference" | "reduce" | null }>,
  timeoutMs: 600_000,
  securityEnvironment: "synthetic-whatsapp-policy",
  directoryEnvironment: "ADMISSION_WHATSAPP_POLICY_OBSERVATION_DIRECTORY",
} as const;
