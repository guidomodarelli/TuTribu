/**
 * Handles Mercado Pago subscription webhook notifications.
 *
 * @module mercado-pago-webhooks-route
 */

import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { verifyMercadoPagoWebhookSignature } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-webhook-signature";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const WEBHOOK_FIELD = {
  action: "action",
  data: "data",
  dataIdQuery: "data.id",
  dataIdUrlQuery: "data.id_url",
  id: "id",
  resource: "resource",
  topic: "topic",
  type: "type",
} as const;

const WEBHOOK_TOPIC = {
  subscriptionPreapprovalPlanPrefix: "subscription_preapproval_plan",
  subscriptionPreapprovalPrefix: "subscription_preapproval",
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
 * Reads a scalar string value from webhook payloads.
 *
 * @param value - Unknown payload value.
 * @returns String or numeric value as a string, or empty string.
 */
function readScalarString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

/**
 * Normalizes Mercado Pago resource identifiers for signature verification.
 *
 * @param resourceId - Resource identifier received from Mercado Pago.
 * @returns Lowercase resource identifier.
 */
function normalizeResourceId(resourceId: string): string {
  return resourceId.trim().toLowerCase();
}

/**
 * Extracts the signed Mercado Pago resource identifier from URL or body data.
 *
 * @param requestUrl - Webhook request URL.
 * @param body - Parsed webhook body.
 * @returns Resource identifier.
 */
function readResourceId(requestUrl: URL, body: Record<string, unknown>): string {
  const dataIdFromUrl =
    requestUrl.searchParams.get(WEBHOOK_FIELD.dataIdQuery) ??
    requestUrl.searchParams.get(WEBHOOK_FIELD.dataIdUrlQuery);

  if (dataIdFromUrl) {
    return normalizeResourceId(dataIdFromUrl);
  }

  const data = body[WEBHOOK_FIELD.data];

  if (data && typeof data === "object" && WEBHOOK_FIELD.id in data) {
    return normalizeResourceId(
      readScalarString((data as Record<string, unknown>)[WEBHOOK_FIELD.id])
    );
  }

  return normalizeResourceId(readScalarString(body[WEBHOOK_FIELD.resource]));
}

/**
 * Determines whether the webhook topic belongs to Mercado Pago subscriptions.
 *
 * @param topic - Mercado Pago action, type, or topic field.
 * @returns Whether the topic should be handled by the subscription use case.
 */
function isSubscriptionWebhookTopic(topic: string): boolean {
  return topic.startsWith(WEBHOOK_TOPIC.subscriptionPreapprovalPrefix);
}

/**
 * Determines whether the webhook topic belongs to Mercado Pago subscription plans.
 *
 * @param topic - Mercado Pago action, type, or topic field.
 * @returns Whether the topic should be handled by the provider plan use case.
 */
function isSubscriptionPlanWebhookTopic(topic: string): boolean {
  return topic.startsWith(WEBHOOK_TOPIC.subscriptionPreapprovalPlanPrefix);
}

/**
 * Determines whether a provider plan webhook should be retried by Mercado Pago.
 *
 * @param status - Subscription price synchronization result status.
 * @returns Whether the webhook did not reach the provider-backed sync boundary.
 */
function isRetryableSubscriptionPlanSyncStatus(status: string): boolean {
  return (
    status === TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration ||
    status === TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired
  );
}

/**
 * Resolves the Mercado Pago topic field without letting generic actions hide it.
 *
 * @param body - Parsed webhook body.
 * @returns Provider topic value used for subscription routing.
 */
function readWebhookTopic(body: Record<string, unknown>): string {
  const type = readScalarString(body[WEBHOOK_FIELD.type]);
  const topic = readScalarString(body[WEBHOOK_FIELD.topic]);
  const action = readScalarString(body[WEBHOOK_FIELD.action]);

  return type || topic || action;
}

export async function POST(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: WEBHOOK_LOG.feature,
    operation: WEBHOOK_LOG.operation,
    requestId,
  });

  try {
    const requestUrl = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const eventId = readScalarString(body[WEBHOOK_FIELD.id]) || requestId;
    const resourceId = readResourceId(requestUrl, body);
    const topic = readWebhookTopic(body);

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

    if (
      !isSubscriptionWebhookTopic(topic) &&
      !isSubscriptionPlanWebhookTopic(topic)
    ) {
      return Response.json(
        { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed },
        { status: HTTP_STATUS.ok }
      );
    }

    const modules = await createRequestModules({
      mercadoPagoWebhookVerified: true,
    });
    if (isSubscriptionPlanWebhookTopic(topic)) {
      const result =
        await modules.subscriptions.useCases.syncMercadoPagoSubscriptionProviderPlanWebhook(
          {
            eventId,
            resourceId,
            topic,
          }
        );

      if (isRetryableSubscriptionPlanSyncStatus(result.status)) {
        return Response.json(
          { message: WEBHOOK_RESPONSE.unexpectedMessage },
          { status: HTTP_STATUS.serviceUnavailable }
        );
      }

      return Response.json(
        { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed },
        { status: HTTP_STATUS.ok }
      );
    }

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
