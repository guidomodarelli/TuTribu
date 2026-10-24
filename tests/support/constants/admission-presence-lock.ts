/** Bounds the observed two-transaction presence/admission race without changing product deadlines. */
export const ADMISSION_PRESENCE_LOCK_VALIDATION = {
  timeoutMs: 600_000,
  contentionTimeoutMs: 10_000,
  contentionIntervalMs: 100,
  unknownSlug: "synthetic-missing-presence-tribe",
} as const;
