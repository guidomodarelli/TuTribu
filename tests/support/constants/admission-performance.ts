/** Defines reproducible native workloads and measured acceptance criteria without changing production limits. @module admission-performance-constants */

/** Keeps setup, warm-up, application latency and abandoned-transaction recovery independently observable. */
export const ADMISSION_PERFORMANCE = {
  participantCount: 100,
  enabledParticipantCount: 50,
  entryCount: 10_000,
  insertionBlockSize: 100,
  sessionLifetimeMs: 21_600_000,
  evidenceLifetimeMs: 3_600_000,
  expectedPolicyVersion: 2,
  latencyPercentile: 0.95,
  confirmationBudgetMs: 3_000,
  networkSampleCount: 20,
  poolSampleIntervalMs: 20,
  eventLoopResolutionMs: 20,
  nanosecondsPerMillisecond: 1_000_000,
  microsecondsPerMillisecond: 1_000,
  percentageScale: 100,
  nativeCaseTimeoutMs: 3_600_000,
  abandonmentObservationMs: 90_000,
  abandonmentCaseTimeoutMs: 900_000,
  fixtureDomain: "example.test",
  identityIssuer: "https://accounts.google.com",
  identityAudience: "synthetic-performance-client",
  applicantName: "Solicitante de carga",
  exceptionReason: "Solicito una revisión de mi ingreso.",
} as const;

export { ADMISSION_PERFORMANCE_ENVIRONMENT, ADMISSION_PERFORMANCE_PHASE, ADMISSION_PERFORMANCE_CASE } from "./admission-performance-runtime.mjs";

/** Classifies test observations without logging private exceptions or identity fields. */
export const ADMISSION_PERFORMANCE_FAILURE = {
  unexpectedException: "unexpected_exception",
  unconfirmed: "original_unconfirmed",
  unexpectedOutcome: "unexpected_outcome",
} as const;
