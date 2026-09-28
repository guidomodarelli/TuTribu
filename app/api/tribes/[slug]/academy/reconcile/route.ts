/**
 * POST /api/tribes/[slug]/academy/reconcile — self-service reconciliation of
 * the own academy coverage with the provider (throttled per subscription).
 *
 * @module academy-reconcile-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-reconcile";

const RECONCILE_RESPONSE = {
  not_found: { message: ACADEMY_ROUTE_MESSAGE.notFound, status: ACADEMY_HTTP_STATUS.notFound },
  provider_unavailable: {
    message: ACADEMY_ROUTE_MESSAGE.providerUnavailable,
    status: ACADEMY_HTTP_STATUS.serviceUnavailable,
  },
  reconciled: { message: null, status: ACADEMY_HTTP_STATUS.ok },
  throttled: { message: ACADEMY_ROUTE_COPY.reconcileThrottled, status: ACADEMY_HTTP_STATUS.ok },
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

  try {
    const result = await scope.modules.subscriptions.useCases.reconcileOwnAcademyCoverage({
      correlationId: scope.requestId,
      tribeSlug: params.data.slug,
    });
    const response = RECONCILE_RESPONSE[result.status];

    return createAcademyJsonResponse(
      { message: response.message, status: result.status },
      response.status
    );
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy reconciliation failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
