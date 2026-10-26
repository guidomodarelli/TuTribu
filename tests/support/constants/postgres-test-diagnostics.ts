/** Bounds private native diagnostics without retaining driver messages or query data. @module postgres-test-diagnostic-constants */
export const POSTGRES_TEST_DIAGNOSTICS = {
  maximumCauses: 64,
  poolCheckoutTimeoutMessage: "timeout exceeded when trying to connect",
} as const;
