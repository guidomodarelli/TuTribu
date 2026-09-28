/**
 * GET /api/tribes/[slug]/academy/access — own academy status.
 *
 * @module academy-access-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyAccessStatusDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyAccessStatusDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-access";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
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
    const result = await scope.modules.productAccess.useCases.getOwnAcademyAccess({
      tribeSlug: params.data.slug,
    });

    if (result.status === "not_found") {
      return createAcademyJsonResponse(
        { message: ACADEMY_ROUTE_MESSAGE.notFound },
        ACADEMY_HTTP_STATUS.notFound
      );
    }

    return createAcademyPublicResponse({
      body: toAcademyAccessStatusDto(result.access, result.accessModel),
      logger: scope.logger,
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
      schema: academyAccessStatusDtoSchema,
      status: ACADEMY_HTTP_STATUS.ok,
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy access read failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
