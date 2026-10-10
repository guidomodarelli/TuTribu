/** Reserves non-message validation usage before a caller may access the provider. @module reserve-messaging-usage-use-case */
import type { CredentialValidationBudget, CredentialValidationBudgetCommand, CredentialValidationBudgetResult } from "@/src/modules/messaging/domain/repositories/credential-validation-budget";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Message-send reservations remain atomic with their delivery marker in the delivery owner. */
export class ReserveMessagingUsageUseCase {
  /**
   * @param validations - Current-authority, committing credential-check budget.
   * @param clock - Fresh application time; SQL independently checks all current lifetimes.
   */
  constructor(private readonly validations: CredentialValidationBudget, private readonly clock: () => Date) {}

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
    const now = this.clock();
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(context.authenticatedAt.getTime())
      || !Number.isFinite(context.validUntil.getTime()) || context.authenticatedAt > now
      || context.validUntil <= now) return { outcome: "denied", code: MESSAGING_ERROR_CODE.reauthenticationRequired };
    const result = await this.validations.reserve(command);
    // A confirmed slot remains spent even if authority expires while its response returns.
    const after = this.clock();
    if (result.outcome === "reserved" && (!Number.isFinite(after.getTime()) || context.validUntil <= after)) {
      return { outcome: "denied", code: MESSAGING_ERROR_CODE.reauthenticationRequired };
    }
    return result;
  }
}
