/**
 * POST /api/tribes/[slug]/academy/bonuses — leader bonus (idempotent by key).
 * A bonus for an unverified member requires the explicit exception flag, and
 * the response warns when the recipient still has an active renewal (the
 * bonus never stops or refunds those charges).
 *
 * @module academy-bonuses-route
 */

import {
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyGrantDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyBonusResultDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
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

export async function POST(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy bonus grant failed",
      operation: OPERATION,
      schemas: { body: academyBonusBodySchema, params: academyTribeParamsSchema },
    },
    async ({ body, modules, params, requestId, respond }) => {
      const result = await modules.productAccess.useCases.grantAcademyBonus({
        allowUnverifiedRecipient: body.allowUnverifiedRecipient,
        correlationId: requestId,
        endsAt: new Date(body.endsAt),
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
        recipientUserId: body.recipientUserId,
        replacesGrantId: body.replacesGrantId,
        tribeSlug: params.slug,
      });

      if (result.status === "created" || result.status === "replayed") {
        return respond(
          {
            grant: toAcademyGrantDto(result.grant),
            hasActiveRenewal: result.hasActiveRenewal,
            status: result.status,
          },
          academyBonusResultDtoSchema,
          result.status === "created" ? ACADEMY_HTTP_STATUS.created : ACADEMY_HTTP_STATUS.ok
        );
      }

      const failure = BONUS_FAILURE_RESPONSE[result.status];

      return createAcademyJsonResponse(
        { message: failure.message, status: result.status },
        failure.status
      );
    }
  );
}
