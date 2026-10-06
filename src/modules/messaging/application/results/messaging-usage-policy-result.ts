/** Defines own tribe usage configuration and aggregate counters without cross-account metadata. */
export type MessagingUsagePolicyResult = {
  version: number; allowedCountries: string[]; verificationDailyLimit: number; notificationDailyLimit: number;
  platformMaximums: { verificationDailyLimit: number; notificationDailyLimit: number };
  consumption: { verificationToday: number; notificationToday: number };
};
export type MessagingUsagePolicyStateResult =
  | { state: "not_configured"; policy: null }
  | { state: "configured"; policy: MessagingUsagePolicyResult };
