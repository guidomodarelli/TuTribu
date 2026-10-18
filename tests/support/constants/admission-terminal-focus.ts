/** Owns the full real-browser focus regression, independently of operating-system reader evidence. */
export const ADMISSION_TERMINAL_FOCUS = {
  enabledVariable: "RUN_ADMISSION_TERMINAL_FOCUS_TESTS",
  enabledValue: "1",
  artifactVariable: "ADMISSION_TERMINAL_FOCUS_ARTIFACT_ROOT",
  environment: "synthetic-admission-terminal-focus",
  locale: "es-AR",
  widths: [1280, 390] as readonly number[],
  height: 900,
  timeoutMs: 900_000,
  pageTimeoutMs: 60_000,
  participantsPerScenario: 2,
  surfacesPerScenario: 2,
  internalReason: "Solicitud del grupo de prueba revisada",
  databaseName: "neondb",
  roleName: "neondb_owner",
} as const;
