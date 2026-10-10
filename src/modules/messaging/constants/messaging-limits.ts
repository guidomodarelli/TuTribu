/** Defines contract-owned usage ceilings; provider/platform restrictions may reduce them. */
export const MESSAGING_USAGE_LIMIT = {
  verificationDailyDefault: 100, verificationDailyMaximum: 1_000,
  notificationDailyDefault: 200, notificationDailyMaximum: 5_000,
  accountFailuresHourly: 10, accountFailuresDaily: 20,
  codeRequestsHourly: 5, codeRequestsDaily: 20,
  diagnosticPerChannelHourly: 3, diagnosticPerTribeDaily: 10,
  credentialValidationsHourly: 10,
} as const;
export const MESSAGING_USAGE_POLICY_STATE = { notConfigured: "not_configured", configured: "configured" } as const;
