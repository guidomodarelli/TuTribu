/**
 * POST /api/tribes/[slug]/academy/reconcile — self-service reconciliation of
 * the own academy coverage with the provider (throttled per subscription).
 *
 * @module academy-reconcile-route
 */

import {
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
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

export async function POST(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy reconciliation failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema },
    },
    async ({ modules, params, requestId }) => {
      const result = await modules.subscriptions.useCases.reconcileOwnAcademyCoverage({
        correlationId: requestId,
        tribeSlug: params.slug,
      });
      const response = RECONCILE_RESPONSE[result.status];

      return createAcademyJsonResponse(
        { message: response.message, status: result.status },
        response.status
      );
    }
  );
}
