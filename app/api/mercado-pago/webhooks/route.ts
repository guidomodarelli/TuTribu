/**
 * Handles Mercado Pago subscription webhook notifications.
 *
 * @module mercado-pago-webhooks-route
 */

import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { verifyMercadoPagoWebhookSignature } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-webhook-signature";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const WEBHOOK_FIELD = {
  action: "action",
  data: "data",
  id: "id",
  resource: "resource",
  topic: "topic",
  type: "type",
} as const;

const WEBHOOK_RESPONSE = {
  invalidMessage: "Webhook inválido.",
  unauthorizedMessage: "Webhook no autorizado.",
  unexpectedMessage: "No pudimos procesar el webhook.",
} as const;

const WEBHOOK_LOG = {
  failureMessage: "Mercado Pago webhook handling failed",
  feature: "subscriptions",
  operation: "mercado-pago-webhook",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

/**
 * Reads a string value from webhook payloads.
 *
 * @param value - Unknown payload value.
 * @returns String value or empty string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Extracts a nested data identifier from Mercado Pago webhook payloads.
 *
 * @param body - Parsed webhook body.
 * @returns Resource identifier.
 */
function readResourceId(body: Record<string, unknown>): string {
  const data = body[WEBHOOK_FIELD.data];

  if (data && typeof data === "object" && WEBHOOK_FIELD.id in data) {
    return readString((data as Record<string, unknown>)[WEBHOOK_FIELD.id]);
  }

  return readString(body[WEBHOOK_FIELD.resource]);
}

export async function POST(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: WEBHOOK_LOG.feature,
    operation: WEBHOOK_LOG.operation,
    requestId,
  });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const eventId = readString(body[WEBHOOK_FIELD.id]) || requestId;
    const resourceId = readResourceId(body);
    const topic =
      readString(body[WEBHOOK_FIELD.action]) ||
      readString(body[WEBHOOK_FIELD.type]) ||
      readString(body[WEBHOOK_FIELD.topic]);

    if (!resourceId || !topic) {
      return Response.json(
        { message: WEBHOOK_RESPONSE.invalidMessage },
        { status: HTTP_STATUS.badRequest }
      );
    }

    if (
      !verifyMercadoPagoWebhookSignature({
        headers: request.headers,
        resourceId,
      })
    ) {
      return Response.json(
        { message: WEBHOOK_RESPONSE.unauthorizedMessage },
        { status: HTTP_STATUS.unauthorized }
      );
    }

    const modules = await createRequestModules({
      mercadoPagoWebhookVerified: true,
    });
    const result =
      await modules.subscriptions.useCases.handleMercadoPagoSubscriptionWebhook({
        eventId,
        resourceId,
        topic,
      });

    if (result.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook) {
      return Response.json(
        { message: WEBHOOK_RESPONSE.unexpectedMessage },
        { status: HTTP_STATUS.serviceUnavailable }
      );
    }

    return Response.json(
      {
        status:
          result.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook
            ? TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook
            : TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed,
      },
      { status: HTTP_STATUS.ok }
    );
  } catch (error) {
    logger.error({
      message: WEBHOOK_LOG.failureMessage,
      error,
      metadata: {
        requestId,
      },
    });

    return Response.json(
      { message: WEBHOOK_RESPONSE.unexpectedMessage },
      { status: HTTP_STATUS.serverError }
    );
  }
}
