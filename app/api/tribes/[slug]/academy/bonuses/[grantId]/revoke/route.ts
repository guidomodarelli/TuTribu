/**
 * POST /api/tribes/[slug]/academy/bonuses/[grantId]/revoke — revokes one
 * leader bonus. Other sources (paid periods, other bonuses) stay untouched.
 *
 * @module academy-bonus-revoke-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyJsonBody,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyGrantParamsSchema,
  academyRevokeBodySchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-bonus-revoke";

const REVOKE_RESPONSE = {
  already_revoked: { message: ACADEMY_ROUTE_COPY.alreadyRevoked, status: ACADEMY_HTTP_STATUS.ok },
  forbidden: { message: ACADEMY_ROUTE_MESSAGE.forbidden, status: ACADEMY_HTTP_STATUS.forbidden },
  invalid_input: { message: ACADEMY_ROUTE_MESSAGE.invalidInput, status: ACADEMY_HTTP_STATUS.badRequest },
  not_found: { message: ACADEMY_ROUTE_MESSAGE.notFound, status: ACADEMY_HTTP_STATUS.notFound },
  revoked: { message: ACADEMY_ROUTE_COPY.bonusRevoked, status: ACADEMY_HTTP_STATUS.ok },
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ grantId: string; slug: string }> }
) {
  const scope = await openAcademyRouteScope({ operation: OPERATION, request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const params = parseAcademyRouteInput({
    logger: scope.logger,
    part: "params",
    schema: academyGrantParamsSchema,
    value: await context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  const body = parseAcademyRouteInput({
    logger: scope.logger,
    part: "body",
    schema: academyRevokeBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  try {
    const result = await scope.modules.productAccess.useCases.revokeAcademyBonus({
      correlationId: scope.requestId,
      grantId: params.data.grantId,
      reason: body.data.reason,
      tribeSlug: params.data.slug,
    });
    const response = REVOKE_RESPONSE[result.status];

    return createAcademyJsonResponse(
      { message: response.message, status: result.status },
      response.status
    );
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy bonus revoke failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
