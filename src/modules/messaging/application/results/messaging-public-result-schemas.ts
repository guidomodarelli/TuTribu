/** Validates own usage DTOs for responses, props and consumers; absence has no fabricated version. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_USAGE_LIMIT, MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "./messaging-usage-policy-result";

const countSchema = z.int().nonnegative();
const countrySchema = z.string().refine((country) => isSupportedCountry(country as CountryCode));

/** Configuration version belongs to usage policy, separate from connection/verification epochs. */
export const messagingUsagePolicySchema = z.object({
  version: z.int().positive(), allowedCountries: z.array(countrySchema).refine((countries) => new Set(countries).size === countries.length),
  verificationDailyLimit: countSchema.max(MESSAGING_USAGE_LIMIT.verificationDailyMaximum),
  notificationDailyLimit: countSchema.max(MESSAGING_USAGE_LIMIT.notificationDailyMaximum),
  platformMaximums: z.object({ verificationDailyLimit: countSchema, notificationDailyLimit: countSchema }),
  consumption: z.object({ verificationToday: countSchema, notificationToday: countSchema }),
}) satisfies z.ZodType<MessagingUsagePolicyResult>;

export const messagingUsagePolicyStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal(MESSAGING_USAGE_POLICY_STATE.notConfigured), policy: z.null() }),
  z.object({ state: z.literal(MESSAGING_USAGE_POLICY_STATE.configured), policy: messagingUsagePolicySchema }),
]) satisfies z.ZodType<MessagingUsagePolicyStateResult>;
