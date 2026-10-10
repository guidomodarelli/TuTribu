/** Defines the private reservation preceding a non-message provider validation. @module credential-validation-budget */
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** The original operation id is backend-owned; callers must not pass a public idempotency key. */
export type CredentialValidationBudgetCommand = { context: AuthorizedMessagingContext; operationId: string };

/** A replay describes prior accounting and never grants another provider request. */
export type CredentialValidationBudgetResult =
  | { outcome: "reserved" | "already_reserved"; operationId: string; reservedAt: Date }
  | { outcome: "denied"; code: (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE] };

/** Each call returns only after the current-authority transaction commits or rolls back. */
export interface CredentialValidationBudget {
  /**
   * @param command - Exact private human/resource/operation identity.
   * @returns New confirmed accounting, historical accounting, or a closed denial.
   * @throws A private typed error when persistence cannot be confirmed.
   */
  reserve(command: CredentialValidationBudgetCommand): Promise<CredentialValidationBudgetResult>;
}
