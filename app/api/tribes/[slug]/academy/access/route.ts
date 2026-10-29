/**
 * GET /api/tribes/[slug]/academy/access — own academy status.
 *
 * @module academy-access-route
 */

import {
  createAcademyNotFoundResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyAccessStatusDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyAccessStatusDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-access";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy access read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema },
    },
    async ({ modules, params, respond }) => {
      const result = await modules.productAccess.useCases.getOwnAcademyAccess({
        tribeSlug: params.slug,
      });

      if (result.status === "not_found") {
        return createAcademyNotFoundResponse();
      }

      return respond(
        toAcademyAccessStatusDto(result.access, result.accessModel),
        academyAccessStatusDtoSchema,
        ACADEMY_HTTP_STATUS.ok
      );
    }
  );
}
