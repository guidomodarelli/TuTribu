/** Bounds metadata-only observation outside the measured application process. */
export const ADMISSION_BACKEND_OBSERVATION = {
  environmentVariable: "ADMISSION_NODE_OBSERVE_BACKENDS",
  lockEnvironmentVariable: "ADMISSION_NODE_OBSERVE_LOCKS",
  enabledValue: "1",
  pollMs: 100,
  lockPollMs: 500,
  maximumSamples: 512,
  nativeTestTimeoutMs: 180_000,
  nativePollAttempts: 100,
  nativePollMs: 50,
  nativeConnections: 3,
  absentValue: "none",
  failureCode: "backend_observation_failed",
  missingLockSnapshotCode: "backend_lock_snapshot_unavailable",
  reportSuffix: ".backends.json",
  scope: "native_invocation_including_setup_warmup_measurement",
} as const;
