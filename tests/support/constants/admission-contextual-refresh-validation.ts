/** Bounds isolated real-clock browser validation without changing admission or messaging limits. @module admission-contextual-refresh-validation */
export const ADMISSION_CONTEXTUAL_REFRESH_VALIDATION = {
  testTimeoutMs: 600_000,
  responseTimeoutMs: 35_000,
  ownReconciliationStartTimeoutMs: 3_000,
  pauseObservationMs: 16_000,
  terminalObservationMs: 16_000,
  artifactEnvironment: "ADMISSION_CONTEXTUAL_REFRESH_ARTIFACT_ROOT",
  noticeCaptureFile: "contextual-notice-captures.json",
  ownCaptureFile: "contextual-own-request-captures.json",
  batchCaptureFile: "contextual-batch-review-captures.json",
  focusFixturePath: "/__admission-native-focus-fixture",
  focusOutsideLabel: "Control externo a la aplicación",
  focusFrameTitle: "Aplicación real para verificar foco",
  incomingApplicantName: "Nueva persona solicitante",
  transientWarning: "No pudimos actualizar tus avisos. Mostramos la última información disponible.",
} as const;
