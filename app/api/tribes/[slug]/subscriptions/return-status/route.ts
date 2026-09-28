/**
 * Reports the status of a Mercado Pago subscription return so the return
 * screen can poll a small JSON endpoint instead of reloading the whole page.
 * It applies the same authorization and resolution as the tribe page
 * (`resolveTribePageAccess` + `resolveSubscriptionReturnOutcome`).
 *
 * @module tribe-subscription-return-status-route
 */

import type { z } from "zod";

import { resolveTribePageAccess } from "@/app/(platform)/[slug]/tribe-page-access";
import {
  SUBSCRIPTION_RETURN_OUTCOME,
  isSubscriptionRecoverableAccess,
  resolveSubscriptionReturnOutcome,
} from "@/app/(platform)/[slug]/subscription-return-outcome";
import { buildSubscriptionReturnPath } from "@/lib/subscriptions/subscription-return-path";
import { ROUTES } from "@/src/constants/routes";
import type { SubscriptionReturnStatusResult } from "@/src/modules/subscriptions/application/results/subscription-return-status-result";
import { subscriptionReturnStatusSchema } from "@/src/modules/subscriptions/application/results/subscription-return-status-public-dto-schemas";
import {
  SUBSCRIPTION_RETURN_QUERY_PARAM,
  SUBSCRIPTION_RETURN_STATUS,
} from "@/src/modules/subscriptions/constants/subscription-return-status";
import {
  subscriptionReturnStatusParamsSchema,
  subscriptionReturnStatusQuerySchema,
} from "@/src/modules/subscriptions/infrastructure/api/subscription-return-status-request-schemas";
import { redactPaymentProviderIdentifier } from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";
import { TRIBE_PAGE_ACCESS_STATUS } from "@/src/modules/tribes/application/results/tribe-page-access-result";

type ServerLogger = ReturnType<typeof createServerLogger>;

const SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG = {
  accessFailureMessage: "Subscription return status access resolution failed",
  feature: "subscriptions",
  inputRejectedMessage: "Subscription return status input rejected",
  operation: "subscription-return-status",
  operationKeySeparator: ":",
  publicDtoRejectedMessage: "Subscription return status public DTO rejected",
  publicDtoRejectedReason: "public_dto_rejected",
  resolveFailureMessage: "Subscription return status resolution failed",
  resolveFailureReason: "unexpected_subscription_return_repository_error",
} as const;

const SUBSCRIPTION_RETURN_STATUS_ROUTE_RESPONSE = {
  invalidInputMessage: "No pudimos verificar el regreso desde Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para confirmar tu suscripción.",
  unexpectedMessage:
    "No pudimos confirmar tu suscripción en este momento. Seguimos intentando.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

const CACHE_CONTROL_HEADER = "Cache-Control";
const NO_STORE_CACHE_CONTROL = "private, no-store";

/**
 * JSON response that no shared cache may store (the status is per member).
 */
function createJsonResponse(body: unknown, status: number): Response {
  const response = Response.json(body, { status });

  response.headers.set(CACHE_CONTROL_HEADER, NO_STORE_CACHE_CONTROL);

  return response;
}

function createUnexpectedResponse(status: number): Response {
  return createJsonResponse(
    { message: SUBSCRIPTION_RETURN_STATUS_ROUTE_RESPONSE.unexpectedMessage },
    status
  );
}

function rejectInput(
  logger: ServerLogger,
  part: string,
  error: z.ZodError
): Response {
  logger.warn({
    message: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.inputRejectedMessage,
    metadata: { issues: summarizeValidationIssues(error.issues), part },
  });

  return createJsonResponse(
    { message: SUBSCRIPTION_RETURN_STATUS_ROUTE_RESPONSE.invalidInputMessage },
    HTTP_STATUS.badRequest
  );
}

/**
 * Validates the public DTO and sends only its parsed value; an unusable DTO
 * is logged (paths and codes only) and becomes the safe 500.
 */
function createPublicResponse(
  body: SubscriptionReturnStatusResult,
  logger: ServerLogger,
  metadata: Record<string, unknown>
): Response {
  const parsed = subscriptionReturnStatusSchema.safeParse(body);

  if (!parsed.success) {
    logger.error({
      message: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.publicDtoRejectedMessage,
      metadata: {
        ...metadata,
        issues: summarizeValidationIssues(parsed.error.issues),
        reason: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.publicDtoRejectedReason,
      },
    });

    return createUnexpectedResponse(HTTP_STATUS.serverError);
  }

  return createJsonResponse(parsed.data, HTTP_STATUS.ok);
}

function readQueryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.feature,
    operation: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.operation,
    requestId,
  });
  const params = subscriptionReturnStatusParamsSchema.safeParse(
    await context.params
  );

  if (!params.success) {
    return rejectInput(logger, "params", params.error);
  }

  const query = subscriptionReturnStatusQuerySchema.safeParse(
    readQueryObject(request)
  );

  if (!query.success) {
    return rejectInput(logger, "query", query.error);
  }

  const tribeSlug = params.data.slug;
  const providerSubscriptionId =
    query.data[SUBSCRIPTION_RETURN_QUERY_PARAM.mercadoPagoPreapprovalId];
  const returnPath = buildSubscriptionReturnPath(
    tribeSlug,
    providerSubscriptionId
  );
  const traceMetadata = {
    operation_key:
      SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.operation +
      SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.operationKeySeparator +
      tribeSlug,
    preapprovalId: redactPaymentProviderIdentifier(providerSubscriptionId),
    requestId,
    tribeSlug,
  };
  let access: Awaited<ReturnType<typeof resolveTribePageAccess>>;

  try {
    access = await resolveTribePageAccess({
      operation: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.operation,
      slug: tribeSlug,
    });
  } catch (error) {
    logger.error({
      error,
      message: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.accessFailureMessage,
      metadata: traceMetadata,
    });

    return createUnexpectedResponse(HTTP_STATUS.serverError);
  }

  const { authenticatedMember, modules, result: accessResult } = access;

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: SUBSCRIPTION_RETURN_STATUS_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  const metadata = { ...traceMetadata, viewerId: authenticatedMember.id };

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.visible) {
    return createPublicResponse(
      {
        redirectPath: ROUTES.tribes.welcome(tribeSlug),
        status: SUBSCRIPTION_RETURN_STATUS.resolved,
      },
      logger,
      metadata
    );
  }

  // Any hidden access that a payment cannot recover (conduct block, not a
  // member, unknown tribe) goes back to the page, which owns that screen.
  if (!isSubscriptionRecoverableAccess(accessResult)) {
    return createPublicResponse(
      { redirectPath: returnPath, status: SUBSCRIPTION_RETURN_STATUS.resolved },
      logger,
      metadata
    );
  }

  let outcome: Awaited<ReturnType<typeof resolveSubscriptionReturnOutcome>>;

  try {
    outcome = await resolveSubscriptionReturnOutcome({
      modules,
      providerSubscriptionId,
      requestId,
      tribeSlug,
    });
  } catch (error) {
    outcome = { error, kind: SUBSCRIPTION_RETURN_OUTCOME.failed };
  }

  switch (outcome.kind) {
    case SUBSCRIPTION_RETURN_OUTCOME.redirect:
      return createPublicResponse(
        {
          redirectPath: outcome.path,
          status: SUBSCRIPTION_RETURN_STATUS.resolved,
        },
        logger,
        metadata
      );
    case SUBSCRIPTION_RETURN_OUTCOME.pending:
      return createPublicResponse(
        { status: SUBSCRIPTION_RETURN_STATUS.pending },
        logger,
        metadata
      );
    case SUBSCRIPTION_RETURN_OUTCOME.failed:
      logger.error({
        error: outcome.error,
        message: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.resolveFailureMessage,
        metadata: {
          ...metadata,
          reason: SUBSCRIPTION_RETURN_STATUS_ROUTE_LOG.resolveFailureReason,
          result: SUBSCRIPTION_RETURN_OUTCOME.failed,
        },
      });

      return createUnexpectedResponse(HTTP_STATUS.serviceUnavailable);
    case SUBSCRIPTION_RETURN_OUTCOME.unresolved:
    default:
      return createPublicResponse(
        { redirectPath: returnPath, status: SUBSCRIPTION_RETURN_STATUS.resolved },
        logger,
        metadata
      );
  }
}
