/**
 * PUT /api/tribes/[slug]/academy/availability — opens or pauses admissions
 * and sales. Pausing never cancels renewals, grants or bonuses, and never
 * relaxes the paywall.
 *
 * @module academy-availability-route
 */

import {
  createAcademySettingsMutationResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import {
  academyAvailabilityBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-availability";

export async function PUT(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy availability update failed",
      operation: OPERATION,
      schemas: { body: academyAvailabilityBodySchema, params: academyTribeParamsSchema },
    },
    async (route) => {
      const result = await route.modules.productAccess.useCases.setAcademyAvailability({
        ...route.body,
        correlationId: route.requestId,
        tribeSlug: route.params.slug,
      });

      return createAcademySettingsMutationResponse(route, result);
    }
  );
}
