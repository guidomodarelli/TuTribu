/** Projects only own minimal diagnostic facts to the durable/public result contract. @module connection-diagnostic-result */
import { z } from "zod";
import type { ConnectionDiagnosticVerificationResult } from "@/src/modules/messaging/domain/repositories/connection-diagnostic-repository";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME } from "@/src/modules/messaging/constants/connection-diagnostic";
import { VERIFICATION_CAPABILITY_STATE, VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";

/** Retains the original commit facts without claiming the current provider/resource state. */
export type ConnectionDiagnosticSnapshot =
  | Extract<ConnectionDiagnosticVerificationResult, { outcome: "denied" }>
  | (Omit<Extract<ConnectionDiagnosticVerificationResult, { outcome: "verified" }>, "validatedAt"> & { validatedAt: string });

/** Validates the owner's response/ledger field only; it is never applied to PostgreSQL rows. */
export const connectionDiagnosticSnapshotSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal(CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.denied), code: z.enum(MESSAGING_ERROR_CODE) }),
  z.strictObject({ outcome: z.literal(CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified), diagnosticId: z.uuid(), connectionVersion: z.int().positive(), channel: z.enum([VERIFICATION_EMAIL_CHANNEL, ADMISSION_PHONE_CHANNEL.sms, ADMISSION_PHONE_CHANNEL.whatsapp]), validatedAt: z.iso.datetime(), capabilityState: z.enum(VERIFICATION_CAPABILITY_STATE) }),
]) satisfies z.ZodType<ConnectionDiagnosticSnapshot>;

/**
 * Projects the own local result without context, code, contact, key material or credential metadata.
 * @param result - Stored local diagnostic outcome to be committed with its original ledger operation.
 * @returns The minimum validated public snapshot of that commit.
 */
export function projectConnectionDiagnosticSnapshot(result: ConnectionDiagnosticVerificationResult): ConnectionDiagnosticSnapshot {
  return connectionDiagnosticSnapshotSchema.parse(result.outcome === CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified ? { ...result, validatedAt: result.validatedAt.toISOString() } : result);
}
