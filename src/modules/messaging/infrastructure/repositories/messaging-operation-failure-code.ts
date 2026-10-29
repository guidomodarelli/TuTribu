/** Guarded per-context checkout and closed failure codes shared by the messaging connection repositories. @module messaging-operation-failure-code */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingErrorCode } from "../../application/results/messaging-errors";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";

/** Runs one callback in a short protected native transaction bound to the given current context. */
export type MessagingContextDatabaseExecutor<Context> = <Result>(context: Context, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** @param error - Ledger failure. @returns Its code when it is a messaging code, otherwise an unexpected failure. */
export function closedAdmissionFailureCode(error: AdmissionOperationError): MessagingErrorCode {
  return Object.values(MESSAGING_ERROR_CODE).find((candidate) => candidate === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure;
}

/** @param error - Failure of a connection operation. @returns Its messaging code when known, incomplete for unusable sealing keys, otherwise an unexpected failure. */
export function knownConnectionFailureCode(error: unknown): MessagingErrorCode {
  if (error instanceof AdmissionOperationError) return closedAdmissionFailureCode(error);
  return error instanceof MessagingCryptographyError ? MESSAGING_ERROR_CODE.connectionIncomplete : MESSAGING_ERROR_CODE.unexpectedFailure;
}
