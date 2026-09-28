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
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";

const WEBHOOK_FIELD = {
  action: "action",
  userId: "user_id",
  data: "data",
  dataIdQuery: "data.id",
  dataIdUrlQuery: "data.id_url",
  id: "id",
  resource: "resource",
  topic: "topic",
  type: "type",
} as const;

const WEBHOOK_TOPIC = {
  subscriptionAuthorizedPaymentPrefix: "subscription_authorized_payment",
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
  ignoredMessage: "Mercado Pago webhook ignored",
  invalidMessage: "Mercado Pago webhook rejected",
  operation: "mercado-pago-webhook",
  processedMessage: "Mercado Pago webhook processed",
  retryableMessage: "Mercado Pago webhook retry requested",
} as const;

const WEBHOOK_LOG_LEVEL = {
  warn: "warn",
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
 * Determines whether the webhook topic is a recurring invoice (authorized
 * payment). Academy coverage is derived from these invoices.
 *
 * @param topic - Mercado Pago action, type, or topic field.
 * @returns Whether the topic should be handled by the academy invoice use case.
 */
function isAuthorizedPaymentWebhookTopic(topic: string): boolean {
  return topic.startsWith(WEBHOOK_TOPIC.subscriptionAuthorizedPaymentPrefix);
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
  const routeObservation = createRouteObservation({
    feature: WEBHOOK_LOG.feature,
    operation: WEBHOOK_LOG.operation,
    request,
  });
  const { requestId } = routeObservation;
  let eventId = requestId;
  let resourceId = "";
  let topic = "";

  try {
    const requestUrl = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    eventId = readScalarString(body[WEBHOOK_FIELD.id]) || requestId;
    resourceId = readResourceId(requestUrl, body);
    topic = readWebhookTopic(body);

    if (!resourceId || !topic) {
      return routeObservation.createJsonResponse(
        { message: WEBHOOK_RESPONSE.invalidMessage },
        HTTP_STATUS.badRequest,
        {
          message: WEBHOOK_LOG.invalidMessage,
          metadata: {
            hasEventId: Boolean(eventId),
            hasResourceId: Boolean(resourceId),
            hasTopic: Boolean(topic),
          },
          outcome: "invalid_payload",
          level: WEBHOOK_LOG_LEVEL.warn,
        }
      );
    }

    if (
      !verifyMercadoPagoWebhookSignature({
        headers: request.headers,
        resourceId,
      })
    ) {
      return routeObservation.createJsonResponse(
        { message: WEBHOOK_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized,
        {
          message: WEBHOOK_LOG.invalidMessage,
          metadata: {
            hasEventId: Boolean(eventId),
            hasResourceId: Boolean(resourceId),
            hasTopic: Boolean(topic),
          },
          outcome: "unauthorized",
          level: WEBHOOK_LOG_LEVEL.warn,
        }
      );
    }

    if (
      !isSubscriptionWebhookTopic(topic) &&
      !isSubscriptionPlanWebhookTopic(topic) &&
      !isAuthorizedPaymentWebhookTopic(topic)
    ) {
      return routeObservation.createJsonResponse(
        { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed },
        HTTP_STATUS.ok,
        {
          message: WEBHOOK_LOG.ignoredMessage,
          metadata: {
            eventId,
            resourceId,
            topic,
          },
          outcome: "ignored_topic",
        }
      );
    }

    const modules = await createRequestModules({
      mercadoPagoWebhookVerified: true,
      requestId,
    });

    if (isAuthorizedPaymentWebhookTopic(topic)) {
      // The notification only names the invoice: the use case reads it
      // server-to-server and reconciles the whole academy subscription.
      const result =
        await modules.subscriptions.useCases.handleAcademyAuthorizedPaymentWebhook({
          correlationId: requestId,
          providerAccountId: readScalarString(body[WEBHOOK_FIELD.userId]) || null,
          resourceId,
        });

      return routeObservation.createJsonResponse(
        result.status === "retryable"
          ? { message: WEBHOOK_RESPONSE.unexpectedMessage }
          : { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed },
        result.status === "retryable" ? HTTP_STATUS.serviceUnavailable : HTTP_STATUS.ok,
        {
          message:
            result.status === "retryable"
              ? WEBHOOK_LOG.retryableMessage
              : WEBHOOK_LOG.processedMessage,
          metadata: { eventId, resourceId, result: result.status, topic },
          outcome: result.status,
          ...(result.status === "retryable" ? { level: WEBHOOK_LOG_LEVEL.warn } : {}),
        }
      );
    }

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
        return routeObservation.createJsonResponse(
          { message: WEBHOOK_RESPONSE.unexpectedMessage },
          HTTP_STATUS.serviceUnavailable,
          {
            message: WEBHOOK_LOG.retryableMessage,
            metadata: {
              eventId,
              resourceId,
              result: result.status,
              topic,
            },
            outcome: result.status,
            level: WEBHOOK_LOG_LEVEL.warn,
          }
        );
      }

      return routeObservation.createJsonResponse(
        { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed },
        HTTP_STATUS.ok,
        {
          message: WEBHOOK_LOG.processedMessage,
          metadata: {
            eventId,
            resourceId,
            result: result.status,
            topic,
          },
          outcome: result.status,
        }
      );
    }

    const result =
      await modules.subscriptions.useCases.handleMercadoPagoSubscriptionWebhook({
        eventId,
        resourceId,
        topic,
      });

    // Academy subscriptions: a recurrence change may come with new invoices.
    // Best effort; a failure never blocks the membership webhook contract.
    await Promise.resolve()
      .then(() =>
        modules.subscriptions.useCases.reconcileAcademySubscriptionCoverage({
          correlationId: requestId,
          providerSubscriptionId: resourceId,
        })
      )
      .catch((error: unknown) => {
        routeObservation.logRouteError({
          error,
          message: WEBHOOK_LOG.failureMessage,
          metadata: { eventId, requestId, resourceId, topic },
          outcome: "academy_reconciliation_failed",
          status: HTTP_STATUS.ok,
        });
      });

    if (result.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook) {
      return routeObservation.createJsonResponse(
        { message: WEBHOOK_RESPONSE.unexpectedMessage },
        HTTP_STATUS.serviceUnavailable,
        {
          message: WEBHOOK_LOG.retryableMessage,
          metadata: {
            eventId,
            resourceId,
            result: result.status,
            topic,
          },
          outcome: result.status,
          level: WEBHOOK_LOG_LEVEL.warn,
        }
      );
    }

    return routeObservation.createJsonResponse(
      {
        status:
          result.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook
            ? TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook
            : TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed,
      },
      HTTP_STATUS.ok,
      {
        message: WEBHOOK_LOG.processedMessage,
        metadata: {
          eventId,
          resourceId,
          result: result.status,
          topic,
        },
        outcome: result.status,
      }
    );
  } catch (error) {
    routeObservation.logRouteError({
      message: WEBHOOK_LOG.failureMessage,
      error,
      metadata: {
        eventId,
        requestId,
        resourceId,
        topic,
      },
      outcome: "error",
      status: HTTP_STATUS.serverError,
    });

    return routeObservation.createJsonResponse(
      { message: WEBHOOK_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
