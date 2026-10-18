/** Bounds metadata-only observation outside the measured application process. */
export const ADMISSION_BACKEND_OBSERVATION = {
  environmentVariable: "ADMISSION_NODE_OBSERVE_BACKENDS",
  enabledValue: "1",
  pollMs: 100,
  maximumSamples: 512,
  nativeTestTimeoutMs: 180_000,
  nativePollAttempts: 100,
  nativePollMs: 50,
  nativeConnections: 3,
  absentValue: "none",
  failureCode: "backend_observation_failed",
  reportSuffix: ".backends.json",
  scope: "native_invocation_including_setup_warmup_measurement",
} as const;
