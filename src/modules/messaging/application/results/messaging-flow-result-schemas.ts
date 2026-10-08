/** Defines own connection/transport/verification/resource DTOs with minimal authorized facts. @module messaging-flow-result-schemas */
import { z } from "zod";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_GENERIC_CREDENTIAL_MASK, MESSAGING_CREDENTIAL_PUBLIC_STATE, MESSAGING_CAPABILITY_PUBLIC_STATE, MESSAGING_RESOURCE_READINESS, MESSAGING_INITIAL_PROVIDER_ID, MESSAGING_VERIFICATION_RESULT } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { contactVerificationChallengeSchema, admissionVerifiedContactSchema } from "@/src/modules/academy-admissions/application/results/admission-contact-verification-schemas";

/** Own capabilities contain prepared state/times, never a SDK sender/project/team record. */
const capabilitySchema = z.object({ channel: z.enum(MESSAGING_PUBLIC_CHANNEL), state: z.enum(MESSAGING_CAPABILITY_PUBLIC_STATE), checkedAt: z.iso.datetime({ offset: true }).nullable(), testedAt: z.iso.datetime({ offset: true }).nullable() });
/** Leader connection metadata cannot return credential material, private references or provider administrative payloads. */
export const messagingConnectionSchema = z.object({
  id: z.uuid(), providerId: z.literal(MESSAGING_INITIAL_PROVIDER_ID), version: z.int().positive(), state: z.enum(MESSAGING_CONNECTION_STATE),
  maskedCredential: z.literal(MESSAGING_GENERIC_CREDENTIAL_MASK), credentialState: z.enum(MESSAGING_CREDENTIAL_PUBLIC_STATE), environment: z.string().min(1),
  capabilities: z.array(capabilitySchema), requirements: z.array(z.enum(MESSAGING_ERROR_CODE)), validatedAt: z.iso.datetime({ offset: true }).nullable(),
  consumption: z.object({ verificationToday: z.int().nonnegative(), notificationToday: z.int().nonnegative() }),
});
/** An own resource page maps only authorized references/labels and readiness, not entire SDK objects. */
export const providerResourcePageSchema = z.object({ items: z.array(z.object({ id: z.string().min(1), label: z.string(), channels: z.array(z.enum(MESSAGING_PUBLIC_CHANNEL)), readiness: z.enum(MESSAGING_RESOURCE_READINESS), category: z.string().optional(), language: z.string().optional() })).max(ADMISSION_QUERY_LIMIT.maximumPageSize), nextCursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).optional() });
/** Code possession and transport remain separate; no code, MAC or envelope belongs in this response. */
export const verificationChallengeSchema = contactVerificationChallengeSchema;
/** A diagnostic cannot create an admission proof; the purpose selects disjoint local result fields. */
export const verificationResultSchema = z.discriminatedUnion("purpose", [
  admissionVerifiedContactSchema,
  z.object({ purpose: z.literal(ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic), result: z.literal(MESSAGING_VERIFICATION_RESULT), diagnosticId: z.uuid(), connectionVersion: z.int().positive(), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), proofId: z.never().optional(), applyBefore: z.never().optional() }),
]);
/** Transport read models never authorize contact verification or reveal a message body. */
export const messageDeliverySchema = z.object({ id: z.uuid(), state: z.enum(MESSAGE_DELIVERY_STATE), purpose: z.enum([ADMISSION_VERIFICATION_PURPOSE.admission, ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic, "admission_notification"]), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), createdAt: z.iso.datetime({ offset: true }), safeReason: z.enum(MESSAGING_ERROR_CODE).optional() });

/** Own parsed DTOs consumed by props and browser adapters. */
export type MessagingConnectionDto = z.infer<typeof messagingConnectionSchema>;
export type ProviderResourcePageDto = z.infer<typeof providerResourcePageSchema>;
export type VerificationChallengeDto = z.infer<typeof verificationChallengeSchema>;
export type VerificationResultDto = z.infer<typeof verificationResultSchema>;
