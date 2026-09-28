/**
 * POST /api/tribes/[slug]/academy/bonuses — leader bonus (idempotent by key).
 * A bonus for an unverified member requires the explicit exception flag, and
 * the response warns when the recipient still has an active renewal (the
 * bonus never stops or refunds those charges).
 *
 * @module academy-bonuses-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyGrantDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyBonusResultDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
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
  academyBonusBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-bonus-grant";

const BONUS_FAILURE_RESPONSE = {
  forbidden: { message: ACADEMY_ROUTE_MESSAGE.forbidden, status: ACADEMY_HTTP_STATUS.forbidden },
  idempotency_conflict: {
    message: ACADEMY_ROUTE_COPY.idempotencyConflict,
    status: ACADEMY_HTTP_STATUS.conflict,
  },
  invalid_input: { message: ACADEMY_ROUTE_MESSAGE.invalidInput, status: ACADEMY_HTTP_STATUS.badRequest },
  not_academy: { message: ACADEMY_ROUTE_COPY.notAcademy, status: ACADEMY_HTTP_STATUS.conflict },
  not_found: { message: ACADEMY_ROUTE_MESSAGE.notFound, status: ACADEMY_HTTP_STATUS.notFound },
  recipient_not_eligible: {
    message: ACADEMY_ROUTE_COPY.recipientNotEligible,
    status: ACADEMY_HTTP_STATUS.unprocessable,
  },
  recipient_not_verified: {
    message: ACADEMY_ROUTE_COPY.recipientNotVerified,
    status: ACADEMY_HTTP_STATUS.unprocessable,
  },
  replaced_grant_not_found: {
    message: ACADEMY_ROUTE_COPY.replacedGrantNotFound,
    status: ACADEMY_HTTP_STATUS.conflict,
  },
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
    schema: academyBonusBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  try {
    const result = await scope.modules.productAccess.useCases.grantAcademyBonus({
      allowUnverifiedRecipient: body.data.allowUnverifiedRecipient,
      correlationId: scope.requestId,
      endsAt: new Date(body.data.endsAt),
      idempotencyKey: body.data.idempotencyKey,
      reason: body.data.reason,
      recipientUserId: body.data.recipientUserId,
      replacesGrantId: body.data.replacesGrantId,
      tribeSlug: params.data.slug,
    });

    if (result.status === "created" || result.status === "replayed") {
      return createAcademyPublicResponse({
        body: {
          grant: toAcademyGrantDto(result.grant),
          hasActiveRenewal: result.hasActiveRenewal,
          status: result.status,
        },
        logger: scope.logger,
        metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
        schema: academyBonusResultDtoSchema,
        status: result.status === "created" ? ACADEMY_HTTP_STATUS.created : ACADEMY_HTTP_STATUS.ok,
      });
    }

    const failure = BONUS_FAILURE_RESPONSE[result.status];

    return createAcademyJsonResponse(
      { message: failure.message, status: result.status },
      failure.status
    );
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy bonus grant failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
