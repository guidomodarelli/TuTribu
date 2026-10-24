/** Bounds actual private activity workflows without altering a product deadline. @module admission-activity-validation-constants */
export const ADMISSION_ACTIVITY_VALIDATION = {
  browserTimeoutMs: 90_000,
  sessionLifetimeMs: 3_600_000,
  evidenceLifetimeMs: 540_000,
  widths: [1280, 390],
  height: 900,
  initialVerificationLimit: 50,
  initialNotificationLimit: 100,
  foreignNotificationLimit: 789,
  reportFile: "activity-native-proof.json",
  captureFile: "activity-captures.json",
} as const;
