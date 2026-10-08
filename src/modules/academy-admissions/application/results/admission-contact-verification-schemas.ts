/** Owns public local contact challenge and admission proof contracts shared by issuance and recovery. @module admission-contact-verification-schemas */
import { z } from "zod";
import type { AdmissionChallengeSnapshot, AdmissionChallengeVerificationSnapshot } from "../../domain/repositories/admission-contact-verification";
import { ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { ADMISSION_MASK_MARKER_PATTERN } from "../../constants/admission-public-contract";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { VERIFICATION_TRANSITION_OUTCOME } from "../../constants/verification-challenge";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_VERIFICATION_RESULT } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";

/** Code possession and transport remain separate; no raw destination, code, MAC or envelope belongs in this response. */
export const contactVerificationChallengeSchema = z.object({ challengeId: z.uuid(), purpose: z.enum(ADMISSION_VERIFICATION_PURPOSE), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), maskedDestination: z.string().min(1).regex(ADMISSION_MASK_MARKER_PATTERN), expiresAt: z.iso.datetime({ offset: true }), resendAllowedAt: z.iso.datetime({ offset: true }), deliveryState: z.enum(MESSAGE_DELIVERY_STATE), allowedAlternative: z.literal(MESSAGING_PUBLIC_CHANNEL.sms).optional() });
/** Admission callers can recover only their own fixed-purpose challenge snapshot. */
export const admissionChallengeSnapshotSchema = contactVerificationChallengeSchema.extend({ purpose: z.literal(ADMISSION_VERIFICATION_PURPOSE.admission) }) satisfies z.ZodType<AdmissionChallengeSnapshot>;
/** Local verification provides an opaque proof with its original application deadline. */
export const admissionVerifiedContactSchema = z.object({ purpose: z.literal(ADMISSION_VERIFICATION_PURPOSE.admission), result: z.literal(MESSAGING_VERIFICATION_RESULT), proofId: z.uuid(), applyBefore: z.iso.datetime({ offset: true }) });
/** A denied attempt remains committed so recovery cannot repeat its failure accounting. */
export const admissionChallengeVerificationSnapshotSchema = z.union([admissionVerifiedContactSchema, z.object({ purpose: z.literal(ADMISSION_VERIFICATION_PURPOSE.admission), result: z.literal(VERIFICATION_TRANSITION_OUTCOME.denied), code: z.enum(ADMISSION_ERROR_CODE) })]) satisfies z.ZodType<AdmissionChallengeVerificationSnapshot>;
