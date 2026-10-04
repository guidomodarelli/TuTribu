/**
 * POST /api/tribes/[slug]/academy/checkout — academy checkout for an existing
 * member (never creates a membership). A pending checkout is reused, and an
 * ambiguous provider timeout never produces a second subscription.
 *
 * @module academy-checkout-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { academyCheckoutDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyJsonBody,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyCheckoutBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-checkout";

const CHECKOUT_FAILURE_RESPONSE = {
  checkout_unresolved: { message: ACADEMY_ROUTE_COPY.checkoutUnresolved, status: ACADEMY_HTTP_STATUS.conflict },
  already_subscribed: { message: ACADEMY_ROUTE_COPY.alreadySubscribed, status: ACADEMY_HTTP_STATUS.conflict },
  covered: { message: ACADEMY_ROUTE_COPY.covered, status: ACADEMY_HTTP_STATUS.conflict },
  forbidden: { message: ACADEMY_ROUTE_MESSAGE.forbidden, status: ACADEMY_HTTP_STATUS.forbidden },
  invalid_input: { message: ACADEMY_ROUTE_MESSAGE.invalidInput, status: ACADEMY_HTTP_STATUS.badRequest },
  not_eligible: { message: ACADEMY_ROUTE_COPY.notEligible, status: ACADEMY_HTTP_STATUS.unprocessable },
  not_found: { message: ACADEMY_ROUTE_MESSAGE.notFound, status: ACADEMY_HTTP_STATUS.notFound },
  offer_changed: { message: ACADEMY_ROUTE_COPY.offerChanged, status: ACADEMY_HTTP_STATUS.conflict },
  provider_unavailable: {
    message: ACADEMY_ROUTE_COPY.checkoutUnavailable,
    status: ACADEMY_HTTP_STATUS.serviceUnavailable,
  },
  sales_closed: { message: ACADEMY_ROUTE_COPY.salesClosed, status: ACADEMY_HTTP_STATUS.conflict },
} as const;

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const scope = await openAcademyRouteScope({ operation: OPERATION, request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const params = parseAcademyRouteInput({
    logger: scope.logger,
    part: "params",
    schema: academyTribeParamsSchema,
    value: await context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  const body = parseAcademyRouteInput({
    logger: scope.logger,
    part: "body",
    schema: academyCheckoutBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  try {
    const result = await scope.modules.subscriptions.useCases.startAcademySubscription({
      acceptedOfferVersion: body.data.acceptedOfferVersion,
      correlationId: scope.requestId,
      tribeSlug: params.data.slug,
    });

    if (result.status === "redirect") {
      return createAcademyPublicResponse({
        body: { checkoutUrl: result.checkoutUrl },
        logger: scope.logger,
        metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
        schema: academyCheckoutDtoSchema,
        status: ACADEMY_HTTP_STATUS.ok,
      });
    }

    const failure = CHECKOUT_FAILURE_RESPONSE[result.status];

    if (result.status === "provider_unavailable" || result.status === "checkout_unresolved") {
      scope.logger.warn({
        message: "Academy checkout provider unavailable",
        metadata: { requestId: scope.requestId, tribeSlug: params.data.slug, checkoutStatus: result.status },
      });
    }

    return createAcademyJsonResponse(
      { message: failure.message, status: result.status },
      failure.status
    );
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy checkout failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
