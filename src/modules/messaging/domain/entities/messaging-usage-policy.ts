/** Models the single tribe-owned editable usage/country policy independently of consumption. @module messaging-usage-policy */
export type MessagingUsagePolicy = {
  tribeId: string; verificationDailyLimit: number; notificationDailyLimit: number; allowedCountries: readonly string[];
  platformVerificationDailyMaximum: number; platformNotificationDailyMaximum: number; version: number;
  changedByUserId: string | null; createdAt: Date; updatedAt: Date;
};
