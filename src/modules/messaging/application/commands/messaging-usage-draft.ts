/** Represents editable browser input separately from persisted version, consumption and platform limits. @module messaging-usage-draft */
export type MessagingUsageDraft = { allowedCountries: string[]; verificationDailyLimit: string; notificationDailyLimit: string };
/** Standard country choices are presentation data; their presence never proves provider support. */
export type MessagingUsageCountryChoice = { value: string; label: string };
