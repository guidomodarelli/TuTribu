/** Exposes only an original actor-owned recovery result without retry, keyrings or provider RPC. @module notification-recovery-operation-handler */
import "server-only";
import type { ReadNotificationRecoveryOperationUseCase } from "../../application/use-cases/read-notification-recovery-operation-use-case";
import type { NotificationDeliveryRecoveryServices } from "./notification-delivery-recovery-handler";
import { notificationRecoveryOperationSchema } from "../../constants/notification-delivery-recovery-schema";
import { notificationRecoveryOperationParamsSchema, notificationRecoveryEmptyQuerySchema, NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION } from "../../constants/notification-delivery-recovery-http";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingFailure } from "../../application/results/messaging-errors";
import { createMessagingRouteBoundary } from "./messaging-route-http";

/** @param open - Current native readonly services after own input validation. @returns Original no-store metadata, with no new claim or provider request. */
export function createNotificationRecoveryOperationHandler(open: () => Promise<{ operation: Pick<ReadNotificationRecoveryOperationUseCase, "execute">; resolveTribe: NotificationDeliveryRecoveryServices["resolveTribe"] }>) {
  /** @param request - Original UUID lookup without authority query fields. @param context - Framework own tribe/operation route scope. @returns Only this actor's original registered progress or completed result. */
  return async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation: NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION.readOperation });
    try {
      const params = boundary.input("params", notificationRecoveryOperationParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", notificationRecoveryEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const routing = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!routing.ok) return boundary.failure(messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === routing.failure.code) ?? MESSAGING_ERROR_CODE.resourceUnavailable));
      const outcome = await services.operation.execute({ tribeId: routing.value.tribeId, operationId: params.value.operationId, requestId });
      if (!outcome.ok) return boundary.failure(outcome.failure);
      const parsed = notificationRecoveryOperationSchema.safeParse(outcome.value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== params.value.operationId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(notificationRecoveryOperationSchema, parsed.data);
    } catch (error) { return boundary.unexpected(error); }
  };
}
