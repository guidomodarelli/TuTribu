/**
 * GET/PUT /api/tribes/[slug]/academy/settings — academy offer configuration
 * (active leader only; enforced again in SQL).
 *
 * @module academy-settings-route
 */

import {
  createAcademyNotFoundResponse,
  createAcademySettingsMutationResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyOfferBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-settings";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy settings read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema },
    },
    async ({ modules, params, respond }) => {
      const settings = await modules.productAccess.useCases.getAcademySettings({
        tribeSlug: params.slug,
      });

      if (!settings) {
        return createAcademyNotFoundResponse();
      }

      return respond(toAcademySettingsDto(settings), academySettingsDtoSchema, ACADEMY_HTTP_STATUS.ok);
    }
  );
}

export async function PUT(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy offer save failed",
      operation: OPERATION,
      schemas: { body: academyOfferBodySchema, params: academyTribeParamsSchema },
    },
    async (route) => {
      const result = await route.modules.productAccess.useCases.saveAcademyOffer({
        ...route.body,
        correlationId: route.requestId,
        tribeSlug: route.params.slug,
      });

      return createAcademySettingsMutationResponse(route, result);
    }
  );
}
