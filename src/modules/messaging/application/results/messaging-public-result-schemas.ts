/** Validates own usage DTOs for responses, props and consumers; absence has no fabricated version. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_USAGE_LIMIT, MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "./messaging-usage-policy-result";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { MessagingPublicError } from "./messaging-errors";

export { messagingConnectionSchema, providerResourcePageSchema, verificationChallengeSchema, verificationResultSchema, messageDeliverySchema } from "./messaging-flow-result-schemas";
export type { MessagingConnectionDto, ProviderResourcePageDto, VerificationChallengeDto, VerificationResultDto } from "./messaging-flow-result-schemas";

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

/** Existing versioned policy and missing-resource state are separate own DTOs. */
export type MessagingUsagePolicyDto = z.infer<typeof messagingUsagePolicySchema>;
export type MessagingUsagePolicyStateDto = z.infer<typeof messagingUsagePolicyStateSchema>;

/** Error DTOs contain only catalogue copy and progress already authorized by its owner. */
export const messagingPublicErrorSchema = z.object({
  code: z.enum(MESSAGING_ERROR_CODE), message: z.string(), requestId: z.string().min(1),
  retryAt: z.iso.datetime({ offset: true }).optional(),
  operation: z.object({ operationId: z.uuid(), state: z.enum(OPERATION_STATE) }).optional(),
}).refine((error) => error.message === MESSAGING_ERROR_MESSAGE[error.code])
  .refine((error) => error.code !== MESSAGING_ERROR_CODE.operationUnresolved || error.operation !== undefined) satisfies z.ZodType<MessagingPublicError>;
