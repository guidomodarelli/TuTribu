/** Validates editable usage input and restored intentions without assigning persisted identity or counters. @module messaging-usage-browser-intent */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import type { MessagingUsageDraft } from "./messaging-usage-draft";
import type { MessagingUsagePolicyStateDto } from "../results/messaging-public-result-schemas";
import { MESSAGING_USAGE_LIMIT } from "../../constants/messaging-limits";
import { MESSAGING_USAGE_COUNT_PATTERN, MESSAGING_USAGE_RECOVERABLE_OPERATION, MESSAGING_USAGE_UI_COPY } from "../../constants/messaging-usage";

/** The browser draft is untrusted input; the server repeats its authoritative boundary validation. */
const countrySchema = z.string().trim().toUpperCase().refine((country) => isSupportedCountry(country as CountryCode));
const usageFields = { allowedCountries: z.array(countrySchema).refine((countries) => new Set(countries).size === countries.length).transform((countries) => [...countries].sort()), verificationDailyLimit: z.int().nonnegative().max(MESSAGING_USAGE_LIMIT.verificationDailyMaximum), notificationDailyLimit: z.int().nonnegative().max(MESSAGING_USAGE_LIMIT.notificationDailyMaximum) };
export const messagingUsageBrowserIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal(MESSAGING_USAGE_RECOVERABLE_OPERATION.initialize), input: z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true) }) }),
  z.strictObject({ type: z.literal(MESSAGING_USAGE_RECOVERABLE_OPERATION.update), input: z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedVersion: z.int().positive(), ...usageFields }) }),
]);
export type MessagingUsageBrowserIntent = z.infer<typeof messagingUsageBrowserIntentSchema>;

/** @param state - Current own resource or actual absence. @returns Editable defaults/data only; an absent resource has no version. */
export function createMessagingUsageDraft(state: MessagingUsagePolicyStateDto): MessagingUsageDraft {
  return { allowedCountries: [...state.policy?.allowedCountries ?? []], verificationDailyLimit: String(state.policy?.verificationDailyLimit ?? MESSAGING_USAGE_LIMIT.verificationDailyDefault), notificationDailyLimit: String(state.policy?.notificationDailyLimit ?? MESSAGING_USAGE_LIMIT.notificationDailyDefault) };
}
/** @param draft - Proposed browser strings/countries. @param state - Current own limits, never provider capabilities. @returns Normalized own settings or safe validation feedback; no write occurs. */
export function parseMessagingUsageDraft(draft: MessagingUsageDraft, state: MessagingUsagePolicyStateDto) {
  if (!MESSAGING_USAGE_COUNT_PATTERN.test(draft.verificationDailyLimit) || !MESSAGING_USAGE_COUNT_PATTERN.test(draft.notificationDailyLimit)) return { ok: false as const, message: MESSAGING_USAGE_UI_COPY.quotaInvalid };
  const result = z.strictObject(usageFields).safeParse({ allowedCountries: draft.allowedCountries, verificationDailyLimit: Number(draft.verificationDailyLimit), notificationDailyLimit: Number(draft.notificationDailyLimit) });
  if (!result.success) return { ok: false as const, message: MESSAGING_USAGE_UI_COPY.invalid };
  if (state.policy && (result.data.verificationDailyLimit > state.policy.platformMaximums.verificationDailyLimit || result.data.notificationDailyLimit > state.policy.platformMaximums.notificationDailyLimit)) return { ok: false as const, message: MESSAGING_USAGE_UI_COPY.quotaInvalid };
  return { ok: true as const, value: result.data };
}
