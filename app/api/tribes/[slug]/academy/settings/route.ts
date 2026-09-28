/**
 * GET/PUT /api/tribes/[slug]/academy/settings — academy offer configuration
 * (active leader only; enforced again in SQL).
 *
 * @module academy-settings-route
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
  academyOfferBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-settings";

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
    const settings = await scope.modules.productAccess.useCases.getAcademySettings({
      tribeSlug: params.data.slug,
    });

    if (!settings) {
      return createAcademyJsonResponse(
        { message: ACADEMY_ROUTE_MESSAGE.notFound },
        ACADEMY_HTTP_STATUS.notFound
      );
    }

    return createAcademyPublicResponse({
      body: toAcademySettingsDto(settings),
      logger: scope.logger,
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
      schema: academySettingsDtoSchema,
      status: ACADEMY_HTTP_STATUS.ok,
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy settings read failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}

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
    schema: academyOfferBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  try {
    const result = await scope.modules.productAccess.useCases.saveAcademyOffer({
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
      case "invalid_input":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.invalidInput },
          ACADEMY_HTTP_STATUS.badRequest
        );
      case "forbidden":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.forbidden },
          ACADEMY_HTTP_STATUS.forbidden
        );
      case "not_academy":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.notAcademy },
          ACADEMY_HTTP_STATUS.conflict
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
      message: "Academy offer save failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
