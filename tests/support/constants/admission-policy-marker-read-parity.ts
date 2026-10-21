/** Bounds the native admission policy and marker read parity validation. @module admission-policy-marker-read-parity-constants */
export const ADMISSION_POLICY_MARKER_READ_PARITY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  timeoutMs: 600_000,
  /** Fixed protection instant written only inside a rolled-back scenario. */
  markerAt: new Date("2026-01-01T00:00:00.000Z"),
} as const;
