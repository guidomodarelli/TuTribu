/** Orchestrates one explicit original-notification recovery without retrying sends or uncertain commits. @module recover-notification-delivery-use-case */
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import type { NotificationDeliveryRecoveryInput, NotificationDeliveryRecoveryRepository } from "../../domain/repositories/notification-delivery-recovery";
import { messagingFailure } from "../results/messaging-errors";
import type { NotificationDeliveryRecoveryQuery, ResolveMessagingTribeManagementUseCase } from "./resolve-messaging-tribe-management-use-case";

/** Requests an exact original delivery, original operation/CAS and explicitly chosen replacement. */
export type RecoverNotificationDeliveryInput = NotificationDeliveryRecoveryQuery & NotificationDeliveryRecoveryInput;

/** Leaves current facts, immutable history, cancellation, usage and audit to one authoritative native writer. */
export class RecoverNotificationDeliveryUseCase<Result> {
  /**
   * @param management - Native account/leader/original-delivery scope; never a credential lookup.
   * @param repository - Atomic owner that rechecks original and replacement under locks before any effect.
   */
  constructor(
    private readonly management: Pick<ResolveMessagingTribeManagementUseCase, "execute">,
    private readonly repository: NotificationDeliveryRecoveryRepository<Result>,
  ) {}

  /**
   * Delegates once with current original-delivery authority and preserves only proven original progress.
   * @param input - Boundary-normalized explicit recovery; target IDs do not confer authority.
   * @returns The original committed result or a safe classified failure without automatic replay or RPC.
   */
  async execute(input: RecoverNotificationDeliveryInput) {
    try {
      const context = await this.management.execute(
        { tribeId: input.tribeId, deliveryId: input.deliveryId, requestId: input.requestId },
        MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification,
      );
      const intent: NotificationDeliveryRecoveryInput = {
        operationId: input.operationId,
        expectedVersion: input.expectedVersion,
        targetConnectionId: input.targetConnectionId,
        expectedTargetVersion: input.expectedTargetVersion,
        confirmed: input.confirmed,
      };
      return { ok: true as const, value: await this.repository.recover(context, intent) };
    } catch (error) {
      const known = error instanceof AdmissionOperationError || error instanceof MessagingUsageOperationError || error instanceof MessagingSecretAccessError;
      const registered = error instanceof AdmissionOperationError && error.operationId === input.operationId;
      const operationState = error instanceof AdmissionOperationError ? error.operationState : undefined;
      const proposed = error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.requestConflict
        ? MESSAGING_ERROR_CODE.deliveryConflict
        : known ? Object.values(MESSAGING_ERROR_CODE).find((code) => code === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure : MESSAGING_ERROR_CODE.unexpectedFailure;
      const code = proposed === MESSAGING_ERROR_CODE.operationUnresolved && !registered ? MESSAGING_ERROR_CODE.unexpectedFailure : proposed;
      return {
        ok: false as const,
        failure: messagingFailure(code, {
          cause: error,
          ...(registered && (code === MESSAGING_ERROR_CODE.operationUnresolved || operationState === OPERATION_STATE.completed)
            ? { operation: { operationId: input.operationId, state: operationState ?? OPERATION_STATE.started } }
            : {}),
        }),
      };
    }
  }
}
