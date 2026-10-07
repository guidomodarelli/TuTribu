/** Preserves current messaging authority failures at the reused private ledger boundary. @module execute-messaging-ledger */
import "server-only";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";

/**
 * Translates only known access denial before the ledger classifies uncertain database commits.
 * @param execute - Original guarded checkout, executed once without retry or reconciliation.
 * @returns The original result while leaving unknown database failures available to the ledger.
 * @throws AdmissionOperationError with the original messaging authority error as its private cause.
 */
export async function executeMessagingLedger<Result>(execute: () => Promise<Result>): Promise<Result> {
  try { return await execute(); }
  catch (error) {
    if (error instanceof MessagingSecretAccessError) throw new AdmissionOperationError(error.code, { cause: error });
    throw error;
  }
}
