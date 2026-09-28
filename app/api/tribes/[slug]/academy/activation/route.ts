/**
 * POST /api/tribes/[slug]/academy/activation — the active leader switches the
 * tribe to academy mode from the tribe settings. Current members keep full
 * access; admissions and sales start closed. A stale config version returns
 * 409 with the current settings.
 *
 * @module academy-activation-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
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
  academyActivationBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-activation";

const ACTIVATION_STATUS = {
  activated: ACADEMY_HTTP_STATUS.ok,
  already_academy: ACADEMY_HTTP_STATUS.ok,
  conflict: ACADEMY_HTTP_STATUS.conflict,
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
    schema: academyActivationBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  const metadata = { requestId: scope.requestId, tribeSlug: params.data.slug };

  try {
    const result = await scope.modules.productAccess.useCases.activateAcademy({
      expectedConfigVersion: body.data.expectedConfigVersion,
      tribeSlug: params.data.slug,
    });

    switch (result.status) {
      case "activated":
      case "already_academy":
      case "conflict":
        scope.logger.info({
          message: "Academy activation processed",
          metadata: { ...metadata, result: result.status },
        });

        return createAcademyPublicResponse({
          body: toAcademySettingsDto(result.settings),
          logger: scope.logger,
          metadata,
          schema: academySettingsDtoSchema,
          status: ACTIVATION_STATUS[result.status],
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
      message: "Academy activation failed",
      metadata,
    });
  }
}
