/** Reserves non-message validation usage before a caller may access the provider. @module reserve-messaging-usage-use-case */
import type { CredentialValidationBudget, CredentialValidationBudgetCommand, CredentialValidationBudgetResult } from "@/src/modules/messaging/domain/repositories/credential-validation-budget";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Message-send reservations remain atomic with their delivery marker in the delivery owner. */
export class ReserveMessagingUsageUseCase {
  /** @param validations - Current-authority, committing credential-check budget that rechecks the live session under SQL locks. */
  constructor(private readonly validations: CredentialValidationBudget) {}

  /**
   * Reserves the human validation category without invoking an SDK or loading a credential.
   * @param command - Server-derived context and original backend operation id.
   * @returns A fresh reservation, historical accounting without RPC permission, or a safe denial.
   * @throws A private persistence error whose actual cause must be logged by its response owner.
   */
  async execute(command: CredentialValidationBudgetCommand): Promise<CredentialValidationBudgetResult> {
    const { context } = command;
    if (context.authorizationPurpose !== MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader
      || context.operation !== REAUTHENTICATION_OPERATION.validateMessagingConnection
      || context.resourceId !== context.connectionId) return { outcome: "denied", code: MESSAGING_ERROR_CODE.permissionDenied };
    // The budget owner rechecks the live session, leadership and resource under its own locks.
    return this.validations.reserve(command);
  }
}
