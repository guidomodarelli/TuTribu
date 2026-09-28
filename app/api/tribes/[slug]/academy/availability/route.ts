/**
 * PUT /api/tribes/[slug]/academy/availability — opens or pauses admissions
 * and sales. Pausing never cancels renewals, grants or bonuses, and never
 * relaxes the paywall.
 *
 * @module academy-availability-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
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
  academyAvailabilityBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-availability";

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
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
    schema: academyAvailabilityBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  try {
    const result = await scope.modules.productAccess.useCases.setAcademyAvailability({
      ...body.data,
      correlationId: scope.requestId,
      tribeSlug: params.data.slug,
    });

    switch (result.status) {
      case "updated":
      case "conflict":
        return createAcademyPublicResponse({
          body: toAcademySettingsDto(result.settings),
          logger: scope.logger,
          metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
          schema: academySettingsDtoSchema,
          status:
            result.status === "updated" ? ACADEMY_HTTP_STATUS.ok : ACADEMY_HTTP_STATUS.conflict,
        });
      case "sales_activation_disabled":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.salesActivationDisabled },
          ACADEMY_HTTP_STATUS.conflict
        );
      case "not_academy":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.notAcademy },
          ACADEMY_HTTP_STATUS.conflict
        );
      case "forbidden":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.forbidden },
          ACADEMY_HTTP_STATUS.forbidden
        );
      default:
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.notFound },
          ACADEMY_HTTP_STATUS.notFound
        );
    }
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy availability update failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
