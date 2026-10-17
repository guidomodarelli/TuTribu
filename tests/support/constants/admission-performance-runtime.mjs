/** Defines the native performance runner's shared environment, progress and artifact contracts. @module admission-performance-runtime-constants */
export const ADMISSION_PERFORMANCE_ENVIRONMENT = {
  authorization: "NEON_ADMISSION_TEST_API_KEY",
  loadBranchNonce: "ADMISSION_PERFORMANCE_LOAD_BRANCH_NONCE",
  abandonmentBranchNonce: "ADMISSION_PERFORMANCE_ABANDONMENT_BRANCH_NONCE",
  expectedCommit: "ADMISSION_PERFORMANCE_EXPECTED_COMMIT",
};

/** Identifies only fixture-owned setup and completed native measurements. */
export const ADMISSION_PERFORMANCE_PHASE = {
  identities: "seed_native_performance_identities",
  allowlist: "seed_native_performance_allowlist",
  ready: "native_performance_fixture_ready",
  measurement: "native_performance_measurement",
  abandonment: "native_performance_abandonment",
};

/** Maps the two actual Vitest cases to stable artifact kinds without exporting raw titles or failures. */
export const ADMISSION_PERFORMANCE_CASE = {
  load: "should confirm one hundred concurrent native presentations within the target against ten thousand current entries",
  abandonment: "should reclaim the only real pool slot after an abandoned transaction reaches the unchanged production idle guard",
};

/** Bounds only the private CI process and its local artifact, never product timeouts or limits. */
export const ADMISSION_PERFORMANCE_CI = {
  maximumLogBytes: 1_048_576,
  artifactDirectoryPrefix: "admission-native-",
  privateReportFile: "private-vitest-results.json",
  publicReportFile: "admission-native-performance.json",
  testFile: "tests/performance/academy-admissions.performance.test.ts",
  idleGuardSqlState: "25P03",
};

/** Prevents deployment credentials, unrelated CI tokens and user profiles from reaching the native child process. */
export const ADMISSION_PERFORMANCE_INHERITED_ENVIRONMENT = ["SystemRoot", "windir", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "ComSpec", "PATHEXT", "PNPM_HOME", "NODE_EXTRA_CA_CERTS", "PATH", "Path"];

/** Configures synthetic platform inputs while native SQL authorization is supplied separately for this run only. */
export const ADMISSION_PERFORMANCE_STATIC_ENVIRONMENT = {
  CI: "1", NODE_ENV: "test", VERCEL: "1", NEXT_TELEMETRY_DISABLED: "1", SITEPING_ENABLED: "false", MESSAGING_RECOVERY_LOCK: "true",
  BETTER_AUTH_URL: "https://build.example.invalid", RUN_ADMISSION_SQL_TESTS: "1", RUN_ADMISSION_PERFORMANCE_TESTS: "1",
};
