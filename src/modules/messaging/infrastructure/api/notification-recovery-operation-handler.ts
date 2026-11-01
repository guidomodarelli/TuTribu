/** Exposes only an original actor-owned recovery result without retry, keyrings or provider RPC. @module notification-recovery-operation-handler */
import "server-only";
import type { ReadNotificationRecoveryOperationUseCase } from "../../application/use-cases/read-notification-recovery-operation-use-case";
import type { NotificationDeliveryRecoveryServices } from "./notification-delivery-recovery-handler";
import { notificationRecoveryOperationSchema } from "../../constants/notification-delivery-recovery-schema";
import { notificationRecoveryOperationParamsSchema, notificationRecoveryEmptyQuerySchema, NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION } from "../../constants/notification-delivery-recovery-http";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingFailure, messagingTribeRoutingFailure } from "../../application/results/messaging-errors";
import { createMessagingOperationReadHandler } from "./messaging-operation-read-handler";

/** @param open - Current native readonly services after own input validation. @returns Original no-store metadata, with no new claim or provider request. */
export function createNotificationRecoveryOperationHandler(open: () => Promise<{ operation: Pick<ReadNotificationRecoveryOperationUseCase, "execute">; resolveTribe: NotificationDeliveryRecoveryServices["resolveTribe"] }>) {
  return createMessagingOperationReadHandler({
    operation: NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION.readOperation, paramsSchema: notificationRecoveryOperationParamsSchema, querySchema: notificationRecoveryEmptyQuerySchema,
    routingFailure: messagingTribeRoutingFailure,
    /** Only this actor's original registered progress or completed result. */
    respond: (boundary, value, operationId) => {
      const parsed = notificationRecoveryOperationSchema.safeParse(value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== operationId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(notificationRecoveryOperationSchema, parsed.data);
    },
  }, open);
}
