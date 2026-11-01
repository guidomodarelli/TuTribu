/** Exposes one explicit original notification recovery with safe minimum results and no provider send. @module notification-delivery-recovery-handler */
import "server-only";
import type { RecoverNotificationDeliveryUseCase } from "../../application/use-cases/recover-notification-delivery-use-case";
import type { NotificationDeliveryRecoveryResult } from "../../application/results/notification-delivery-recovery-result";
import { notificationDeliveryRecoveryResultSchema } from "../../constants/notification-delivery-recovery-schema";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { notificationDeliveryRecoveryInputSchema, notificationRecoveryEmptyQuerySchema, NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION } from "../../constants/notification-delivery-recovery-http";
import { messagingFailure, messagingTribeRoutingFailure } from "../../application/results/messaging-errors";
import { createMessagingRouteBoundary, messagingOperationHttpStatus } from "./messaging-route-http";
import { messagingDeliveryParamsSchema } from "./messaging-request-schemas";

/** Composition roots expose only current routing and the original DB-only mutation. */
export type NotificationDeliveryRecoveryServices = {
  recovery: Pick<RecoverNotificationDeliveryUseCase<NotificationDeliveryRecoveryResult>, "execute">;
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Actual native services, opened only after boundary input and origin validation. @returns One explicit no-store recovery mutation without SDK dispatch or caller authority fields. */
export function createNotificationDeliveryRecoveryHandler(open: () => Promise<NotificationDeliveryRecoveryServices>) {
  /** @param request - Once-validated explicit replacement intent. @param context - Framework original-delivery route scope. @returns Confirmed original result, genuinely registered progress or a safe current failure. */
  return async function POST(request: Request, context: { params: Promise<{ slug: string; deliveryId: string }> }): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation: NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION.recover });
    try {
      if (!hasAllowedRequestOrigin(request)) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", messagingDeliveryParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", notificationRecoveryEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(notificationDeliveryRecoveryInputSchema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const routing = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!routing.ok) return boundary.failure(messagingTribeRoutingFailure(routing.failure));
      // The validated single cause is recorded by the native writer; it grants no readiness or retry authority.
      const outcome = await services.recovery.execute({
        tribeId: routing.value.tribeId, deliveryId: params.value.deliveryId, requestId,
        operationId: body.value.operationId, expectedVersion: body.value.expectedVersion,
        targetConnectionId: body.value.targetConnectionId, expectedTargetVersion: body.value.expectedTargetVersion,
        confirmed: body.value.confirmed,
      });
      if (!outcome.ok) {
        if (outcome.failure.operation && outcome.failure.operation.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        return boundary.failure(outcome.failure);
      }
      const schema = createAdmissionOperationStateSchema(notificationDeliveryRecoveryResultSchema);
      const parsed = schema.safeParse(outcome.value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if (parsed.data.state === OPERATION_STATE.completed) {
        const result = parsed.data.result;
        if (result.originalDeliveryId.toLowerCase() !== params.value.deliveryId.toLowerCase() || result.targetConnectionId.toLowerCase() !== body.value.targetConnectionId.toLowerCase() || result.originalVersion !== body.value.expectedVersion + 1 || result.recoveryDeliveryId.toLowerCase() === result.originalDeliveryId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      }
      return boundary.success(schema, parsed.data, messagingOperationHttpStatus(parsed.data.state));
    } catch (error) { return boundary.unexpected(error); }
  };
}
