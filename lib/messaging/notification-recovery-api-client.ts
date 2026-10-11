"use client";
/** Guards explicit notification recovery and historical original results without retrying a possible write. @module notification-recovery-api-client */
import type { NotificationRecoveryBrowserClient } from "@/src/modules/messaging/application/ports/notification-recovery-browser-client";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { notificationDeliveryRecoveryResultSchema, notificationRecoveryOperationSchema } from "@/src/modules/messaging/constants/notification-delivery-recovery-schema";
import { MESSAGING_CONNECTIONS_BROWSER_PATH } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { NOTIFICATION_RECOVERY_BROWSER_PATH } from "@/src/modules/messaging/constants/notification-recovery-browser";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createMessagingBrowserRequest, messagingBrowserFailure } from "./messaging-browser-api-client";

/** @param options - Native fetch or an owned transport boundary; construction performs no I/O. @returns Single explicit same-origin observations without provider calls, retries or route refresh. */
export function createNotificationRecoveryBrowserClient(options: { fetch?: typeof fetch } = {}): NotificationRecoveryBrowserClient {
  const request = createMessagingBrowserRequest(options.fetch);
  const recoverySchema = createAdmissionOperationStateSchema(notificationDeliveryRecoveryResultSchema);
  return {
    /** @param scope - Exact original delivery. @param input - Preserved UUID/CAS and explicit replacement. @param signal - Observation lifetime. @returns Bound original lineage or safe uncertainty, never inferred rollback. */
    async recover(scope, input, signal) {
      const path = `${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(scope.slug)}/${NOTIFICATION_RECOVERY_BROWSER_PATH.deliveries}/${encodeURIComponent(scope.deliveryId)}/${NOTIFICATION_RECOVERY_BROWSER_PATH.recover}`;
      const outcome = await request(path, recoverySchema, signal, { method: "POST", input });
      if (outcome.status !== "ready") return outcome;
      if (outcome.value.operationId.toLowerCase() !== input.operationId.toLowerCase()) return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable, true);
      if (outcome.value.state === OPERATION_STATE.completed) {
        const result = outcome.value.result;
        if (result.originalDeliveryId.toLowerCase() !== scope.deliveryId.toLowerCase()
          || result.targetConnectionId.toLowerCase() !== input.targetConnectionId.toLowerCase()
          || result.originalVersion !== input.expectedVersion + 1
          || result.recoveryDeliveryId.toLowerCase() === result.originalDeliveryId.toLowerCase()) return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable, true);
      }
      return outcome;
    },
    /** @param query - Original operation in its own route namespace. @param signal - Read lifetime. @returns Exact own metadata with no new confirmation, claim or mutation. */
    async operation(query, signal) {
      const path = `${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(query.slug)}/${NOTIFICATION_RECOVERY_BROWSER_PATH.operations}/${encodeURIComponent(query.operationId)}`;
      const outcome = await request(path, notificationRecoveryOperationSchema, signal);
      if (outcome.status !== "ready") return outcome;
      if (outcome.value.operationId.toLowerCase() !== query.operationId.toLowerCase()) return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable);
      if (outcome.value.state === OPERATION_STATE.completed
        && outcome.value.result.recoveryDeliveryId.toLowerCase() === outcome.value.result.originalDeliveryId.toLowerCase()) return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable);
      return outcome;
    },
  };
}

/** The owning route supplies current viewer checks, preserved references and renewed explicit consent. */
export const notificationRecoveryBrowserClient = createNotificationRecoveryBrowserClient();
