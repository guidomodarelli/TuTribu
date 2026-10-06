/** Validates own messaging configuration inputs without a connection or a second country owner. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_INPUT_CATEGORY } from "@/src/modules/messaging/constants/messaging-input";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";

const operationFields = {
  operationId: z.uuid({ error: MESSAGING_INPUT_CATEGORY.operation }),
  confirmed: z.literal(true, { error: MESSAGING_INPUT_CATEGORY.confirmation }),
};
const countrySchema = z.string().trim().toUpperCase().refine((country) => isSupportedCountry(country as CountryCode), { error: MESSAGING_INPUT_CATEGORY.country });
const usageFields = {
  allowedCountries: z.array(countrySchema).refine((countries) => new Set(countries).size === countries.length, { error: MESSAGING_INPUT_CATEGORY.duplicateCountries }),
  verificationDailyLimit: z.int().min(0).max(MESSAGING_USAGE_LIMIT.verificationDailyMaximum, { error: MESSAGING_INPUT_CATEGORY.quota }),
  notificationDailyLimit: z.int().min(0).max(MESSAGING_USAGE_LIMIT.notificationDailyMaximum, { error: MESSAGING_INPUT_CATEGORY.quota }),
};

/** Explicit initialization uses only server defaults; country/quota edits require a later versioned PUT. */
export const messagingUsagePolicyCreateSchema = z.strictObject({ ...operationFields });

/** Countries are configurable before a connection; actual restrictions are rechecked by the writer/dispatcher. */
export const messagingUsagePolicyUpdateSchema = z.strictObject({
  ...operationFields, ...usageFields,
  expectedVersion: z.int({ error: MESSAGING_INPUT_CATEGORY.version }).positive({ error: MESSAGING_INPUT_CATEGORY.version }),
});
