/** Owns the real product reader matrix and its externally planned single database capability. */
export const ADMISSION_READER_JOURNEYS = {
  enabledVariable: "RUN_ADMISSION_READER_JOURNEYS",
  enabledValue: "1",
  authorizationVariable: "NEON_ADMISSION_READER_TEST_API_KEY",
  nonceVariable: "ADMISSION_READER_BRANCH_NONCE",
  artifactVariable: "ADMISSION_READER_ARTIFACT_ROOT",
  timeoutMs: 900_000,
  pageTimeoutMs: 60_000,
  participantsPerScenario: 2,
  internalReason: "Pertenece al grupo de prueba",
  environment: "synthetic-admission-linux-reader",
  databaseName: "neondb",
  roleName: "neondb_owner",
} as const;
