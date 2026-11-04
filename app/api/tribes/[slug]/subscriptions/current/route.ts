/**
 * Handles current member subscription self-management.
 *
 * @module tribe-current-member-subscription-route
 */

import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { academyCancelRenewalDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import { createRequestModules } from "@/src/modules/setup";
import { summarizeErrorCauses } from "@/src/modules/shared/infrastructure/observability/error-cause-summary";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const CURRENT_SUBSCRIPTION_ROUTE_LOG = {
  academyCancelNotConfirmedMessage: "Academy renewal cancellation was not confirmed by the provider",
  cancelFailureMessage: "Current member subscription cancellation failed",
  feature: "subscriptions",
  operation: "cancel-current-member-subscription",
} as const;

const CURRENT_SUBSCRIPTION_ROUTE_RESPONSE = {
  canceledMessage: "Cancelamos tu suscripción.",
  notFoundMessage: "No encontramos una suscripción vigente para cancelar.",
  providerUnavailableMessage:
    "No pudimos contactar a Mercado Pago. Intentá de nuevo más tarde.",
  unauthorizedMessage: "Iniciá sesión para gestionar tu suscripción.",
  unexpectedMessage: "No pudimos cancelar la suscripción. Intentá de nuevo.",
} as const;

/** `?product=academy` cancels the academy renewal instead of the membership. */
const PRODUCT_QUERY_PARAM = "product";
const ACADEMY_PRODUCT = "academy";

/** The cancellation is recorded but the provider has not confirmed it yet. */
const HTTP_STATUS_ACCEPTED = 202;
/** The provider definitively refused the cancellation. */
const HTTP_STATUS_UNPROCESSABLE = 422;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

type CancelOwnTribeMemberSubscriptionResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["cancelOwnTribeMemberSubscription"]>
>;

type CancelOwnAcademyRenewalResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["cancelOwnAcademyRenewal"]>
>;

function createDeleteResultResponse(result: CancelOwnTribeMemberSubscriptionResult): Response {
  switch (result.status) {
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled:
      return createJsonResponse(
        { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.canceledMessage },
        HTTP_STATUS.ok
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable:
      return createJsonResponse(
        {
          message:
            CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.providerUnavailableMessage,
        },
        HTTP_STATUS.serviceUnavailable
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound:
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.active:
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice:
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused:
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending:
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription:
    default:
      return createJsonResponse(
        { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
  }
}

/**
 * Status and copy of each academy renewal cancellation outcome. Only a
 * confirmed or recorded cancellation is a 2xx; a definite refusal is not a 5xx,
 * because nothing was applied.
 */
const ACADEMY_CANCEL_RESPONSE: Record<CancelOwnAcademyRenewalResult["status"], { message: string; status: number }> = {
  cancel_unconfirmed: { message: ACADEMY_ROUTE_COPY.cancelUnconfirmed, status: HTTP_STATUS_ACCEPTED },
  canceled: { message: ACADEMY_ROUTE_COPY.cancelConfirmed, status: HTTP_STATUS.ok },
  integration_unavailable: { message: ACADEMY_ROUTE_COPY.cancelIntegrationUnavailable, status: HTTP_STATUS.conflict },
  not_found: { message: ACADEMY_ROUTE_COPY.cancelNotFound, status: HTTP_STATUS.notFound },
  provider_rejected: { message: ACADEMY_ROUTE_COPY.cancelRejected, status: HTTP_STATUS_UNPROCESSABLE },
  provider_unavailable: { message: ACADEMY_ROUTE_COPY.cancelUnavailable, status: HTTP_STATUS.serviceUnavailable },
};

/**
 * Answers an academy renewal cancellation; a successful body is validated
 * against its public DTO.
 */
function createAcademyCancelResponse(result: CancelOwnAcademyRenewalResult): Response {
  const response = ACADEMY_CANCEL_RESPONSE[result.status];

  if (result.status === "canceled" || result.status === "cancel_unconfirmed") {
    return createJsonResponse(
      academyCancelRenewalDtoSchema.parse({ message: response.message, status: result.status }),
      response.status
    );
  }

  return createJsonResponse({ message: response.message, status: result.status }, response.status);
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CURRENT_SUBSCRIPTION_ROUTE_LOG.feature,
    operation: CURRENT_SUBSCRIPTION_ROUTE_LOG.operation,
    requestId,
  });
  let slug: string | null = null;
  let viewerId: string | null = null;

  // Composition and the session read stay inside the boundary: a pool or auth
  // outage answers the same logged JSON 500 as any other failure.
  try {
    ({ slug } = await context.params);
    const modules = await createRequestModules({
      mercadoPagoWebhookVerified: true,
      requestId,
    });
    const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

    if (!authenticatedMember) {
      return createJsonResponse(
        { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    viewerId = authenticatedMember.id;

    if (new URL(request.url).searchParams.get(PRODUCT_QUERY_PARAM) === ACADEMY_PRODUCT) {
      // Academy renewal: stops future charges only; the access already paid
      // stays until it ends, and membership, role and progress are untouched.
      const academyResult = await modules.subscriptions.useCases.cancelOwnAcademyRenewal({
        correlationId: requestId,
        tribeSlug: slug,
      });

      if ("cause" in academyResult) {
        logger.warn({
          message: CURRENT_SUBSCRIPTION_ROUTE_LOG.academyCancelNotConfirmedMessage,
          metadata: {
            cancelStatus: academyResult.status,
            causes: summarizeErrorCauses(academyResult.cause),
            requestId,
            slug,
            viewerId,
          },
        });
      }

      return createAcademyCancelResponse(academyResult);
    }

    const result =
      await modules.subscriptions.useCases.cancelOwnTribeMemberSubscription({
        tribeSlug: slug,
      });

    return createDeleteResultResponse(result);
  } catch (error) {
    logger.error({
      message: CURRENT_SUBSCRIPTION_ROUTE_LOG.cancelFailureMessage,
      error,
      metadata: {
        causes: summarizeErrorCauses(error),
        requestId,
        slug,
        viewerId,
      },
    });

    return createJsonResponse(
      { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
