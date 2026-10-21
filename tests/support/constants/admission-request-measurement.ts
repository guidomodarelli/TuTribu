/** Bounds the shared native per-request database measurement driver. @module admission-request-measurement-constants */
export const ADMISSION_REQUEST_MEASUREMENT = {
  counterPreload: "tests/support/admission-query-counter.mjs",
  samples: 3,
  observationPolls: 40,
  observationPollMs: 250,
  requestTimeoutMs: 300_000,
  failureBodyLength: 300,
} as const;
