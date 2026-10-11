/** Exposes only bounded current leader notification metadata through an owned no-store boundary. @module notification-delivery-catalog-handler */
import "server-only";
import type { ReadNotificationDeliveryCatalogUseCase } from "../../application/use-cases/read-notification-delivery-catalog-use-case";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { notificationDeliveryCatalogQuerySchema, notificationDeliveryCatalogSchema, NOTIFICATION_DELIVERY_CATALOG_HTTP } from "../../constants/notification-delivery-catalog";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingFailure } from "../../application/results/messaging-errors";
import { createMessagingRouteBoundary } from "./messaging-route-http";
import { messagingTribeParamsSchema } from "./messaging-request-schemas";

/** Routing resolves only a canonical tribe; the reader independently owns actual leader visibility. */
export type NotificationDeliveryCatalogServices = { catalog: Pick<ReadNotificationDeliveryCatalogUseCase, "execute">; resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> } };
/** @param open - Own services after once-only public input validation. @returns Current metadata without recency, keys, provider queries or automatic creation. */
export function createNotificationDeliveryCatalogHandler(open: () => Promise<NotificationDeliveryCatalogServices>) {
  /** @param request - Current native session and untrusted cursor. @param context - Exact framework tribe route. @returns Safe current page or localized denial. */
  return async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation: NOTIFICATION_DELIVERY_CATALOG_HTTP.operation });
    try {
      const params = boundary.input("params", messagingTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", notificationDeliveryCatalogQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const routing = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!routing.ok) return boundary.failure(messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === routing.failure.code) ?? MESSAGING_ERROR_CODE.resourceUnavailable));
      const cursor = query.value.cursorId && query.value.cursorCreatedAt ? { deliveryId: query.value.cursorId, createdAt: query.value.cursorCreatedAt } : null;
      const outcome = await services.catalog.execute({ tribeId: routing.value.tribeId, requestId, cursor });
      return outcome.ok ? boundary.success(notificationDeliveryCatalogSchema, outcome.value) : boundary.failure(outcome.failure);
    } catch (error) { return boundary.unexpected(error); }
  };
}
