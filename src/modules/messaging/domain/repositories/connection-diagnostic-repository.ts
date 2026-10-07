/** Defines local diagnostic confirmation without persistence, cryptography or provider DTOs. @module connection-diagnostic-repository */
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Binds an exact received code and diagnostic to the caller's durable original operation. */
export type VerifyConnectionDiagnosticCommand = {
  context: AuthorizedMessagingContext;
  diagnosticId: string;
  operationId: string;
  ledgerId: string;
  code: string;
};

/** Keeps local code evidence distinct from admission proofs and current provider availability. */
export type ConnectionDiagnosticVerificationResult =
  | { outcome: "denied"; code: (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE] }
  | { outcome: "verified"; diagnosticId: string; connectionVersion: number; channel: "email" | "sms" | "whatsapp"; validatedAt: Date; capabilityState: "prepared" | "unavailable" };

/** Shares the code primitive while preserving messaging's diagnostic/capability ownership. */
export interface ConnectionDiagnosticVerifier {
  /**
   * Confirms the exact local diagnostic and code/capability effects in the same transaction.
   * @param command - Original operation and currently authorized sensitive-leader resource.
   * @returns A minimal stored outcome, confirmed only by the caller's commit.
   */
  verify(command: VerifyConnectionDiagnosticCommand): Promise<ConnectionDiagnosticVerificationResult>;
}

/** Binds the caller's public snapshot to original-intent recovery before repeating local verification. */
export interface ConnectionDiagnosticOperations<Result> {
  /**
   * Recovers the original operation before any new code/challenge/capability mutation.
   * @param command - Current private leader context and boundary-validated original verification intent.
   * @returns A confirmed historical snapshot or genuinely registered unfinished operation.
   */
  verify(command: Omit<VerifyConnectionDiagnosticCommand, "ledgerId">): Promise<AdmissionOperationResult<Result>>;
}
