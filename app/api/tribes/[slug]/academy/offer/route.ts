/**
 * GET /api/tribes/[slug]/academy/offer — minimum public offer data.
 *
 * @module academy-offer-route
 */

import {
  createAcademyNotFoundResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyOfferDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyOfferDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-offer";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy offer read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema },
    },
    async ({ modules, params, respond }) => {
      const offer = await modules.productAccess.useCases.getAcademyPublicOffer({
        tribeSlug: params.slug,
      });

      if (!offer) {
        return createAcademyNotFoundResponse();
      }

      return respond(toAcademyOfferDto(offer), academyOfferDtoSchema, ACADEMY_HTTP_STATUS.ok);
    }
  );
}
