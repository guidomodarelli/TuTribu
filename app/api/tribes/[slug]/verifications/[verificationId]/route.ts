/**
 * PATCH /api/tribes/[slug]/verifications/[verificationId] — reviewer decision
 * with the expected version (compare-and-swap). A decision taken on a state
 * that already changed returns 409 with the current state.
 *
 * @module tribe-verification-decision-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toReviewQueueItemDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import { reviewQueueItemDtoSchema } from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
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
  verificationDecisionBodySchema,
  verificationParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "member-verification-decision";

const DECISION_STATUS = {
  conflict: ACADEMY_HTTP_STATUS.conflict,
  invalid_transition: ACADEMY_HTTP_STATUS.conflict,
  updated: ACADEMY_HTTP_STATUS.ok,
} as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string; verificationId: string }> }
) {
  const scope = await openAcademyRouteScope({ operation: OPERATION, request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const params = parseAcademyRouteInput({
    logger: scope.logger,
    part: "params",
    schema: verificationParamsSchema,
    value: await context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  const body = parseAcademyRouteInput({
    logger: scope.logger,
    part: "body",
    schema: verificationDecisionBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  const metadata = {
    requestId: scope.requestId,
    tribeSlug: params.data.slug,
    verificationId: params.data.verificationId,
  };

  try {
    const result = await scope.modules.memberVerifications.useCases.reviewMemberVerification({
      correlationId: scope.requestId,
      decision: body.data.decision,
      expectedVersion: body.data.expectedVersion,
      reason: body.data.reason,
      tribeSlug: params.data.slug,
      verificationId: params.data.verificationId,
    });

    switch (result.status) {
      case "updated":
      case "conflict":
      case "invalid_transition":
        return createAcademyPublicResponse({
          body: toReviewQueueItemDto(result.verification),
          logger: scope.logger,
          metadata: { ...metadata, result: result.status },
          schema: reviewQueueItemDtoSchema,
          status: DECISION_STATUS[result.status],
        });
      case "reason_required":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.reasonRequired },
          ACADEMY_HTTP_STATUS.unprocessable
        );
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
      message: "Member verification decision failed",
      metadata,
    });
  }
}
